import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve("..", "..", "social", "output");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── CARD 1: Manifesto (Direção PostSpark: Cyber-Glitch / Glass-Veil) ───────────
const card1Svg = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradiente de Fundo Tech Dark -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040812"/>
      <stop offset="50%" stop-color="#090E1A"/>
      <stop offset="100%" stop-color="#020408"/>
    </linearGradient>

    <!-- Vidro / Glassmorphism -->
    <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#152138" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#0B1322" stop-opacity="0.85"/>
    </linearGradient>

    <!-- Gradiente Verde Esmeralda (BizuMiner Auditado) -->
    <linearGradient id="neonGreen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00F0FF"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
  </defs>

  <!-- Fundo -->
  <rect width="1080" height="1350" fill="url(#bgGrad)"/>

  <!-- Grid de Linhas Tech (Cyber Background) -->
  <g opacity="0.08" stroke="#00F0FF" stroke-width="1">
    <line x1="100" y1="0" x2="100" y2="1350"/>
    <line x1="300" y1="0" x2="300" y2="1350"/>
    <line x1="540" y1="0" x2="540" y2="1350"/>
    <line x1="780" y1="0" x2="780" y2="1350"/>
    <line x1="980" y1="0" x2="980" y2="1350"/>
    <line x1="0" y1="200" x2="1080" y2="200"/>
    <line x1="0" y1="450" x2="1080" y2="450"/>
    <line x1="0" y1="700" x2="1080" y2="700"/>
    <line x1="0" y1="950" x2="1080" y2="950"/>
    <line x1="0" y1="1200" x2="1080" y2="1200"/>
  </g>

  <!-- Miras Táticas PostSpark (+) -->
  <text x="80" y="120" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
  <text x="1000" y="120" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
  <text x="80" y="1250" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
  <text x="1000" y="1250" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>

  <!-- Header: Tag / Badge do BizuMiner -->
  <g transform="translate(80, 140)">
    <rect width="210" height="42" rx="21" fill="#0F2438" stroke="#00F0FF" stroke-width="1.5" opacity="0.9"/>
    <circle cx="24" cy="21" r="6" fill="#10B981"/>
    <text x="40" y="27" fill="#E0F7FA" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" letter-spacing="2">BIZUMINER</text>
  </g>

  <text x="980" y="167" text-anchor="end" fill="#5A718A" font-family="monospace" font-size="15" letter-spacing="1">RADAR // AUDITADO</text>

  <!-- Headline Monumental (Foco em autoridade) -->
  <g transform="translate(80, 270)">
    <text x="0" y="0" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">O FIM DA</tspan>
      <tspan x="0" dy="76" fill="url(#neonGreen)">METADE DO DOBRO.</tspan>
    </text>
  </g>

  <!-- Cartão de Vidro Central (Glass Veil Card) -->
  <g transform="translate(80, 480)">
    <rect width="920" height="580" rx="24" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="2"/>
    
    <!-- Linha de Destaque Superior -->
    <line x1="30" y1="0" x2="250" y2="0" stroke="url(#neonGreen)" stroke-width="3"/>

    <!-- Título Interno -->
    <text x="50" y="70" fill="#00F0FF" font-family="monospace" font-size="16" letter-spacing="2">POR QUE O BIZUMINER EXISTE</text>

    <!-- Ponto 1 -->
    <g transform="translate(50, 130)">
      <circle cx="16" cy="16" r="16" fill="#10B981" opacity="0.15"/>
      <text x="16" y="22" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">1</text>
      <text x="50" y="16" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Histórico de Preço Próprio</text>
      <text x="50" y="44" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="18">Não acreditamos no selo de "50% OFF". O robô audita o valor real dos últimos 90 dias.</text>
    </g>

    <!-- Ponto 2 -->
    <g transform="translate(50, 270)">
      <circle cx="16" cy="16" r="16" fill="#10B981" opacity="0.15"/>
      <text x="16" y="22" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">2</text>
      <text x="50" y="16" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Curadoria de Olhos Fechados</text>
      <text x="50" y="44" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="18">Reputação de vendedor e frete checados antes de qualquer publicação.</text>
    </g>

    <!-- Ponto 3 -->
    <g transform="translate(50, 410)">
      <circle cx="16" cy="16" r="16" fill="#10B981" opacity="0.15"/>
      <text x="16" y="22" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">3</text>
      <text x="50" y="16" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Timing Cirúrgico</text>
      <text x="50" y="44" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="18">Você é avisado no exato momento da queda, antes do estoque esgotar.</text>
    </g>
  </g>

  <!-- Rodapé / CTA -->
  <g transform="translate(80, 1140)">
    <rect width="920" height="90" rx="18" fill="#0C1524" stroke="#1A2D48" stroke-width="1.5"/>
    <text x="50" y="52" fill="#E0F7FA" font-family="system-ui, sans-serif" font-size="20" font-weight="600">Arraste para entender como o robô opera</text>
    <text x="860" y="54" text-anchor="end" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="24">→</text>
  </g>
