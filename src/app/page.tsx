"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateScores,
  formatSpeed,
  measureDownload,
  measurePing,
  measureUpload,
  type Phase,
  type SpeedTestResults,
} from "@/lib/speedtest";
import Speedometer from "@/components/Speedometer";

interface ServerInfo {
  ip: string;
  lanIp: string | null;
  city: string;
  country: string;
  asn: string;
  isp: string;
  serverLocation: string;
  colo: string;
}

/** (kept for future use) */

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Paused",
  latency: "Measuring latency…",
  download: "Measuring download…",
  upload: "Measuring upload…",
  loss: "Measuring packet loss…",
  done: "Complete",
};

const PHASE_ORDER: Phase[] = ["latency", "download", "upload", "loss"];

function CloudMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M36.5 31.5h-20a7.5 7.5 0 0 1-1.6-14.83 10.5 10.5 0 0 1 20.4-2.3 8.25 8.25 0 0 1 1.2 17.13Z"
        fill="#F6821F"
      />
      <path
        d="M14 36.5h24a5 5 0 0 0 .9-9.92A8.25 8.25 0 0 0 34.8 14.4a10.5 10.5 0 0 0-20.4 2.3A7.5 7.5 0 0 0 16.5 31.5"
        stroke="#fff"
        strokeWidth="1.6"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  unit,
  subLeft,
  subRight,
  active,
}: {
  label: string;
  value: string;
  unit: string;
  subLeft?: string;
  subRight?: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white px-4 py-4 text-center transition-shadow sm:px-5 ${
        active ? "border-orange-300 shadow-[0_0_0_3px_rgba(246,130,31,0.15)]" : "border-gray-200"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
        {label}
      </div>
      <div className="tabular mt-1 flex items-baseline justify-center gap-1">
        <span className="text-3xl font-bold text-gray-900 sm:text-4xl">{value}</span>
        <span className="text-sm font-medium text-gray-500">{unit}</span>
      </div>
      <div className="tabular mt-1 flex items-center justify-center gap-2 text-xs text-gray-400">
        {subLeft !== undefined && <span>{subLeft}</span>}
        {subRight !== undefined && (
          <>
            <span className="h-3 w-px bg-gray-200" />
            <span>{subRight}</span>
          </>
        )}
      </div>
    </div>
  );
}

function starsFor(pct: number): number {
  return Math.max(0, Math.min(5, Math.round(pct / 20)));
}

function Stars({ pct, pending }: { pct: number; pending: boolean }) {
  const n = pending ? 0 : starsFor(pct);
  return (
    <div className="flex items-center justify-center gap-0.5 text-sm leading-none" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? "text-orange-400" : "text-gray-200"}>
          ★
        </span>
      ))}
    </div>
  );
}

