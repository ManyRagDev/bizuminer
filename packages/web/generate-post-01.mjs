import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve("..", "..", "social", "output", "post-01");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── TEMPLATE BASE STYLES ──────────────────────────────────────────────────────
const DEFS = `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#040812"/>
      <stop offset="50%" stop-color="#090E1A"/>
      <stop offset="100%" stop-color="#020408"/>
    </linearGradient>

    <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#152138" stop-opacity="0.80"/>
      <stop offset="100%" stop-color="#0B1322" stop-opacity="0.90"/>
    </linearGradient>

    <linearGradient id="neonGreen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00F0FF"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#00F0FF"/>
    </linearGradient>
  </defs>
`;

const GRID_BG = `
  <rect width="1080" height="1350" fill="url(#bgGrad)"/>
  <g opacity="0.07" stroke="#00F0FF" stroke-width="1">
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
  <text x="80" y="100" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
  <text x="1000" y="100" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
  <text x="80" y="1270" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
  <text x="1000" y="1270" fill="#00F0FF" opacity="0.4" font-family="monospace" font-size="20">+</text>
`;

function header(tagRight = "RADAR // AUDITADO") {
  return `
  <g transform="translate(80, 130)">
    <rect width="200" height="38" rx="19" fill="#0F2438" stroke="#00F0FF" stroke-width="1.5" opacity="0.9"/>
    <circle cx="20" cy="19" r="5" fill="#10B981"/>
    <text x="36" y="24" fill="#E0F7FA" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="2">BIZUMINER</text>
    <text x="920" y="25" text-anchor="end" fill="#5A718A" font-family="monospace" font-size="14" letter-spacing="1">${tagRight}</text>
  </g>
  `;
}

// ─── SLIDE 1: Capa ────────────────────────────────────────────────────────────
const slide1 = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  ${GRID_BG}
  ${header("MANIFESTO // FIXADO")}

  <g transform="translate(80, 260)">
    <text x="0" y="0" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">O FIM DA</tspan>
      <tspan x="0" dy="76" fill="url(#neonGreen)">METADE DO DOBRO.</tspan>
    </text>
    <text x="0" y="160" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="22">Por que criamos um robô de histórico próprio e curadoria real.</text>
  </g>

  <g transform="translate(80, 480)">
    <rect width="920" height="580" rx="24" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="2"/>
    <line x1="30" y1="0" x2="250" y2="0" stroke="url(#neonGreen)" stroke-width="3"/>

    <text x="50" y="70" fill="#00F0FF" font-family="monospace" font-size="15" letter-spacing="2">POR QUE O BIZUMINER EXISTE</text>

    <g transform="translate(50, 130)">
      <circle cx="16" cy="16" r="16" fill="#10B981" opacity="0.15"/>
      <text x="16" y="22" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">1</text>
      <text x="50" y="16" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Histórico de Preço Próprio</text>
      <text x="50" y="44" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="18">Não acreditamos em selo de "50% OFF". O robô audita os últimos 90 dias.</text>
    </g>

    <g transform="translate(50, 270)">
      <circle cx="16" cy="16" r="16" fill="#10B981" opacity="0.15"/>
      <text x="16" y="22" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">2</text>
      <text x="50" y="16" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Curadoria de Olhos Fechados</text>
      <text x="50" y="44" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="18">Reputação de vendedor e frete checados antes de qualquer publicação.</text>
    </g>

    <g transform="translate(50, 410)">
      <circle cx="16" cy="16" r="16" fill="#10B981" opacity="0.15"/>
      <text x="16" y="22" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="16" font-weight="bold">3</text>
      <text x="50" y="16" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Timing Cirúrgico</text>
      <text x="50" y="44" fill="#8FA4BC" font-family="system-ui, sans-serif" font-size="18">Você é avisado no exato momento da queda, antes do estoque esgotar.</text>
    </g>
  </g>

  <g transform="translate(80, 1140)">
    <rect width="920" height="85" rx="18" fill="#0C1524" stroke="#1A2D48" stroke-width="1.5"/>
    <text x="50" y="50" fill="#E0F7FA" font-family="system-ui, sans-serif" font-size="20" font-weight="600">Arraste para entender como o robô opera</text>
    <text x="860" y="52" text-anchor="end" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="24">→</text>
  </g>
