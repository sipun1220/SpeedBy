export async function POST(request: Request) {
  const buf = await request.arrayBuffer();
  return Response.json(
    { received: buf.byteLength },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET() {
  return Response.json({ ok: true });
}
