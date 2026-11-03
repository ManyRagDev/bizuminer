/** Bound actual bytes, including requests without Content-Length. */
export async function workspaceJson(
  request: Request,
  limit = 100000,
): Promise<any> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("invalid_input");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_input");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new Error("input_too_large");
    }
    chunks.push(part.value);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(data));
}
