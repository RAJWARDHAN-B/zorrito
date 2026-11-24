export function GET() {
  return Response.json({ success: true, data: { status: "ok" } }, { headers: { "Cache-Control": "no-store" } });
}
