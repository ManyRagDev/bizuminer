import { getPageAuth } from "../../lib/auth.ts";
import InviteForm from "./workspace.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getPageAuth();
  if (!user)
    return (
      <p>
        <a href="/entrar?next=/convite">Entre para aceitar o convite</a>
      </p>
    );
  return (
    <main>
      <h1>Aceitar convite BizuMiner</h1>
      <p>
        O convite será vinculado ao e-mail confirmado da sua sessão:{" "}
        {user.email}.
      </p>
      <InviteForm />
    </main>
  );
}
