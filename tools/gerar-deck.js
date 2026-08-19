const pptxgen = require("pptxgenjs");

const DARK = "1A1A1E";
const DARK2 = "2A2A31";
const LIGHT = "FFFFFF";
const SOFT = "F4F4F2";
const ACCENT = "E8590C";
const GREEN = "2A9D8F";
const MUTED = "8A8A93";
const INK = "1A1A1E";
const INKSOFT = "55555E";

const HEAD = "Cambria";
const BODY = "Calibri";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Emanuel";
pres.title = "Plano de Construção — Plataforma de Automação de Ofertas";

const W = 13.333;
const M = 0.7;
const CW = W - M * 2;

function badge(slide, x, y, n, color) {
  slide.addShape(pres.ShapeType.ellipse, { x: x, y: y, w: 0.42, h: 0.42, fill: { color: color || ACCENT } });
  slide.addText(String(n), {
    x: x, y: y, w: 0.42, h: 0.42, align: "center", valign: "middle",
    fontSize: 13, bold: true, color: LIGHT, fontFace: BODY, margin: 0,
  });
}

function head(slide, kicker, title, sub) {
  slide.addText(kicker, {
    x: M, y: 0.55, w: CW, h: 0.3, fontSize: 11, bold: true, color: ACCENT,
    fontFace: BODY, charSpacing: 2, margin: 0,
  });
  slide.addText(title, {
    x: M, y: 0.92, w: CW, h: 0.72, fontSize: 34, bold: true, color: INK,
    fontFace: HEAD, margin: 0,
  });
  if (sub) {
    slide.addText(sub, {
      x: M, y: 1.68, w: CW - 0.6, h: 0.42, fontSize: 15, color: INKSOFT,
      fontFace: BODY, margin: 0,
    });
  }
}

function card(slide, o) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.08,
    fill: { color: o.fill || SOFT },
    shadow: { type: "outer", color: "000000", blur: 10, offset: 2, angle: 90, opacity: 0.08 },
  });
}

function node(slide, x, y, w, h, title, sub, dark) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: x, y: y, w: w, h: h, rectRadius: 0.06,
    fill: { color: dark ? DARK : SOFT },
    line: { color: dark ? DARK : "DEDED9", width: 1 },
  });
  slide.addText(title, {
    x: x + 0.15, y: y + 0.14, w: w - 0.3, h: 0.32, fontSize: 12.5, bold: true,
    color: dark ? LIGHT : INK, fontFace: BODY, align: "center", margin: 0,
  });
  slide.addText(sub, {
    x: x + 0.15, y: y + 0.48, w: w - 0.3, h: 0.4, fontSize: 10.5,
    color: dark ? "C9C9CF" : INKSOFT, fontFace: BODY, align: "center", margin: 0,
  });
}

/* ---------- 1 — Capa ---------- */
let s = pres.addSlide();
s.background = { color: DARK };
s.addText("PLANO DE CONSTRUÇÃO  ·  JULHO DE 2026", {
  x: M, y: 0.7, w: CW, h: 0.3, fontSize: 11, bold: true, color: ACCENT,
  fontFace: BODY, charSpacing: 2, margin: 0,
});
s.addShape(pres.ShapeType.ellipse, { x: M, y: 1.45, w: 0.5, h: 0.5, fill: { color: ACCENT } });
s.addText("Plataforma de automação\nde ofertas para afiliados", {
  x: M, y: 2.3, w: 10.5, h: 1.9, fontSize: 40, bold: true, color: LIGHT,
  fontFace: HEAD, lineSpacing: 46, margin: 0,
});
s.addText("Arquitetura, stack e roadmap de execução", {
  x: M, y: 4.4, w: 9.2, h: 0.5, fontSize: 17, color: "CFCFD4", fontFace: BODY, margin: 0,
});
s.addText("Documento interno · alinhamento entre sócios", {
  x: M, y: 6.5, w: 8, h: 0.3, fontSize: 11, color: MUTED, fontFace: BODY, margin: 0,
});
s.addNotes("A decisão de construir está tomada. Esta apresentação trata de COMO: arquitetura, sequenciamento e divisão de trabalho.");

