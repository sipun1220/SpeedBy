export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = parseInt(searchParams.get("bytes") ?? "1000000", 10);
  // Clamp between 100KB and 25MB to avoid abuse
  const bytes = Math.min(25_000_000, Math.max(100_000, isNaN(requested) ? 1000000 : requested));

  // Fast pseudo-random buffer (cheaper than crypto for large payloads)
  const buf = Buffer.allocUnsafe(bytes);
  for (let i = 0; i < bytes; i += 4096) {
    buf[i] = Math.floor(Math.random() * 256);
  }

  const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