</svg>
`;

// ─── CARD 2: Tabela de Preço Justo (Direção PostSpark: Data-Punch / Versus) ────
const card2Svg = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07090E"/>
      <stop offset="100%" stop-color="#020305"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>

  <rect width="1080" height="1350" fill="url(#bgGrad2)"/>

  <!-- Topo -->
  <g transform="translate(80, 120)">
    <rect width="180" height="36" rx="18" fill="#111B28" stroke="#2563EB" stroke-width="1"/>
    <text x="90" y="23" text-anchor="middle" fill="#60A5FA" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="1.5">TABELA 2026</text>
    <text x="920" y="24" text-anchor="end" fill="#4B5563" font-family="monospace" font-size="14">DATA PUNCH // GUIA TECH</text>
  </g>

  <!-- Headline -->
  <g transform="translate(80, 230)">
    <text x="0" y="0" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="54" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">QUANTO VALE PAGAR</tspan>
      <tspan x="0" dy="68" fill="url(#accentGrad)">EM FONES TWS BLUETOOTH?</tspan>
    </text>
    <text x="0" y="140" fill="#9CA3AF" font-family="system-ui, sans-serif" font-size="22">Régua de preço real sem maquiagem para não pagar caro:</text>
  </g>

  <!-- Linhas de Comparação (Data-Punch) -->
  <g transform="translate(80, 440)">
    <!-- Item 1: Entrada -->
    <g transform="translate(0, 0)">
      <rect width="920" height="130" rx="16" fill="#0F141F" stroke="#1F293D" stroke-width="1.5"/>
      <text x="40" y="52" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="26" font-weight="800">Fone TWS de Entrada (QCY / Lenovo)</text>
      <text x="40" y="88" fill="#6B7280" font-family="system-ui, sans-serif" font-size="18">Uso no dia a dia, academia e chamadas</text>
      
      <!-- Preço Comum vs Preço Bizu -->
      <g transform="translate(560, 32)">
        <text x="120" y="25" fill="#EF4444" font-family="system-ui, sans-serif" font-size="18" text-decoration="line-through">R$ 130+</text>
        <rect x="180" y="0" width="140" height="65" rx="10" fill="#064E3B" stroke="#10B981" stroke-width="1.5"/>
        <text x="250" y="42" text-anchor="middle" fill="#34D399" font-family="system-ui, sans-serif" font-size="24" font-weight="900">R$ 69-85</text>
      </g>
    </g>

    <!-- Item 2: Intermediário com ANC -->
    <g transform="translate(0, 160)">
      <rect width="920" height="130" rx="16" fill="#0F141F" stroke="#1F293D" stroke-width="1.5"/>
      <text x="40" y="52" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="26" font-weight="800">Intermediário c/ Cancelamento de Ruído</text>
      <text x="40" y="88" fill="#6B7280" font-family="system-ui, sans-serif" font-size="18">Isolamento ativo, bateria longa e codec HD</text>
      
      <g transform="translate(560, 32)">
        <text x="120" y="25" fill="#EF4444" font-family="system-ui, sans-serif" font-size="18" text-decoration="line-through">R$ 280+</text>
        <rect x="180" y="0" width="140" height="65" rx="10" fill="#064E3B" stroke="#10B981" stroke-width="1.5"/>
        <text x="250" y="42" text-anchor="middle" fill="#34D399" font-family="system-ui, sans-serif" font-size="24" font-weight="900">R$ 140-175</text>
      </g>
    </g>

    <!-- Item 3: Premium Top de Linha -->
    <g transform="translate(0, 320)">
      <rect width="920" height="130" rx="16" fill="#0F141F" stroke="#1F293D" stroke-width="1.5"/>
      <text x="40" y="52" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="26" font-weight="800">Premium Flagship (Sony / Galaxy Buds Pro)</text>
      <text x="40" y="88" fill="#6B7280" font-family="system-ui, sans-serif" font-size="18">ANC absoluto, áudio espacial e acabamento nobre</text>
      
      <g transform="translate(560, 32)">
        <text x="120" y="25" fill="#EF4444" font-family="system-ui, sans-serif" font-size="18" text-decoration="line-through">R$ 1.100+</text>
        <rect x="180" y="0" width="140" height="65" rx="10" fill="#064E3B" stroke="#10B981" stroke-width="1.5"/>
        <text x="250" y="42" text-anchor="middle" fill="#34D399" font-family="system-ui, sans-serif" font-size="24" font-weight="900">R$ 590-680</text>
      </g>
    </g>
  </g>

  <!-- CTA Salvar Post -->
  <g transform="translate(80, 1140)">
    <rect width="920" height="90" rx="18" fill="#132338" stroke="#1E3A5F" stroke-width="1.5"/>
    <text x="50" y="52" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="22" font-weight="700">💾 Salve essa tabela para consultar antes de comprar</text>
    <text x="860" y="52" text-anchor="end" fill="#60A5FA" font-family="system-ui, sans-serif" font-size="20">@bizuminer</text>
  </g>
</svg>
`;

async function render() {
  console.log("Renderizando artes com Sharp no padrão PostSpark...");

  const out1 = path.join(OUTPUT_DIR, "teste-post-01-manifesto.png");
  const out2 = path.join(OUTPUT_DIR, "teste-post-02-tabela-fones.png");

  await sharp(Buffer.from(card1Svg)).png().toFile(out1);
  console.log("✅ Gerado:", out1);

  await sharp(Buffer.from(card2Svg)).png().toFile(out2);
  console.log("✅ Gerado:", out2);
}

render().catch(console.error);