</svg>
`;

// ─── SLIDE 2: O Problema ──────────────────────────────────────────────────────
const slide2 = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  ${GRID_BG}
  ${header("01 // O CENÁRIO")}

  <g transform="translate(80, 240)">
    <rect width="180" height="32" rx="6" fill="#1E293B"/>
    <text x="90" y="21" text-anchor="middle" fill="#94A3B8" font-family="monospace" font-size="13" font-weight="bold">O PROBLEMA REAL</text>
    <text x="0" y="90" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="52" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">O SELO DE "50% OFF"</tspan>
      <tspan x="0" dy="64" fill="#EF4444">NÃO GARANTE PREÇO BOM.</tspan>
    </text>
  </g>

  <g transform="translate(80, 470)">
    <rect width="920" height="590" rx="24" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="2"/>

    <g transform="translate(50, 60)">
      <text x="0" y="0" fill="#E2E8F0" font-family="system-ui, sans-serif" font-size="24" font-weight="500" width="820">
        <tspan x="0" dy="0">Na internet, preços oscilam o tempo todo.</tspan>
        <tspan x="0" dy="42">É muito comum produtos subirem de valor dias antes de uma</tspan>
        <tspan x="0" dy="42">campanha para depois anunciarem um "super desconto".</tspan>
      </text>
    </g>

    <!-- Caixa Comparativa Visual -->
    <g transform="translate(50, 230)">
      <rect width="820" height="130" rx="16" fill="#080D17" stroke="#334155" stroke-width="1.5"/>
      <text x="40" y="45" fill="#EF4444" font-family="monospace" font-size="16" font-weight="bold">O QUE A LOJA ANUNCIA:</text>
      <text x="40" y="92" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="28" font-weight="800">"De R$ 399 por R$ 199 (50% OFF!)"</text>
    </g>

    <g transform="translate(50, 390)">
      <rect width="820" height="140" rx="16" fill="#081A1B" stroke="#00F0FF" stroke-width="1.5"/>
      <text x="40" y="42" fill="#00F0FF" font-family="monospace" font-size="15" font-weight="bold">O QUE O HISTÓRICO BIZUMINER REVELA:</text>
      <text x="40" y="82" fill="#34D399" font-family="system-ui, sans-serif" font-size="24" font-weight="800">Preço médio de 90 dias: R$ 189.</text>
      <text x="40" y="114" fill="#99F6E4" font-family="system-ui, sans-serif" font-size="20">Desconto real do anúncio: 0%</text>
    </g>
  </g>

  <g transform="translate(80, 1140)">
    <rect width="920" height="85" rx="18" fill="#0C1524" stroke="#1A2D48" stroke-width="1.5"/>
    <text x="50" y="50" fill="#E0F7FA" font-family="system-ui, sans-serif" font-size="20" font-weight="600">Veja como resolvemos isso no próximo slide</text>
    <text x="860" y="52" text-anchor="end" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="24">→</text>
  </g>
</svg>
`;

