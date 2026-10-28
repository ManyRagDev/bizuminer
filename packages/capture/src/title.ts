/** Transport limit shared by collectors and validators; never silently truncate. */
export const MAX_SOURCE_TITLE_LENGTH = 2000;

/** Preserve source wording, model and configuration; only decode text and spaces. */
export function normalizeSourceTitle(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, body: string) => {
    if (body[0] !== '#') return named[body.toLowerCase()] ?? entity;
    const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/gu, ' ').trim();
}
