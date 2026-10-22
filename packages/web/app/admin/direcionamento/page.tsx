import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DirecionamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const aba = params.aba ?? "radar";
  redirect(`/admin/curadoria?aba=${encodeURIComponent(aba)}`);
}

