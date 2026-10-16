import sharp from "sharp";
import QRCode from "qrcode";
import type { KitSnapshot, KitMaterial } from "./commerce-contract.ts";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function lines(s: string, width: number, max: number) {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    if ((line + " " + word).trim().length > width && line) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out
    .slice(0, max)
    .map((s, i) =>
      escape(i === max - 1 && out.length > max ? s.slice(0, -1) + "…" : s),
    );
}
export const KIT_TEMPLATE_VERSION = "story-v1";
/** Receives immutable revision facts only; never reads live product/price data. */
export async function renderKitPng(
  snapshot: KitSnapshot,
  material: KitMaterial,
  trackedLink: string,
  asset?: Uint8Array,
): Promise<Uint8Array> {
  const title = lines(snapshot.title, 32, 4),
    copy = lines(material.shortCopy, 43, asset ? 4 : 6);
  const price =
    typeof snapshot.priceCents === "number"
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: snapshot.currency,
        }).format(snapshot.priceCents / 100)
      : "";
  const bg = await sharp(
    Buffer.from(
      `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1920" fill="#101b24"/><text x="72" y="125" font-family="DejaVu Sans" font-size="45" font-weight="bold" fill="#80f4ca">BizuMiner</text><text x="72" y="185" font-family="DejaVu Sans" font-size="24" fill="#ffffff">Indicação para o seu público</text>${title.map((s, i) => `<text x="72" y="${300 + i * 65}" font-family="DejaVu Sans" font-size="51" fill="white" font-weight="bold">${s}</text>`).join("")}<text x="72" y="${asset ? 1150 : 680}" font-family="DejaVu Sans" font-size="69" fill="#80f4ca" font-weight="bold">${escape(price)}</text>${copy.map((s, i) => `<text x="72" y="${(asset ? 1250 : 820) + i * 48}" font-family="DejaVu Sans" font-size="34" fill="white">${s}</text>`).join("")}<rect x="65" y="1620" width="950" height="110" rx="18" fill="#80f4ca"/><text x="100" y="1687" font-family="DejaVu Sans" font-size="37" fill="#101b24">${escape(material.cta || "Ver oferta")}</text><text x="72" y="1780" font-family="DejaVu Sans" font-size="21" fill="white">${escape(trackedLink)}</text><text x="72" y="1840" font-family="DejaVu Sans" font-size="23" fill="white">Link de afiliado. Podemos receber comissão pela compra.</text><text x="72" y="1880" font-family="DejaVu Sans" font-size="18" fill="#bfccd7">Confira preço e condições na loja.</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
  const layers: sharp.OverlayOptions[] = [
    {
      input: await QRCode.toBuffer(trackedLink, {
        width: 160,
        margin: 1,
        errorCorrectionLevel: "M",
      }),
      top: 1450,
      left: 840,
    },
  ];
  if (asset)
    layers.push({
      input: await sharp(asset)
        .resize(900, 520, { fit: "contain", background: "#ffffff" })
        .png()
        .toBuffer(),
      top: 560,
      left: 90,
    });
  return new Uint8Array(await sharp(bg).composite(layers).png().toBuffer());
}
