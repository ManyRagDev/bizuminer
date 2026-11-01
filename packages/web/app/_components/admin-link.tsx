"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  return pending ? <span className="admin-link-pending" role="status">Carregando…</span> : null;
}

export default function AdminLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false}>{children}<NavigationStatus /></Link>;
}