/* ---------- 2 — O que vamos construir ---------- */
s = pres.addSlide();
head(s, "O PRODUTO", "O que vamos construir",
  "Uma central que cobre o ciclo completo: da detecção da oferta até a mensagem publicada com link afiliado.");

const mods = [
  { t: "Garimpo", d: "Captura contínua de ofertas, histórico de preço por SKU e cálculo de desconto real." },
  { t: "Afiliação", d: "Conversão automática de URL com a tag do próprio cliente e cofre de credenciais." },
  { t: "Disparo", d: "Curadoria em 1 clique e piloto automático com filtros, delays e spintax." },
  { t: "Conexões", d: "Pareamento de WhatsApp via QR Code e gestão de bots do Telegram." },
];
mods.forEach((m, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * (5.95 + 0.3);
  const y = 2.5 + row * 2.0;
  card(s, { x: x, y: y, w: 5.95, h: 1.7 });
  badge(s, x + 0.4, y + 0.35, i + 1);
  s.addText(m.t, {
    x: x + 1.05, y: y + 0.32, w: 4.4, h: 0.4, fontSize: 18, bold: true, color: INK,
    fontFace: HEAD, margin: 0,
  });
  s.addText(m.d, {
    x: x + 1.05, y: y + 0.82, w: 4.5, h: 0.7, fontSize: 12.5, color: INKSOFT,
    fontFace: BODY, margin: 0,
  });
});
s.addText("Modelo B2B: o cliente traz as próprias chaves de afiliado e mantém 100% da comissão.", {
  x: M, y: 6.6, w: CW, h: 0.35, fontSize: 12.5, bold: true, color: ACCENT, fontFace: BODY, margin: 0,
});
s.addNotes("Quatro módulos. O que diferencia dos concorrentes está no primeiro: histórico de preço e desconto real.");

/* ---------- 3 — Cenário competitivo ---------- */
s = pres.addSlide();
head(s, "CENÁRIO", "Mercado validado e fragmentado",
  "Onze players ativos, nenhum dominante. Para quem entra, isso é informação — não barreira.");

const cen = [
  { n: "30 mi", l: "participantes no marketing de afiliados no Brasil, crescendo 8% ao ano.", c: GREEN },
  { n: "R$ 37–297", l: "é a faixa consolidada de preço. O mercado já provou que paga.", c: GREEN },
  { n: "0", l: "players cobrindo o ciclo completo com curadoria própria verificada.", c: ACCENT },
];
cen.forEach((c, i) => {
  const x = M + i * (3.95 + 0.3);
  card(s, { x: x, y: 2.5, w: 3.95, h: 2.2 });
  s.addText(c.n, {
    x: x + 0.35, y: 2.72, w: 3.3, h: 0.75, fontSize: 34, bold: true, color: c.c,
    fontFace: HEAD, margin: 0,
  });
  s.addText(c.l, {
    x: x + 0.35, y: 3.55, w: 3.3, h: 1.0, fontSize: 12.5, color: INKSOFT,
    fontFace: BODY, margin: 0,
  });
});
card(s, { x: M, y: 5.0, w: CW, h: 1.55, fill: DARK });
s.addText("O que os concorrentes nos entregam de graça", {
  x: M + 0.45, y: 5.2, w: 5.5, h: 0.35, fontSize: 13, bold: true, color: ACCENT, fontFace: BODY, margin: 0,
});
s.addText("A lista do que é obrigatório (captura, tag própria, anti-ban, encurtador, dedupe), a faixa de preço que o mercado aceita, e o canal de aquisição que funciona no nicho: criadores de conteúdo e SEO, não outbound.", {
  x: M + 0.45, y: 5.62, w: CW - 0.9, h: 0.8, fontSize: 13, color: "E4E4E8", fontFace: BODY, margin: 0,
});
s.addNotes("Reenquadramento: 11 concorrentes num mercado de 30 milhões de participantes indica categoria validada e fragmentada. Cada um resolve um pedaço — nenhum cobre o ciclo inteiro com curadoria verificada.");