function ScoreRow({
  icon,
  title,
  detail,
  pct,
  pending,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  pct: number;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-gray-50 px-2 py-3 text-center">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-orange-500">
        {icon}
      </div>
      <div className="mt-1.5 text-xs font-bold text-gray-900">{title}</div>
      <div className="mt-1">
        <Stars pct={pct} pending={pending} />
      </div>
      <div className="mt-1 max-w-full truncate text-[11px] text-gray-500">
        {pending ? "Pending" : detail}
      </div>
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [liveMbps, setLiveMbps] = useState(0);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SpeedTestResults>({
    downloadMbps: null,
    uploadMbps: null,
    latencyMs: null,
    loadedLatencyMs: null,
    jitterMs: null,
    packetLossPct: null,
  });
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const cancelRef = useRef(false);

  const scores = useMemo(() => calculateScores(results), [results]);
  const done = phase === "done";

  useEffect(() => {
    fetch("/api/server-info")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => {});
  }, []);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-60), `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const runTest = useCallback(async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setPhase("latency");
    setProgress(2);
    setLiveMbps(0);
    setLog([]);
    setResults({
      downloadMbps: null,
      uploadMbps: null,
      latencyMs: null,
      loadedLatencyMs: null,
      jitterMs: null,
      packetLossPct: null,
    });

    try {
      // 1 — Latency / jitter
      pushLog("Measuring unloaded latency (15 pings)…");
      const ping1 = await measurePing(15);
      if (cancelRef.current) return;
      setResults((p) => ({
        ...p,
        latencyMs: ping1.latency,
        jitterMs: ping1.jitter,
        packetLossPct: ping1.loss,
      }));
      pushLog(
        `Latency ${ping1.latency.toFixed(1)} ms · jitter ${ping1.jitter.toFixed(1)} ms · loss ${ping1.loss.toFixed(1)}%`
      );
      setProgress(15);

      // 2 — Download (~10s)
      setPhase("download");
      pushLog("Measuring download (parallel streams, ~10s)…");
      const dl = await measureDownload((mbps, doneBytes) => {
        setLiveMbps(mbps);
        setProgress(15 + Math.min(45, (doneBytes / 40_000_000) * 45));
      }, 10000);
      if (cancelRef.current) return;
      setResults((p) => ({ ...p, downloadMbps: dl }));
      pushLog(`Download ${dl.toFixed(1)} Mbps`);
      setProgress(60);

      // Loaded latency during/after load
      pushLog("Measuring loaded latency…");
      const pingLoaded = await measurePing(6);
      if (cancelRef.current) return;
      setResults((p) => ({ ...p, loadedLatencyMs: pingLoaded.latency }));
      pushLog(`Loaded latency ${pingLoaded.latency.toFixed(1)} ms`);
      setProgress(66);

      // 3 — Upload (~8s)
      setPhase("upload");
      pushLog("Measuring upload (~8s)…");
      const ul = await measureUpload((mbps) => {
        setLiveMbps(mbps);
      }, 8000);
      if (cancelRef.current) return;
      setResults((p) => ({ ...p, uploadMbps: ul }));
      pushLog(`Upload ${ul.toFixed(1)} Mbps`);
      setProgress(90);

      // 4 — Packet loss confirmation
      setPhase("loss");
      pushLog("Confirming packet loss (10 pings)…");
      const ping2 = await measurePing(10);
      if (cancelRef.current) return;
      setResults((p) => ({
        ...p,
        packetLossPct: Math.max(p.packetLossPct ?? 0, ping2.loss),
        jitterMs: p.jitterMs !== null ? (p.jitterMs + ping2.jitter) / 2 : ping2.jitter,
      }));
      pushLog("Test complete");
      setProgress(100);
      setPhase("done");
      setLiveMbps(0);
    } finally {
      if (cancelRef.current) {
        setPhase("idle");
        pushLog("Test cancelled");
      }
      setRunning(false);
      setLiveMbps(0);
    }
  }, [pushLog, running]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setRunning(false);
    setPhase("idle");
    setProgress(0);
    setLiveMbps(0);
    setResults({
      downloadMbps: null,
      uploadMbps: null,
      latencyMs: null,
      loadedLatencyMs: null,
      jitterMs: null,
      packetLossPct: null,
    });
    setLog([]);
  }, []);

  const fmtMs = (v: number | null) => (v === null ? "-" : v < 10 ? v.toFixed(1) : Math.round(v).toString());
  const fmtPct = (v: number | null) => (v === null ? "-" : v.toFixed(v < 1 && v > 0 ? 1 : 0));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Top nav like speed.cloudflare.com */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <CloudMark />
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-tight text-gray-900">
                Speed Test
              </div>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
                Internet performance
              </div>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-500 sm:flex">
            <span className="cursor-pointer hover:text-gray-900">Home</span>
            <span className="cursor-pointer hover:text-gray-900">About</span>
            <span className="cursor-pointer hover:text-gray-900">Privacy</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        {/* Title row */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px]">
            Your Internet Speed
          </h1>
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
              running
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : done
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-gray-200 bg-gray-50 text-gray-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                running ? "live-dot bg-orange-500" : done ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            {running ? PHASE_LABEL[phase] : done ? "Complete" : "Paused"}
          </div>
        </div>

        {/* Digital meter */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-5 sm:p-7">
          <Speedometer
            value={running ? liveMbps : (results.downloadMbps ?? 0)}
            active={running && (phase === "download" || phase === "upload")}
            caption={
              running
                ? phase === "download"
                  ? "Download speed — live"
                  : phase === "upload"
                    ? "Upload speed — live"
                    : PHASE_LABEL[phase]
                : done
                  ? "Download result — run again any time"
                  : "Press Start to measure your connection"
            }
          />

          {/* Progress bar */}
          <div className="mx-auto mt-5 max-w-3xl">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              {running ? (
                <div className="relative h-full w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="gauge-fill h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
                  />
                </div>
              ) : (
                <div
                  className="gauge-fill h-full rounded-full"
                  style={{ width: done ? "100%" : "0%" }}
                />
              )}
            </div>
            {/* Phase steps */}
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {PHASE_ORDER.map((p) => {
                const idx = PHASE_ORDER.indexOf(p);
                const curIdx = phase === "idle" ? -1 : phase === "done" ? 99 : PHASE_ORDER.indexOf(phase);
                const state = done || curIdx > idx ? "done" : curIdx === idx ? "active" : "todo";
                return (
                  <div key={p} className="flex flex-col items-center gap-1.5">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        state === "done"
                          ? "bg-green-500 text-white"
                          : state === "active"
                            ? "bg-orange-500 text-white"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {state === "done" ? "✓" : idx + 1}
                    </div>
                    <div
                      className={`text-[11px] font-medium capitalize ${
                        state === "active" ? "text-orange-600" : "text-gray-400"
                      }`}
                    >
                      {p}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Start controls */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {!running && !done && (
              <button
                onClick={runTest}
                className="rounded-full bg-[#F6821F] px-10 py-3 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(246,130,31,0.35)] transition hover:bg-[#d8690a] active:scale-[0.98]"
              >
                Start
              </button>
            )}
            {running && (
              <button
                onClick={cancel}
                className="rounded-full border border-gray-300 bg-white px-10 py-3 text-[15px] font-bold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
              >
                Cancel
              </button>
            )}
            {done && !running && (
              <>
                <button
                  onClick={runTest}
                  className="rounded-full bg-[#F6821F] px-10 py-3 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(246,130,31,0.35)] transition hover:bg-[#d8690a] active:scale-[0.98]"
                >
                  Run again
                </button>
                <button
                  onClick={reset}
                  className="rounded-full border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                  Reset
                </button>
              </>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-gray-400">
            A full test can consume up to ~150 MB of data.
          </p>
        </div>

        {/* Metrics grid — Download Upload Latency Jitter Loss */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            label="Download"
            value={formatSpeed(results.downloadMbps)}
            unit="Mbps"
            subLeft={done ? "avg throughput" : "—"}
            active={phase === "download"}
          />
          <MetricCard
            label="Upload"
            value={formatSpeed(results.uploadMbps)}
            unit="Mbps"
            subLeft={done ? "avg throughput" : "—"}
            active={phase === "upload"}
          />
          <MetricCard
            label="Latency"
            value={fmtMs(results.latencyMs)}
            unit="ms"
            subLeft={
              results.latencyMs !== null ? `unloaded ${fmtMs(results.latencyMs)}` : "unloaded —"
            }
            subRight={
              results.loadedLatencyMs !== null
                ? `loaded ${fmtMs(results.loadedLatencyMs)}`
                : "loaded —"
            }
            active={phase === "latency"}
          />
          <MetricCard
            label="Jitter"
            value={fmtMs(results.jitterMs)}
            unit="ms"
            subLeft={results.jitterMs !== null ? "avg variation" : "—"}
            active={phase === "latency" || phase === "loss"}
          />
          <MetricCard
            label="Packet Loss"
            value={fmtPct(results.packetLossPct)}
            unit="%"
            subLeft={done ? "measured" : "—"}
            active={phase === "loss"}
          />
        </div>

        {/* Quality (compact, optional) + animated route */}
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Quality <span className="font-normal text-gray-400">· optional</span></h2>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
              <ScoreRow
                title="Streaming"
                detail={scores.streaming.detail}
                pct={scores.streaming.pct}
                pending={!done}
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                }
              />
              <ScoreRow
                title="Gaming"
                detail={scores.gaming.detail}
                pct={scores.gaming.pct}
                pending={!done}
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9h12a4 4 0 0 1 4 4v3a3 3 0 0 1-5.2 2L15 16h-6l-1.8 2A3 3 0 0 1 2 16v-3a4 4 0 0 1 4-4Z" />
                    <circle cx="8.5" cy="13.5" r="1" fill="currentColor" />
                    <circle cx="15.5" cy="13.5" r="1" fill="currentColor" />
                  </svg>
                }
              />
              <ScoreRow
                title="Calls"
                detail={scores.videoCalls.detail}
                pct={scores.videoCalls.pct}
                pending={!done}
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="6" width="13" height="12" rx="2" />
                    <path d="m15 10 6-3v10l-6-3" />
                  </svg>
                }
              />
          </div>
        </div>

        {/* Animated connection: You <-> Server (no map) */}
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-bold text-gray-900">Test route</h3>
          <div className="mt-3 flex items-center gap-2 sm:gap-4">
            {/* You */}
            <div className="w-28 shrink-0 rounded-xl bg-gray-50 p-2.5 text-center sm:w-36">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm text-white">🧑</div>
              <div className="mt-1 text-xs font-bold text-gray-900">You</div>
              <div className="truncate text-[11px] text-gray-500">{server ? `${server.city}` : "…"}</div>
              <div className="tabular truncate text-[11px] font-semibold text-gray-700">{server?.ip ?? "…"}</div>
            </div>
            {/* Animated link */}
            <div className="min-w-0 flex-1">
              <div className="route-line">
                <span className="route-packet route-a" />
                <span className="route-packet route-b" />
              </div>
              <div className="tabular mt-1.5 text-center text-[11px] font-semibold text-gray-500">
                {results.latencyMs !== null ? `${fmtMs(results.latencyMs)} ms` : running ? PHASE_LABEL[phase] : "idle"}
                {results.latencyMs !== null && results.jitterMs !== null ? ` · ±${fmtMs(results.jitterMs)} ms` : ""}
              </div>
            </div>
            {/* Server */}
            <div className="w-28 shrink-0 rounded-xl bg-orange-50 p-2.5 text-center sm:w-36">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#F6821F] text-sm text-white">🌐</div>
              <div className="mt-1 text-xs font-bold text-gray-900">Server</div>
              <div className="truncate text-[11px] text-gray-500">{server?.serverLocation ?? "Localhost"} {server?.colo ? `· ${server.colo}` : ""}</div>
              <div className="truncate text-[11px] font-semibold text-gray-700">{server?.isp ?? "…"}</div>
            </div>
          </div>
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="mt-3 text-xs font-semibold text-orange-500 hover:underline"
          >
            {showDetails ? "Hide test log" : "Show test log"}
          </button>
          {showDetails && (
            <div className="mt-2 max-h-36 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-[11px] leading-relaxed text-green-300">
              {log.length === 0 ? (
                <span className="text-gray-500">No entries yet — press Start.</span>
              ) : (
                log.map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="mt-10 border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
          <div className="font-semibold text-gray-500">
            Server Location: {server?.serverLocation ?? "Localhost"}
          </div>
          <div className="mt-2 flex items-center justify-center gap-4">
            <span>Home</span>
            <span>About</span>
            <span>Privacy Policy</span>
            <span>Terms of Use</span>
          </div>
          <div className="mt-2">© 2026 Your Speed Test — UI inspired by Cloudflare Speed Test.</div>
        </div>
      </main>
    </div>
  );
}
