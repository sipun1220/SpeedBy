export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Fast xorshift32 — fills EVERY byte with pseudo-random data.
// Old code only set 1 byte per 4096 (rest zeros) which gzip/brotli
// compresses ~100-1000x, so the client counted 10MB while only a few
// KB went over the wire -> massively inflated Mbps on Vercel.
let seed = 0x12345678;
function fillRandom(buf: Buffer) {
  let x = (seed = (seed * 1664525 + 1013904223) >>> 0 || 0xdeadbeef);
  for (let i = 0; i < buf.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    buf[i] = x & 0xff;
  }
  seed = x >>> 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = parseInt(searchParams.get("bytes") ?? "1000000", 10);
  // Clamp between 100KB and 25MB to avoid abuse
  const bytes = Math.min(25_000_000, Math.max(100_000, isNaN(requested) ? 1000000 : requested));

  // Fully random (incompressible) buffer
  const buf = Buffer.allocUnsafe(bytes);
  fillRandom(buf);

  const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      // Hint edge/CDN + browsers not to transform/compress.
      // Real protection is incompressible data above; Vercel will
      // still try gzip/brotli but gain ~0% on random bytes.
      "Content-Encoding": "identity",
      "Vary": "*",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
