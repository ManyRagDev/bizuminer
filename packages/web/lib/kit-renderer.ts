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
async function renderStoryPng(
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

export type KitArtifactFormat = "story" | "feed" | "banner";
export const KIT_FORMAT_DIMENSIONS = {story:{width:1080,height:1920},feed:{width:1080,height:1080},banner:{width:1200,height:628}} as const;
export function resolveKitFormat(channel:string,format?:KitArtifactFormat):KitArtifactFormat {
  if(format!==undefined){if(!["story","feed","banner"].includes(format))throw new Error("invalid_kit_format");return format;}
  return channel==="instagram_feed"?"feed":channel==="banner"?"banner":"story";
}
export function kitTemplateVersion(format:KitArtifactFormat){return format==="story"?KIT_TEMPLATE_VERSION:format+"-v1";}
/** Format presets are internal editorial templates, not platform size claims. */
export async function renderKitPng(snapshot:KitSnapshot,material:KitMaterial,trackedLink:string,asset?:Uint8Array,format?:KitArtifactFormat):Promise<Uint8Array> {
  const selected=resolveKitFormat(material.channel,format);
  if(selected==="story")return renderStoryPng(snapshot,material,trackedLink,asset);
  const banner=selected==="banner",{width,height}=KIT_FORMAT_DIMENSIONS[selected];
  const text=(content:string,x:number,y:number,size:number,color="white",weight="normal")=>`<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(content)}</text>`;
  // lines() already escapes SVG content.
  const block=(content:string,maxWidth:number,maxLines:number,x:number,y:number,size:number)=>lines(content,maxWidth,maxLines).map((line,i)=>`<text x="${x}" y="${y+i*(size+10)}" font-family="DejaVu Sans" font-size="${size}" fill="white">${line}</text>`).join("");
  const price=new Intl.NumberFormat("pt-BR",{style:"currency",currency:snapshot.currency}).format(snapshot.priceCents/100);
  const left=banner?40:56;
  const title=block(snapshot.title,banner?40:32,3,left,banner?130:162,banner?36:46);
  const priceY=banner?280:asset?716:420;
  const copyY=banner?334:asset?770:500;
  const qr={left:banner?970:840,top:banner?354:648,width:banner?180:184};
  const ctaY=banner?440:850,ctaWidth=banner?840:968;
  const svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" fill="#101b24"/>${text("BizuMiner",left,banner?60:80,banner?32:40,"#80f4ca","bold")}${title}${text(price,left,priceY,banner?48:58,"#80f4ca","bold")}${block(material.shortCopy,banner?55:38,banner?2:asset?2:4,left,copyY,banner?25:28)}<rect x="${left}" y="${ctaY}" width="${ctaWidth}" height="${banner?64:82}" rx="14" fill="#80f4ca"/>${text((material.cta||"Ver oferta").slice(0,banner?42:45),left+25,ctaY+(banner?43:53),banner?28:30,"#101b24")}${text(trackedLink,left,banner?550:965,banner?17:18)}${text("Link de afiliado. Podemos receber comissão pela compra.",left,banner?587:1010,banner?18:20)}${text("Confira preço e condições na loja.",left,banner?615:1045,banner?14:16,"#bfccd7")}</svg>`;
  const layers:sharp.OverlayOptions[]=[{input:await QRCode.toBuffer(trackedLink,{width:qr.width,margin:2,errorCorrectionLevel:"M"}),left:qr.left,top:qr.top}];
  if(asset)layers.push({input:await sharp(asset).resize(banner?260:900,banner?220:300,{fit:"contain",background:"white"}).png().toBuffer(),left:banner?900:90,top:banner?95:326});
  return new Uint8Array(await sharp(Buffer.from(svg)).composite(layers).png().toBuffer());
}
