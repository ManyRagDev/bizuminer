import {
  emptyContent,
  type MarketingWorkspace,
  type MarketingContent,
} from "./marketing-contract.ts";

const PLAN: Array<
  [string, string, MarketingContent["pillar"], string, string]
> = [
  [
    "Conheça o BizuMiner",
    "Comprar online exige pesquisa. Conheça o BizuMiner.",
    "Apresentação",
    "Conhecer o site pelo link do perfil",
    "O que é, que dificuldade ajuda a resolver e o que se encontra ao acessar.",
  ],
  [
    "Sua pesquisa pode começar mais organizada",
    "Menos pesquisa espalhada. Mais contexto para escolher.",
    "Benefício",
    "Visitar o perfil e conhecer",
    "Apresentar a proposta de valor com uma única mensagem clara.",
  ],
  [
    "Seu primeiro acesso ao BizuMiner",
    "Chegou agora? Veja por onde começar.",
    "Como usar",
    "Abrir o site e experimentar",
    "Três passos reais da página inicial até entender uma oferta. Conferir o percurso público antes de produzir.",
  ],
  [
    "Muitas abas abertas?",
    "Sua próxima pesquisa pode começar aqui.",
    "Benefício",
    "Começar uma pesquisa no site",
    "Mostrar pesquisa dispersa e como o BizuMiner organiza informações, com captura atual.",
  ],
  [
    "Um desconto não conta a história inteira",
    "Além do percentual, olhe o contexto.",
    "Confiança",
    "Conhecer a proposta no perfil",
    "Relacionar preço anunciado e contexto disponível. Evitar prometer menor preço da internet.",
  ],
  [
    "Como ler as informações de preço",
    "Entenda o que o preço está dizendo.",
    "Como usar",
    "Abrir uma página com a informação explicada",
    "Usar dados reais e explicar rótulos e limites dos registros disponíveis.",
  ],
  [
    "O que ajuda sua escolha",
    "Mais informação para a sua decisão.",
    "Confiança",
    "Explorar o site com esses critérios",
    "Mostrar informações efetivamente disponíveis e como consultar suas fontes.",
  ],
  [
    "Quem decide a compra é você",
    "Um bom bizu ajuda você a decidir.",
    "Confiança",
    "Visitar o BizuMiner",
    "Explicar o papel da curadoria e a autonomia do comprador.",
  ],
  [
    "Onde compro? Como o BizuMiner se mantém?",
    "Conheça o caminho da pesquisa à loja.",
    "Confiança",
    "Conhecer o site ou enviar uma dúvida",
    "Explicar percurso até a loja e comissão de afiliado em linguagem simples.",
  ],
  [
    "Uma próxima compra em vista?",
    "Comece sua próxima pesquisa pelo BizuMiner.",
    "Como usar",
    "Experimentar o percurso no site",
    "Repetir o percurso mais útil, com poucas etapas e captura real.",
  ],
  [
    "Lembre do BizuMiner",
    "Antes da próxima compra, lembre deste bizu.",
    "Retorno",
    "Guardar a referência ou visitar",
    "Nome, benefício principal e endereço do site.",
  ],
  [
    "Três coisas para conhecer no BizuMiner",
    "Um pequeno tour. Uma pesquisa mais organizada.",
    "Retorno",
    "Conhecer ou voltar ao site",
    "Reunir três informações ou ações reais já apresentadas e reforçar para quem serve.",
  ],
];

/** Carga única independente de Markdown. Não reaplica nem sobrescreve edições. */
export function initialMarketingWorkspace(): MarketingWorkspace {
  const contents = PLAN.map(([title, headline, pillar, cta, notes], index) => {
    const content = emptyContent(
      `plan-${index + 1}`,
      `publication-${index + 1}`,
    );
    return {
      ...content,
      title,
      headline,
      pillar,
      cta,
      notes,
      week: Math.floor(index / 3) + 1,
      format: index % 3 === 1 ? ("Imagem" as const) : ("Carrossel" as const),
    };
  });
  contents[0].body =
    "1. Comprar online exige pesquisa. Conheça o BizuMiner.\n\n2. Ofertas, preços e condições espalhados em várias páginas deixam a comparação cansativa.\n\n3. O BizuMiner reúne ofertas e organiza informações de preço para ajudar você a pesquisar.\n\n4. Mostrar uma captura atual, ampliando uma informação real e explicando-a em uma frase.\n\n5. Veja como funciona. Acesse o link do perfil.";
  contents[0].caption =
    "Conheça o BizuMiner: ofertas e contexto de preço para pesquisar suas compras. Veja como funciona pelo link do perfil.";
  return { version: 1, contents, ideas: [], scratchpad: "" };
}