/* ---------- 4 — Nossa cunha ---------- */
s = pres.addSlide();
head(s, "POSICIONAMENTO", "Por onde entramos",
  "Três frentes onde o mercado atual não entrega — e uma vantagem que nenhum concorrente teve na largada.");

const cunha = [
  { t: "Desconto verificado", d: "Histórico de preço por SKU para provar que o desconto é real. Nenhum concorrente faz isso hoje — e é o que protege a credibilidade do canal do cliente." },
  { t: "Curadoria própria", d: "A maioria espelha os mesmos grupos-fonte, saturando os canais com ofertas repetidas. Captura direta na origem gera feed exclusivo." },
  { t: "Produto para agência", d: "Multi-tenancy e white-label para quem opera vários afiliados. Ticket maior e espaço desocupado." },
];
cunha.forEach((c, i) => {
  const x = M + i * (3.95 + 0.3);
  card(s, { x: x, y: 2.5, w: 3.95, h: 2.75 });
  badge(s, x + 0.4, 2.8, i + 1);
  s.addText(c.t, {
    x: x + 0.4, y: 3.4, w: 3.2, h: 0.4, fontSize: 16, bold: true, color: INK, fontFace: HEAD, margin: 0,
  });
  s.addText(c.d, {
    x: x + 0.4, y: 3.9, w: 3.2, h: 1.3, fontSize: 12, color: INKSOFT, fontFace: BODY, margin: 0,
  });
});
card(s, { x: M, y: 5.55, w: CW, h: 1.1, fill: DARK });
s.addText("Nossa vantagem de largada: uma rede de afiliados real validando desde a primeira versão. Feedback semanal de quem opera, com comissão medida antes e depois.", {
  x: M + 0.45, y: 5.55, w: CW - 0.9, h: 1.1, fontSize: 14, bold: true, color: LIGHT,
  valign: "middle", fontFace: BODY, margin: 0,
});
s.addNotes("As três frentes vieram da análise dos concorrentes. A vantagem de largada é o que nenhum deles teve: acesso a uma operação madura desde o dia 1.");

/* ---------- 5 — Arquitetura ---------- */
s = pres.addSlide();
head(s, "ARQUITETURA", "Como o sistema se organiza",
  "Microserviços desacoplados em Docker, comunicando por fila. Escala horizontal por worker.");

node(s, M, 2.6, 3.2, 0.95, "Painel Web", "React · Next.js · TypeScript");
s.addShape(pres.ShapeType.rightArrow, { x: 4.0, y: 2.95, w: 0.35, h: 0.25, fill: { color: ACCENT } });
node(s, 4.45, 2.6, 3.2, 0.95, "API Server", "Node · Fastify · JWT + RBAC");
s.addShape(pres.ShapeType.rightArrow, { x: 7.8, y: 2.95, w: 0.35, h: 0.25, fill: { color: ACCENT } });
node(s, 8.25, 2.6, 3.2, 0.95, "Fila de Trabalhos", "Redis · BullMQ", true);

s.addShape(pres.ShapeType.downArrow, { x: 5.9, y: 3.68, w: 0.25, h: 0.35, fill: { color: ACCENT } });
s.addShape(pres.ShapeType.downArrow, { x: 9.7, y: 3.68, w: 0.25, h: 0.35, fill: { color: ACCENT } });

node(s, 4.45, 4.12, 3.2, 0.95, "Workers de Captura", "API oficial · got-scraping");
node(s, 8.25, 4.12, 3.2, 0.95, "Workers de Disparo", "Formatação · spintax · delay");

s.addShape(pres.ShapeType.downArrow, { x: 5.9, y: 5.2, w: 0.25, h: 0.35, fill: { color: ACCENT } });
s.addShape(pres.ShapeType.downArrow, { x: 9.7, y: 5.2, w: 0.25, h: 0.35, fill: { color: ACCENT } });

