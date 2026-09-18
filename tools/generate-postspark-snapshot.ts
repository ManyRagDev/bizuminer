import { FAMILIES } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/creative/families.ts";
import { composeVariation } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/creative/compose.ts";
import { createPostVisualSnapshot } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/variationSnapshot.ts";
import { DEFAULT_DESIGN_TOKENS } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/postspark.ts";

const bizuCandidate: any = {
  id: "bizuminer-manifesto",
  headline: "O FIM DA METADE DO DOBRO",
  body: "Por que criamos um robô de histórico de preço próprio e curadoria real no Mercado Livre.",
  caption: "Descubra como o BizuMiner audita ofertas reais e separa desconto verdadeiro de maquiagem de preço.",
  callToAction: "Acesse o link da bio",
  platform: "instagram",
  postMode: "static",
  aspectRatio: "5:6",
  layout: "centered",
  backgroundColor: "#090D18",
  textColor: "#FFFFFF",
  accentColor: "#10B981",
  copyAngle: { type: "autoridade", label: "Manifesto", badge: "BIZUMINER", stickerText: "AUDITADO" },
  creativeDirection: {
    familyId: "glass-veil",
    paletteId: "brand",
    paletteInverted: false,
    seed: 1,
    axes: FAMILIES.find((f) => f.id === "glass-veil")?.axes,
    source: "classifier"
  }
};

console.log("1. Executando composeVariation do PostSpark 3...");
const composed = composeVariation(bizuCandidate, DEFAULT_DESIGN_TOKENS as any);

console.log("2. Executando createPostVisualSnapshot do PostSpark 3...");
const snapshot = createPostVisualSnapshot(composed, "5:6");

console.log("\n=======================================================");
console.log("🎉 SUCESSO! SNAPSHOT NATIVO DO POSTSPARK 3 GERADO:");
console.log("=======================================================");
console.log("Família Visual Selecionada:", snapshot.creativeDirection?.familyId);
console.log("Layout Template:", snapshot.layout);
console.log("Composed Layout Settings:", JSON.stringify(composed.layoutSettings, null, 2));
console.log("Composed Typography:", {
  headlineFont: composed.headlineFontFamily,
  headlineSize: composed.headlineFontSize,
  bodyFont: composed.bodyFontFamily,
});
console.log("Composed Ornaments:", composed.ornaments);

