export type Phase = "idle" | "latency" | "download" | "upload" | "loss" | "done";

export interface SpeedTestResults {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  loadedLatencyMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
}

export interface QualityScores {
  streaming: { label: string; detail: string; pct: number };
  gaming: { label: string; detail: string; pct: number };
  videoCalls: { label: string; detail: string; pct: number };
}

export function calculateScores(r: SpeedTestResults): QualityScores {
  const dl = r.downloadMbps ?? 0;
  const ul = r.uploadMbps ?? 0;
  const lat = r.latencyMs ?? 200;
  const jit = r.jitterMs ?? 50;
  const loss = r.packetLossPct ?? 0;

  // Streaming — driven by download
  let streaming = { label: "Poor", detail: "Struggles with HD video", pct: 20 };
  if (dl >= 25) streaming = { label: "Excellent", detail: "Smooth 4K streaming", pct: 100 };
  else if (dl >= 10) streaming = { label: "Good", detail: "Smooth HD streaming", pct: 75 };
  else if (dl >= 5) streaming = { label: "Fair", detail: "HD with occasional buffering", pct: 50 };
  else if (dl > 0) streaming = { label: "Poor", detail: "Struggles with HD video", pct: 25 };

  // Gaming — driven by latency / jitter / loss
  let gamingScore = 100;
  gamingScore -= Math.max(0, (lat - 15) * 1.2);
  gamingScore -= Math.max(0, (jit - 3) * 3);
  gamingScore -= loss * 15;
  gamingScore = Math.max(5, Math.min(100, gamingScore));
  const gaming =
    gamingScore >= 85
      ? { label: "Excellent", detail: "Ideal for competitive play", pct: gamingScore }
      : gamingScore >= 65
        ? { label: "Good", detail: "Casual gaming works well", pct: gamingScore }
        : gamingScore >= 40
          ? { label: "Fair", detail: "Expect some lag spikes", pct: gamingScore }
          : { label: "Poor", detail: "High lag for real-time games", pct: gamingScore };

  // Video calls — driven by upload + latency
  let vcScore = 100;
  if (ul < 1.5) vcScore -= 50;
  else if (ul < 3) vcScore -= 25;
  else if (ul < 8) vcScore -= 10;
  vcScore -= Math.max(0, (lat - 30) * 0.6);
  vcScore -= loss * 12;
  vcScore = Math.max(5, Math.min(100, vcScore));
  const videoCalls =
    vcScore >= 85
      ? { label: "Excellent", detail: "Crisp HD video calls", pct: vcScore }
      : vcScore >= 65
        ? { label: "Good", detail: "Stable video calls", pct: vcScore }
        : vcScore >= 40
          ? { label: "Fair", detail: "Usable with minor glitches", pct: vcScore }
          : { label: "Poor", detail: "Calls may freeze or drop", pct: vcScore };

  return { streaming, gaming, videoCalls };
}

export async function measurePing(count = 15): Promise<{
  latency: number;
  jitter: number;
  loss: number;
  samples: number[];
}> {
  const samples: number[] = [];
  let lost = 0;
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/ping?t=${Date.now()}-${i}`, { cache: "no-store" });
      if (!res.ok) throw new Error("ping failed");
      await res.json();
      const dt = performance.now() - t0;
      samples.push(dt);
    } catch {
      lost++;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  if (samples.length === 0) return { latency: 0, jitter: 0, loss: 100, samples: [] };
  const sorted = [...samples].sort((a, b) => a - b);
  // Use median-ish / trimmed mean to be stable, like Cloudflare shows low idle latency
  const trimmed = sorted.slice(1, Math.max(2, sorted.length - 1));
  const latency = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  let jitterSum = 0;
  for (let i = 1; i < samples.length; i++) jitterSum += Math.abs(samples[i] - samples[i - 1]);
  const jitter = samples.length > 1 ? jitterSum / (samples.length - 1) : 0;
  const loss = (lost / count) * 100;
  return { latency, jitter, loss, samples };
}

export async function measureDownload(
  onTick: (mbps: number, done: number, total: number) => void,
  durationMs = 10000
): Promise<number> {
  const sizes = [1_000_000, 4_000_000, 10_000_000];
  const start = performance.now();
  let totalBytes = 0;

  async function worker() {
    while (performance.now() - start < durationMs) {
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      try {
        const res = await fetch(`/api/download?bytes=${size}&r=${Math.random()}`, {
          cache: "no-store",
        });
        if (!res.ok || !res.body) continue;
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          const elapsed = (performance.now() - start) / 1000;
          if (elapsed > 0.3) {
            onTick((totalBytes * 8) / elapsed / 1_000_000, totalBytes, 0);
          }
          if (performance.now() - start >= durationMs) {
            try { await reader.cancel(); } catch {}
            break;
          }
        }
      } catch {
        // ignore and retry
      }
    }
  }

  // Ramp up streams gradually like Cloudflare, but await ALL of them.
  // Old code pushed late workers via setTimeout after Promise.all()
  // had already snapshotted the array, leaking fetches into the upload phase.
  const maxStreams = 6;
  const allWorkers: Promise<void>[] = [];
  for (let i = 0; i < 3; i++) allWorkers.push(worker());
  // Let the first 3 run for 2.5s, then add 3 more (same deadline).
  await new Promise((r) => setTimeout(r, Math.min(2500, durationMs / 2)));
  if (performance.now() - start < durationMs) {
    for (let i = 3; i < maxStreams; i++) allWorkers.push(worker());
  }

  await Promise.all(allWorkers);
  const elapsedSec = (performance.now() - start) / 1000;
  const avgMbps = (totalBytes * 8) / elapsedSec / 1_000_000;
  return avgMbps;
}

export async function measureUpload(
  onTick: (mbps: number) => void,
  durationMs = 8000
): Promise<number> {
  const start = performance.now();
  let totalBytes = 0;

  function makePayload(size: number): Uint8Array {
    const arr = new Uint8Array(size);
    // Fill EVERY byte with fast xorshift pseudo-random.
    // Old code filled 1 byte per 1024 (99.9% zeros) which is
    // highly compressible and inflates results through proxies.
    let x = (Math.random() * 0xffffffff) >>> 0 || 0x9e3779b9;
    for (let i = 0; i < size; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      arr[i] = x & 0xff;
    }
    return arr;
  }

  const payloadSizes = [256_000, 512_000, 1_000_000];

  async function worker() {
    while (performance.now() - start < durationMs) {
      const size = payloadSizes[Math.floor(Math.random() * payloadSizes.length)];
      const payload = makePayload(size);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: payload as unknown as BodyInit,
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (!res.ok) continue;
        await res.json();
        totalBytes += size;
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed > 0.3) {
          onTick((totalBytes * 8) / elapsed / 1_000_000);
        }
      } catch {
        // retry
      }
    }
  }

  await Promise.all([worker(), worker(), worker(), worker()]);
  const elapsedSec = (performance.now() - start) / 1000;
  return (totalBytes * 8) / elapsedSec / 1_000_000;
}

export function formatSpeed(mbps: number | null): string {
  if (mbps === null || isNaN(mbps)) return "-";
  if (mbps < 10) return mbps.toFixed(1);
  if (mbps < 100) return mbps.toFixed(1);
  return Math.round(mbps).toString();
}