node(s, 4.45, 5.64, 3.2, 0.95, "Marketplaces", "Shopee · ML · Amazon");
node(s, 8.25, 5.64, 3.2, 0.95, "Canais", "WAHA · Telegram Bot API");

s.addShape(pres.ShapeType.roundRect, {
  x: M, y: 4.12, w: 3.2, h: 2.47, rectRadius: 0.06,
  fill: { color: SOFT }, line: { color: "DEDED9", width: 1 },
});
s.addText("Persistência", {
  x: M + 0.15, y: 4.3, w: 2.9, h: 0.3, fontSize: 12.5, bold: true, color: INK,
  fontFace: BODY, align: "center", margin: 0,
});
s.addText("PostgreSQL + Prisma", {
  x: M + 0.15, y: 4.64, w: 2.9, h: 0.28, fontSize: 10.5, color: INKSOFT,
  fontFace: BODY, align: "center", margin: 0,
});
s.addText("Usuários e tenants\nCredenciais cifradas\nHistórico de preço\nRegras e filtros", {
  x: M + 0.15, y: 5.15, w: 2.9, h: 1.2, fontSize: 10.5, color: INKSOFT,
  fontFace: BODY, align: "center", lineSpacing: 16, margin: 0,
});

s.addNotes("O ponto central é a fila: ela isola a captura do disparo, permite retentativa com backoff e limita a taxa por domínio. Cada worker escala de forma independente.");

/* ---------- 6 — Stack ---------- */
s = pres.addSlide();
head(s, "STACK TECNOLÓGICA", "As escolhas por camada",
  "Prioridade em resiliência, baixo consumo de hardware e facilidade de escala horizontal.");

const stack = [
  ["Frontend", "React / Next.js · TypeScript · Tailwind · WebSockets para o feed em tempo real"],
  ["Backend", "Node.js LTS · Fastify · JWT com multi-tenant e RBAC"],
  ["Filas", "Redis · BullMQ com backoff exponencial e rate limit por domínio"],
  ["Captura", "Camada 1: APIs oficiais de afiliados · Camada 2: got-scraping · Camada 3: Playwright"],
  ["Mensageria", "WAHA em contêiner isolado (engine NOWEB) · Telegram Bot API oficial"],
  ["Dados", "PostgreSQL · Prisma ORM · credenciais cifradas em repouso"],
  ["Infra", "Docker Compose · VPS Linux · Caddy com SSL automático"],
];
stack.forEach((r, i) => {
  const y = 2.45 + i * 0.62;
  card(s, { x: M, y: y, w: CW, h: 0.52 });
  s.addText(r[0], {
    x: M + 0.35, y: y, w: 1.9, h: 0.52, fontSize: 12.5, bold: true, color: ACCENT,
    valign: "middle", fontFace: BODY, margin: 0,
  });
  s.addText(r[1], {
    x: M + 2.35, y: y, w: CW - 2.7, h: 0.52, fontSize: 12.5, color: INK,
    valign: "middle", fontFace: BODY, margin: 0,
  });
});
s.addText("Custo de licença zero: desde a versão 2026.6.1 o WAHA liberou na imagem pública todas as features que exigiam o plano Plus. Multi-sessão sem assinatura.", {
  x: M, y: 6.85, w: CW, h: 0.35, fontSize: 11.5, italic: true, color: GREEN, fontFace: BODY, margin: 0,
});
s.addNotes("A stack é a do documento original, com dois ajustes: Node LTS em vez de Bun e Fastify em vez de Express. Justificativa no próximo slide.");

/* ---------- 7 — Decisões ---------- */
s = pres.addSlide();
head(s, "DECISÕES DE EXECUÇÃO", "Cinco escolhas que definem o projeto",
  "Ajustes ao plano original, motivados por restrições externas que descobrimos na pesquisa técnica.");

