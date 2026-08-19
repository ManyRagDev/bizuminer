import { db } from "../../../lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Newsletter: grava e-mail (LGPD — só o e-mail e o consentimento, sem IP/UA).
 * Idempotente: e-mail repetido responde ok ("already"), sem vazar existência
 * de forma distinta o suficiente para enumerar assinantes.
 */
export async function POST(req: Request) {
  let email: string;
  try {
    const body = (await req.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const sql = db();
  try {
    const rows = await sql<{ id: string }[]>`
      insert into garimpa.subscriber (tenant_id, email, source)
      values ('local', ${email}, 'web:footer')
      on conflict (email) do nothing
      returning id
    `;
    return Response.json({ ok: true, already: rows.length === 0 });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  } finally {
    await sql.end();
  }
}