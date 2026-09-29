/**
 * Endpoint legado encerrado: o antigo CAPTURE_TOKEN era uma credencial global
 * embutida no bookmarklet e não representava a role do usuário. Capturas
 * manuais passam por `/api/admin/captura`; a extensão usa dispositivo emitido
 * para uma conta com role `afiliado`.
 */

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: "OPTIONS" } });
}

export async function POST() {
  return Response.json(
    { ok: false, error: "capture_endpoint_retired", replacement: "/api/admin/captura" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