const dec = [
  { t: "Shopee e Mercado Livre primeiro — Amazon depois", d: "A PA-API só libera acesso após 3 vendas qualificadas, e revoga se não houver venda via API a cada 30 dias. Amazon não pode ser a primeira integração." },
  { t: "Telegram antes de WhatsApp", d: "API oficial, gratuita e sem risco de ban. Valida captura, afiliação, formatação e disparo sem o componente mais frágil da stack." },
  { t: "API oficial primeiro, scraping como exceção", d: "Define se precisamos de proxies residenciais e Playwright já na v1. Um spike de 2 dias resolve e pode eliminar o maior custo de manutenção." },
  { t: "Node LTS e Fastify, não Bun e Express", d: "O gargalo é rede externa e rate limit, não runtime. Node dá ecossistema previsível para Prisma e Playwright; Fastify traz validação por schema." },
  { t: "IP brasileiro na camada de captura", d: "E-commerce nacional trata IP de datacenter estrangeiro como suspeito. VPS ou pool de proxies no Brasil para as requisições de coleta." },
];
dec.forEach((d, i) => {
  const y = 2.45 + i * 0.86;
  card(s, { x: M, y: y, w: CW, h: 0.74 });
  badge(s, M + 0.3, y + 0.16, i + 1);
  s.addText(d.t, {
    x: M + 1.0, y: y + 0.08, w: 4.6, h: 0.3, fontSize: 12.5, bold: true, color: INK,
    fontFace: BODY, margin: 0,
  });
  s.addText(d.d, {
    x: M + 5.7, y: y + 0.06, w: CW - 6.1, h: 0.62, fontSize: 11.5, color: INKSOFT,
    fontFace: BODY, margin: 0,
  });
});
s.addNotes("A primeira é a mais importante: a trava da PA-API é externa e não negociável. Precisamos começar as 3 vendas qualificadas da Amazon já, em paralelo ao desenvolvimento, porque leva tempo.");

/* ---------- 8 — Fundações ---------- */
s = pres.addSlide();
head(s, "FUNDAÇÕES", "Quatro coisas que não dá para adicionar depois",
  "Baratas agora, caras ou impossíveis de retrofitar quando o produto estiver rodando.");

const fund = [
  { t: "Multi-tenant no schema", d: "tenant_id em todas as tabelas e escopo obrigatório no Prisma desde a primeira migration. Já teremos dois tenants na fase de validação." },
  { t: "Histórico de preço", d: "Tabela de primeira classe gravando cada leitura de preço. Habilita o desconto verificado — e histórico não perdido não se recupera depois." },
  { t: "Uma fila por marketplace", d: "Rate limit isolado por loja. A PA-API permite 1 requisição por segundo; uma fila global faria a Amazon travar Shopee e Mercado Livre." },
  { t: "Alerta de worker morto", d: "Notificação quando um capturador retorna zero ofertas por N ciclos. É a diferença entre descobrir em uma hora e descobrir pelo cliente." },
];
fund.forEach((f, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * (5.95 + 0.3);
  const y = 2.5 + row * 1.95;
  card(s, { x: x, y: y, w: 5.95, h: 1.65 });
  s.addShape(pres.ShapeType.ellipse, { x: x + 0.4, y: y + 0.38, w: 0.28, h: 0.28, fill: { color: ACCENT } });
  s.addText(f.t, {
    x: x + 0.9, y: y + 0.28, w: 4.7, h: 0.4, fontSize: 15.5, bold: true, color: INK,
    fontFace: HEAD, margin: 0,
  });
  s.addText(f.d, {
    x: x + 0.9, y: y + 0.78, w: 4.8, h: 0.75, fontSize: 12, color: INKSOFT,
    fontFace: BODY, margin: 0,
  });
});
s.addText("Somam-se a essas: credenciais de afiliado cifradas em repouso e nunca gravadas em log. É dado sensível do cliente e responsabilidade nossa.", {
  x: M, y: 6.5, w: CW, h: 0.4, fontSize: 12, bold: true, color: ACCENT, fontFace: BODY, margin: 0,
});
s.addNotes("Quatro decisões de fundação. Nenhuma delas custa tempo relevante agora; todas custam reescrita se ficarem para depois.");