// ─── SLIDE 3: A Solução Técnica ───────────────────────────────────────────────
const slide3 = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  ${GRID_BG}
  ${header("02 // A TECNOLOGIA")}

  <g transform="translate(80, 240)">
    <rect width="180" height="32" rx="6" fill="#064E3B"/>
    <text x="90" y="21" text-anchor="middle" fill="#34D399" font-family="monospace" font-size="13" font-weight="bold">NOSSA PENEIRA</text>
    <text x="0" y="90" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="52" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">NÓS AUDITAMOS CADA</tspan>
      <tspan x="0" dy="64" fill="url(#neonGreen)">CENTAVO NO MERCADO LIVRE.</tspan>
    </text>
  </g>

  <g transform="translate(80, 470)">
    <!-- Filtro 1 -->
    <g transform="translate(0, 0)">
      <rect width="920" height="160" rx="18" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="1.5"/>
      <circle cx="50" cy="80" r="24" fill="#10B981" opacity="0.2"/>
      <text x="50" y="88" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="20" font-weight="bold">01</text>
      <text x="95" y="58" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="25" font-weight="700">Régua dos 90 Dias</text>
      <text x="95" y="100" fill="#CBD5E1" font-family="system-ui, sans-serif" font-size="20">Só publicamos o que está comprovadamente abaixo da média.</text>
    </g>

    <!-- Filtro 2 -->
    <g transform="translate(0, 190)">
      <rect width="920" height="160" rx="18" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="1.5"/>
      <circle cx="50" cy="80" r="24" fill="#10B981" opacity="0.2"/>
      <text x="50" y="88" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="20" font-weight="bold">02</text>
      <text x="95" y="58" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="25" font-weight="700">Vendedores Verificados</text>
      <text x="95" y="100" fill="#CBD5E1" font-family="system-ui, sans-serif" font-size="20">Lojas oficiais e vendedores Platinum com envio garantido.</text>
    </g>

    <!-- Filtro 3 -->
    <g transform="translate(0, 380)">
      <rect width="920" height="160" rx="18" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="1.5"/>
      <circle cx="50" cy="80" r="24" fill="#10B981" opacity="0.2"/>
      <text x="50" y="88" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="20" font-weight="bold">03</text>
      <text x="95" y="58" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="25" font-weight="700">Frete &amp; Condições Reais</text>
      <text x="95" y="100" fill="#CBD5E1" font-family="system-ui, sans-serif" font-size="20">Sem truques de preço baixo com frete abusivo embutido.</text>
    </g>
  </g>

  <g transform="translate(80, 1140)">
    <rect width="920" height="85" rx="18" fill="#0C1524" stroke="#1A2D48" stroke-width="1.5"/>
    <text x="50" y="50" fill="#E0F7FA" font-family="system-ui, sans-serif" font-size="20" font-weight="600">O que isso muda na sua rotina</text>
    <text x="860" y="52" text-anchor="end" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="24">→</text>
  </g>
</svg>
`;

// ─── SLIDE 4: Compra Sem Culpa ────────────────────────────────────────────────
const slide4 = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  ${GRID_BG}
  ${header("03 // O RESULTADO")}

  <g transform="translate(80, 240)">
    <rect width="180" height="32" rx="6" fill="#1E1B4B"/>
    <text x="90" y="21" text-anchor="middle" fill="#A5B4FC" font-family="monospace" font-size="13" font-weight="bold">SUA TRANQUILIDADE</text>
    <text x="0" y="90" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="52" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">COMPRE DE</tspan>
      <tspan x="0" dy="64" fill="url(#accentGrad)">OLHOS FECHADOS.</tspan>
    </text>
  </g>

  <g transform="translate(80, 480)">
    <rect width="920" height="570" rx="24" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="2"/>

    <g transform="translate(50, 70)">
      <text x="0" y="0" fill="#E2E8F0" font-family="system-ui, sans-serif" font-size="24" font-weight="500">
        <tspan x="0" dy="0">Você não precisa perder horas abrindo 10 abas,</tspan>
        <tspan x="0" dy="42">pesquisando no Google ou suspeitando de cada anúncio.</tspan>
      </text>
    </g>

    <!-- Destaque Central -->
    <g transform="translate(50, 200)">
      <rect width="820" height="280" rx="20" fill="#0A1828" stroke="#00F0FF" stroke-width="2"/>
      <circle cx="410" cy="70" r="30" fill="#10B981" opacity="0.2"/>
      <text x="410" y="80" text-anchor="middle" fill="#10B981" font-family="system-ui, sans-serif" font-size="32">🛡️</text>

      <text x="410" y="145" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="28" font-weight="900">
        SE ESTÁ NO BIZUMINER,
      </text>
      <text x="410" y="190" text-anchor="middle" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="28" font-weight="900">
        PODE PASSAR O CARTÃO EM PAZ.
      </text>
      <text x="410" y="235" text-anchor="middle" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="20">
        Nós já fizemos a parte difícil por você.
      </text>
    </g>
  </g>

  <g transform="translate(80, 1140)">
    <rect width="920" height="85" rx="18" fill="#0C1524" stroke="#1A2D48" stroke-width="1.5"/>
    <text x="50" y="50" fill="#E0F7FA" font-family="system-ui, sans-serif" font-size="20" font-weight="600">Como acompanhar nossas ofertas</text>
    <text x="860" y="52" text-anchor="end" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="24">→</text>
  </g>
</svg>
`;

