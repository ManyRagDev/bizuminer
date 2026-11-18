/** Explicit URI transport wins. Private Docker networks must opt into sslmode=disable. */
export function databaseSsl(connectionString: string): false | "require" | "verify-full" | { rejectUnauthorized: false } {
  let target: URL;
  try { target = new URL(connectionString); } catch { throw new Error("invalid_database_url"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("invalid_database_url");
  const mode = target.searchParams.get("sslmode");
  if (mode === "disable") return false;
  if (mode === "require") return "require";
  if (mode === "verify-full") return "verify-full";
  if (mode !== null) throw new Error("unsupported_database_sslmode");
  return ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    ? false : { rejectUnauthorized: false }; // Preserve existing hosted transport until configured explicitly.
}