/* ---------- 9 — Roadmap ---------- */
s = pres.addSlide();
head(s, "EXECUÇÃO", "Roadmap até o lançamento",
  "Sequenciado pelas dependências externas, não pela ordem natural das funcionalidades.");

const fases = [
  { f: "FASE 0", d: "Semana 1", t: "Fundação e spike", b: "Docker, Postgres, Redis e esqueleto multi-tenant. Spike das APIs oficiais. Abrir contas de afiliado e iniciar as 3 vendas qualificadas da Amazon." },
  { f: "FASE 1", d: "Semanas 2–3", t: "Pipeline vertical", b: "Uma loja e um canal, ponta a ponta: captura, histórico de preço, conversão de link, fila e publicação no Telegram." },
  { f: "FASE 2", d: "Semanas 4–5", t: "WhatsApp e curadoria", b: "WAHA com delays e spintax. Painel de curadoria em 1 clique. Segunda loja integrada." },
  { f: "FASE 3", d: "Semanas 6–7", t: "Piloto automático", b: "Filtros e regras de disparo. Onboarding de credenciais, billing e alpha com a rede da sócia." },
  { f: "FASE 4", d: "Semana 8+", t: "Amazon e lançamento", b: "Integração da PA-API quando o acesso liberar. Abertura de vendas e programa de indicação." },
];
fases.forEach((p, i) => {
  const y = 2.45 + i * 0.88;
  card(s, { x: M, y: y, w: CW, h: 0.76 });
  s.addText(p.f, { x: M + 0.35, y: y + 0.1, w: 1.2, h: 0.28, fontSize: 11.5, bold: true, color: ACCENT, fontFace: BODY, charSpacing: 1, margin: 0 });
  s.addText(p.d, { x: M + 0.35, y: y + 0.42, w: 1.5, h: 0.28, fontSize: 11, color: MUTED, fontFace: BODY, margin: 0 });
  s.addText(p.t, { x: M + 2.05, y: y + 0.19, w: 2.6, h: 0.38, fontSize: 15, bold: true, color: INK, fontFace: HEAD, margin: 0 });
  s.addText(p.b, { x: M + 4.8, y: y + 0.06, w: CW - 5.2, h: 0.64, fontSize: 11.5, color: INKSOFT, fontFace: BODY, margin: 0 });
});
s.addText("As 3 vendas qualificadas da Amazon começam na Semana 1 e correm em paralelo — é a dependência de maior prazo e a única que não depende de nós.", {
  x: M, y: 6.95, w: CW, h: 0.35, fontSize: 11.5, italic: true, color: ACCENT, fontFace: BODY, margin: 0,
});
s.addNotes("Sete semanas assumem dedicação alta da dupla técnica. Em tempo parcial, o número honesto é 12 a 16 semanas — vale acordar isso agora.");

/* ---------- 10 — Divisão de trabalho ---------- */
s = pres.addSlide();
head(s, "TIME", "Quem faz o quê",
  "Três frentes que correm em paralelo, com pontos de encontro semanais.");

