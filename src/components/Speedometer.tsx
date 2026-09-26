"use client";

import { useEffect, useRef, useState } from "react";
import { formatSpeed } from "@/lib/speedtest";

const CX = 160;
const CY = 168;
const R = 128;
const ARC_LEN = Math.PI * R; // semicircle length

const TICKS = [0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

function frac(value: number, max: number): number {
  const f =
    Math.log10(1 + Math.max(0, value)) / Math.log10(1 + Math.max(1, max));
  return Math.min(1, Math.max(0, f));
}

/** Point on the semicircle dial for a 0..1 fraction (0 = far left, 1 = far right). */
function dialPoint(f: number, r: number): { x: number; y: number } {
  const a = Math.PI * (1 - f);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

interface SpeedometerProps {
  /** Live or final speed in Mbps. */
  value: number;
  /** Full-scale of the dial. Defaults to 1000 Mbps. */
  max?: number;
  /** Whether a test is actively running (drives the glow + LCD state). */
  active?: boolean;
  /** Small caption under the LCD, e.g. current phase. */
  caption?: string;
}

export default function Speedometer({
  value,
  max = 1000,
  active = false,
  caption,
}: SpeedometerProps) {
  const [shown, setShown] = useState(0);
  const target = useRef(value);
  target.current = value;

  // Smooth the needle + digits toward the target with rAF so the meter
  // sweeps like a physical gauge instead of jumping between samples.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setShown((prev) => {
        const t = target.current;
        const diff = t - prev;
        if (Math.abs(diff) < 0.05) return t;
        return prev + diff * 0.18;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const f = frac(shown, max);
  const needleAngle = -90 + f * 180;
  const idle = !active && value <= 0;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 320 196"
        className="w-full max-w-[420px]"
        role="img"
        aria-label={`Speedometer: ${formatSpeed(shown)} megabits per second`}
      >
        <defs>
          <linearGradient id="meter-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FDBA74" />
            <stop offset="55%" stopColor="#F6821F" />
            <stop offset="100%" stopColor="#DC2626" />
          </linearGradient>
          <filter id="needle-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#F6821F" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* dial background arc */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="#EDEEF1"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* active arc */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="url(#meter-grad)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN}`}
          strokeDashoffset={`${ARC_LEN * (1 - f)}`}
          style={{ transition: "stroke-dashoffset 90ms linear", opacity: idle ? 0.35 : 1 }}
        />

        {/* ticks + labels */}
        {TICKS.map((t) => {
          const tf = frac(t, max);
          const outer = dialPoint(tf, R - 14);
          const inner = dialPoint(tf, R - (t % 1 === 0 && TICKS.indexOf(t) % 3 === 0 ? 30 : 24));
          const label = dialPoint(tf, R - 44);
          const major = t === 0 || t === 10 || t === 100 || t === 1000;
          return (
            <g key={t}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={major ? "#9CA3AF" : "#D1D5DB"}
                strokeWidth={major ? 2.5 : 1.5}
              />
              {major && (
                <text
                  x={label.x}
                  y={label.y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="#9CA3AF"
                  fontFamily="ui-monospace, monospace"
                >
                  {t >= 1000 ? "1G" : t}
                </text>
              )}
            </g>
          );
        })}

        {/* needle */}
        <g
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 90ms linear",
            opacity: idle ? 0.4 : 1,
          }}
          filter={active ? "url(#needle-glow)" : undefined}
        >
          <line
            x1={CX}
            y1={CY + 12}
            x2={CX}
            y2={CY - R + 26}
            stroke="#1F2937"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line
            x1={CX}
            y1={CY + 12}
            x2={CX}
            y2={CY - R + 26}
            stroke="#F6821F"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
        <circle cx={CX} cy={CY} r="13" fill="#1F2937" />
        <circle cx={CX} cy={CY} r="5" fill="#F6821F" />
      </svg>

      {/* LCD digital readout */}
      <div
        className={`-mt-3 rounded-xl border px-8 py-2.5 text-center font-mono tabular-nums transition-colors ${
          active
            ? "border-amber-400/40 bg-gray-950 shadow-[0_0_28px_rgba(246,130,31,0.35)]"
            : "border-gray-800 bg-gray-950/95"
        }`}
      >
        <span
          className="text-4xl font-bold tracking-wider sm:text-5xl"
          style={{
            color: "#FFC766",
            textShadow: active
              ? "0 0 12px rgba(246,130,31,0.9), 0 0 32px rgba(246,130,31,0.45)"
              : "0 0 8px rgba(246,130,31,0.35)",
          }}
        >
          {idle ? "--.-" : formatSpeed(shown)}
        </span>
        <span className="ml-2 align-middle text-sm font-semibold tracking-widest text-amber-200/60">
          Mbps
        </span>
      </div>

      {caption && (
        <div className="mt-2 text-sm text-gray-500">{caption}</div>
      )}
    </div>
  );
}
