export async function GET() {
  return Response.json(
    { now: Date.now(), server: "local" },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}