const time = [
  { t: "Backend e infraestrutura", w: "Sócio técnico", d: "Workers de captura, fila, integração com marketplaces, WAHA, Docker e deploy. Dono das decisões de arquitetura." },
  { t: "Produto e frontend", w: "Emanuel", d: "Painel, fluxo de onboarding, regras de negócio, precificação e relação com os marketplaces e gateways." },
  { t: "Validação e operação", w: "Sócia da rede", d: "Uso real desde a Fase 1, feedback semanal estruturado e medição de comissão antes e depois da ferramenta." },
];
time.forEach((t, i) => {
  const x = M + i * (3.95 + 0.3);
  card(s, { x: x, y: 2.5, w: 3.95, h: 3.0 });
  badge(s, x + 0.4, 2.8, i + 1);
  s.addText(t.t, {
    x: x + 0.4, y: 3.4, w: 3.2, h: 0.7, fontSize: 16, bold: true, color: INK, fontFace: HEAD, margin: 0,
  });
  s.addText(t.w, {
    x: x + 0.4, y: 4.15, w: 3.2, h: 0.3, fontSize: 12, bold: true, color: ACCENT, fontFace: BODY, margin: 0,
  });
  s.addText(t.d, {
    x: x + 0.4, y: 4.55, w: 3.2, h: 1.2, fontSize: 12, color: INKSOFT, fontFace: BODY, margin: 0,
  });
});
card(s, { x: M, y: 5.8, w: CW, h: 0.95, fill: DARK });
s.addText("Pendência a resolver antes da Semana 1: formalizar por escrito a participação de cada sócio e a contrapartida da validação.", {
  x: M + 0.45, y: 5.8, w: CW - 0.9, h: 0.95, fontSize: 14, bold: true, color: LIGHT,
  valign: "middle", fontFace: BODY, margin: 0,
});
s.addNotes("A pendência societária é a única que fica difícil de resolver depois — quando o produto começar a valer dinheiro, a conversa muda de tom.");

/* ---------- 11 — Riscos ---------- */
s = pres.addSlide();
head(s, "RISCOS", "O que pode dar errado, e o que fazemos",
  "Os cinco riscos com maior impacto no cronograma ou na operação do cliente.");

const risk = [
  ["Banimento de número no WhatsApp", "Canais e Comunidades como padrão da interface, delays de 30 a 90s, spintax e simulação de digitação."],
  ["Scraper quebra sem aviso", "API oficial sempre que existir; alerta automático de worker com captura zerada."],
  ["Acesso à PA-API revogado", "Manter vendas qualificadas via link de API; nunca depender de um único marketplace."],
  ["Bloqueio de IP pelo e-commerce", "IP brasileiro, rotação de headers e pool de proxies residenciais na camada de captura."],
  ["Cliente leigo não configura as chaves", "Wizard guiado por loja, começando pela Shopee, que tem o cadastro mais simples."],
];
risk.forEach((r, i) => {
  const y = 2.45 + i * 0.86;
  card(s, { x: M, y: y, w: CW, h: 0.74 });
  s.addShape(pres.ShapeType.ellipse, { x: M + 0.35, y: y + 0.23, w: 0.28, h: 0.28, fill: { color: ACCENT } });
  s.addText(r[0], {
    x: M + 0.85, y: y, w: 4.6, h: 0.74, fontSize: 12.5, bold: true, color: INK,
    valign: "middle", fontFace: BODY, margin: 0,
  });
  s.addText(r[1], {
    x: M + 5.7, y: y, w: CW - 6.1, h: 0.74, fontSize: 11.5, color: INKSOFT,
    valign: "middle", fontFace: BODY, margin: 0,
  });
});
s.addNotes("O risco de ban é o principal gerador de suporte em qualquer produto dessa categoria. Direcionar para Canais precisa ser o padrão da UI, não uma nota na documentação.");

/* ---------- 12 — Modelo comercial ---------- */
s = pres.addSlide();
head(s, "MODELO COMERCIAL", "Planos e precificação",
  "Alinhado à faixa que o mercado já pratica, com o limite atrelado ao que de fato nos custa.");