// ─── SLIDE 5: Fechamento & CTA ────────────────────────────────────────────────
const slide5 = `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  ${DEFS}
  ${GRID_BG}
  ${header("04 // O BIZU")}

  <g transform="translate(80, 240)">
    <rect width="180" height="32" rx="6" fill="#064E3B"/>
    <text x="90" y="21" text-anchor="middle" fill="#34D399" font-family="monospace" font-size="13" font-weight="bold">PRÓXIMOS PASSOS</text>
    <text x="0" y="90" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="52" font-weight="900" letter-spacing="-1">
      <tspan x="0" dy="0">NUNCA MAIS</tspan>
      <tspan x="0" dy="64" fill="url(#neonGreen)">COMPRE NO ESCURO.</tspan>
    </text>
  </g>

  <g transform="translate(80, 470)">
    <rect width="920" height="580" rx="24" fill="url(#glassGrad)" stroke="#1F3352" stroke-width="2"/>

    <!-- Ação 1: Seguir -->
    <g transform="translate(50, 50)">
      <rect width="820" height="135" rx="16" fill="#0A1626" stroke="#1E3A5F" stroke-width="1.5"/>
      <text x="40" y="50" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="25" font-weight="800">1. Siga o @bizuminer no Instagram</text>
      <text x="40" y="95" fill="#CBD5E1" font-family="system-ui, sans-serif" font-size="20">Guias semanais, tabelas de preço e inteligência de compras.</text>
    </g>

    <!-- Ação 2: Canal de Alertas -->
    <g transform="translate(50, 215)">
      <rect width="820" height="135" rx="16" fill="#0A2022" stroke="#00F0FF" stroke-width="1.5"/>
      <text x="40" y="50" fill="#00F0FF" font-family="system-ui, sans-serif" font-size="25" font-weight="800">2. Entre no Canal Gratuito de Alertas</text>
      <text x="40" y="95" fill="#99F6E4" font-family="system-ui, sans-serif" font-size="20">Receba os links auditados em tempo real antes de esgotar (link na bio).</text>
    </g>

    <!-- Ação 3: Salvar -->
    <g transform="translate(50, 380)">
      <rect width="820" height="135" rx="16" fill="#0A1626" stroke="#1E3A5F" stroke-width="1.5"/>
      <text x="40" y="50" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="25" font-weight="800">3. Salve esse post</text>
      <text x="40" y="95" fill="#CBD5E1" font-family="system-ui, sans-serif" font-size="20">Para consultar sempre que for planejar uma nova compra.</text>
    </g>
  </g>

  <!-- Rodapé Final -->
  <g transform="translate(80, 1140)">
    <rect width="920" height="85" rx="18" fill="#10B981" opacity="0.15" stroke="#10B981" stroke-width="1.5"/>
    <text x="460" y="52" text-anchor="middle" fill="#34D399" font-family="system-ui, sans-serif" font-size="22" font-weight="800">
      🚀 BIZUMINER.COM.BR // LINK NA BIO
    </text>
  </g>
</svg>
`;


async function buildCarousel() {
  console.log("Gerando Carrossel Completo do Post 01 (5 slides)...");

  const slides = [
    { name: "slide-1.png", svg: slide1 },
    { name: "slide-2.png", svg: slide2 },
    { name: "slide-3.png", svg: slide3 },
    { name: "slide-4.png", svg: slide4 },
    { name: "slide-5.png", svg: slide5 },
  ];

  for (const s of slides) {
    const dest = path.join(OUTPUT_DIR, s.name);
    await sharp(Buffer.from(s.svg)).png().toFile(dest);
    console.log(`✅ ${s.name} gerado em: ${dest}`);
  }

  console.log("🎉 Carrossel do Post 01 100% finalizado!");
}

buildCarousel().catch(console.error);
