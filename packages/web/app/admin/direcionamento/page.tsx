import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DirecionamentoPage() {
  redirect("/admin/curadoria?aba=bussola");
}