const planos = [
  { n: "Starter", p: "R$ 57", d: ["1 conexão", "Curadoria manual", "Todas as lojas liberadas", "Volume de disparo limitado"], hl: false },
  { n: "Pro", p: "R$ 97", d: ["Piloto automático 24/7", "Filtros avançados", "Canais ilimitados", "Suporte prioritário"], hl: true },
  { n: "Agência", p: "R$ 197", d: ["Múltiplas conexões", "Sub-contas por afiliado", "Relatórios de conversão", "Marca própria"], hl: false },
];
planos.forEach((p, i) => {
  const x = M + i * (3.95 + 0.3);
  card(s, { x: x, y: 2.5, w: 3.95, h: 3.15, fill: p.hl ? DARK : SOFT });
  s.addText(p.n, {
    x: x + 0.4, y: 2.78, w: 3.2, h: 0.35, fontSize: 13, bold: true, color: ACCENT,
    fontFace: BODY, charSpacing: 1, margin: 0,
  });
  s.addText(p.p, {
    x: x + 0.4, y: 3.15, w: 3.2, h: 0.7, fontSize: 34, bold: true, color: p.hl ? LIGHT : INK,
    fontFace: HEAD, margin: 0,
  });
  s.addText("por mês", {
    x: x + 0.4, y: 3.88, w: 3.2, h: 0.28, fontSize: 11.5, color: p.hl ? "C9C9CF" : MUTED,
    fontFace: BODY, margin: 0,
  });
  s.addText(p.d.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < p.d.length - 1 } })), {
    x: x + 0.4, y: 4.3, w: 3.2, h: 1.2, fontSize: 12, color: p.hl ? "E4E4E8" : INK,
    fontFace: BODY, paraSpaceAfter: 5, margin: 0,
  });
});
card(s, { x: M, y: 5.95, w: CW, h: 1.0 });
s.addText("Limite por conexão e volume de disparo, nunca por número de lojas. Nosso custo real é a instância de WhatsApp conectada — é isso que a precificação precisa refletir. Degustação apenas com Telegram, cujo custo é próximo de zero.", {
  x: M + 0.45, y: 5.95, w: CW - 0.9, h: 1.0, fontSize: 13, color: INK, valign: "middle",
  fontFace: BODY, margin: 0,
});
s.addNotes("Travar lojas frustra o cliente e não reflete custo. Os concorrentes cobram o WhatsApp à parte justamente porque é o item caro: R$100 a R$150 por sessão.");

/* ---------- 13 — Próximos passos ---------- */
s = pres.addSlide();
s.background = { color: DARK };
s.addText("PRÓXIMOS 14 DIAS", {
  x: M, y: 0.9, w: CW, h: 0.3, fontSize: 11, bold: true, color: ACCENT,
  fontFace: BODY, charSpacing: 2, margin: 0,
});
s.addText("Por onde começamos", {
  x: M, y: 1.3, w: CW, h: 0.7, fontSize: 34, bold: true, color: LIGHT, fontFace: HEAD, margin: 0,
});

const next = [
  ["Spike técnico das APIs", "Dois dias para mapear o que Shopee e Mercado Livre entregam de verdade. Define se precisamos de proxies e Playwright na v1."],
  ["Contas de afiliado abertas", "Iniciar as 3 vendas qualificadas da Amazon. É a dependência de maior prazo e não depende de código."],
  ["Sessão de mapeamento com a sócia", "Reconstruir o fluxo atual dela minuto a minuto. É a especificação do MVP, e já existe pronta."],
  ["Acordo societário por escrito", "Participação de cada um e contrapartida da validação, antes de a primeira linha de código existir."],
];
next.forEach((n, i) => {
  const y = 2.5 + i * 1.05;
  badge(s, M, y + 0.1, i + 1);
  s.addText(n[0], {
    x: M + 0.75, y: y, w: 3.7, h: 0.35, fontSize: 14.5, bold: true, color: LIGHT, fontFace: BODY, margin: 0,
  });
  s.addText(n[1], {
    x: M + 4.7, y: y + 0.02, w: 7.2, h: 0.75, fontSize: 12.5, color: "C9C9CF", fontFace: BODY, margin: 0,
  });
});
s.addText("Revisão de progresso ao final da Semana 1, com o resultado do spike em mãos.", {
  x: M, y: 6.85, w: CW, h: 0.35, fontSize: 12.5, bold: true, color: ACCENT, fontFace: BODY, margin: 0,
});
s.addNotes("Quatro ações concretas. Duas delas — vendas qualificadas da Amazon e acordo societário — têm prazo longo e não dependem de desenvolvimento, então começam agora.");

pres.writeFile({ fileName: "/sessions/eager-wonderful-lamport/mnt/outputs/plano-construcao-automacao-afiliados.pptx" })
  .then(f => console.log("OK:", f));
