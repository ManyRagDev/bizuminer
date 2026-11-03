import {
  emptyContent,
  validateWorkspace,
  type MarketingContent,
  type MarketingWorkspace,
} from "./marketing-contract.ts";

export const EDITORIAL_POSTS = [
  {
    slug: "luz-no-armario",
    title: "Armário escuro? A luz precisa chegar lá dentro.",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "Armário escuro? A luz precisa chegar lá dentro.",
        "Armário desenhado com interior escuro; destaque de luz só dentro dele.",
      ],
      [
        "Abriu a porta, achou o que procurava.",
        "Duas vistas do mesmo armário; use um esquema, sem simular teste de produto.",
      ],
      [
        "Comece pelo lugar que precisa de luz: uma prateleira, a arara ou o armário inteiro.",
        "Marque três áreas do armário com traços simples.",
      ],
      [
        "A indicação precisa combinar tamanho, fixação e alimentação com esse espaço.",
        "Três ícones: régua, suporte e fonte de energia. Sem especificações inventadas.",
      ],
      [
        "Veja as indicações atuais de iluminação no link do perfil.",
        "Fechamento limpo com nome BizuMiner e uma única seta para o perfil.",
      ],
    ],
    caption:
      "A luz do quarto pode deixar o interior do armário na sombra. Uma iluminação pensada para esse espaço ajuda a enxergar o que está lá dentro.\n\nNa escolha, a gente olha onde a luz vai ficar, como o modelo é instalado e como recebe energia. As características precisam estar descritas no anúncio do modelo indicado.",
    cta: "Veja as indicações atuais de iluminação no link do perfil.",
  },
  {
    slug: "organizador-porta-fechada",
    title: "Esse organizador cabe com a porta fechada?",
    intention: "Retenção",
    metric: "Salvamentos",
    slides: [
      [
        "Esse organizador cabe com a porta fechada?",
        "Esquema lateral de armário e porta, com uma linha de profundidade.",
      ],
      [
        "A foto mostra o produto. O seu espaço define o encaixe.",
        "Foto autoral de uma fita métrica num espaço vazio ou diagrama equivalente.",
      ],
      [
        "Largura, altura e profundidade: use as medidas internas do móvel.",
        "Três setas de medida no mesmo desenho. Não invente centímetros.",
      ],
      [
        "Reserve espaço para a porta fechar e para tirar o que você guardou.",
        "Mostre a trajetória da porta e de uma mão retirando um objeto.",
      ],
      [
        "Salve este roteiro para a próxima compra de organizador.",
        "Cartão com as três medidas e os dois movimentos: abrir e retirar.",
      ],
    ],
    caption:
      "Organizador bom é o que cabe no móvel e funciona na rotina. A medida de fora do armário não substitui o espaço disponível por dentro.\n\nLargura, altura e profundidade ajudam a escolher. O teste do desenho é simples: a porta fecha e o objeto sai sem desmontar tudo?",
    cta: "Salve para consultar antes de escolher seu próximo organizador.",
  },
  {
    slug: "fixacao-antes-da-compra",
    title: "Adesivo ou parafuso? A fixação vem antes da compra.",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "Adesivo ou parafuso? A fixação vem antes da compra.",
        "Dois caminhos visuais, com suporte adesivo de um lado e parafuso do outro.",
      ],
      [
        "O mesmo cantinho pode pedir instalações diferentes.",
        "Mostre duas superfícies esquemáticas, sem atribuir compatibilidade a um modelo.",
      ],
      [
        "Para adesivo, procure a indicação de superfície e preparo do fabricante.",
        "Close ilustrado de uma ficha de instruções, sem criar selos ou números.",
      ],
      [
        "Para parafuso, veja as peças incluídas e como o suporte é montado.",
        "Vista explodida genérica do suporte; marque que é um esquema.",
      ],
      [
        "Veja as indicações atuais e a instalação de cada modelo no link do perfil.",
        "Fechamento com convite para consultar os modelos atuais.",
      ],
    ],
    caption:
      "O produto pode ser útil, mas a instalação precisa combinar com o lugar onde você quer usá-lo.\n\nAdesivo e parafuso não são soluções intercambiáveis para qualquer superfície. A escolha acompanha as instruções do modelo, os acessórios incluídos e o que você pode instalar nesse espaço.",
    cta: "Veja as indicações atuais no link do perfil e confira a instalação do modelo.",
  },
  {
    slug: "sensor-lugar-certo",
    title: "Sensor de presença: onde você quer que a luz acenda?",
    intention: "Retenção",
    metric: "Salvamentos",
    slides: [
      [
        "Sensor de presença: onde você quer que a luz acenda?",
        "Pessoa abrindo um armário; ponto de luz e sensor separados visualmente.",
      ],
      [
        "O lugar da luminária também é o lugar de onde o sensor percebe movimento.",
        "Diagrama de posicionamento com a palavra esquema; sem desenhar alcance como dado real.",
      ],
      [
        "A porta aberta, uma prateleira ou os objetos podem mudar o espaço disponível para instalar.",
        "Desenhe três posições possíveis e seus obstáculos, sem prometer desempenho.",
      ],
      [
        "Compare os modos descritos no anúncio: movimento, luminosidade e acionamento manual, quando existirem.",
        "Três rótulos condicionais, sem atribuir todos os modos a qualquer produto.",
      ],
      [
        "Salve esta referência para escolher o modelo para o seu espaço.",
        "Fechamento com um mini mapa de armário e o ponto de instalação.",
      ],
    ],
    caption:
      "Quer abrir o armário e encontrar a luz no lugar certo? Pense no ponto de instalação junto com o produto.\n\nO modo de funcionamento e as orientações de posicionamento variam entre modelos. Use as instruções do fabricante como referência; a foto de divulgação não substitui essa informação.",
    cta: "Salve para consultar quando for escolher uma luminária com sensor.",
  },
  {
    slug: "organizar-e-enxergar",
    title: "Organizar também é conseguir enxergar o que você guardou.",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "Organizar também é conseguir enxergar o que você guardou.",
        "Prateleira desenhada com objetos visíveis, sem encenação de resultado de um produto.",
      ],
      [
        "Se o item de todo dia fica atrás, você precisa abrir caminho toda vez.",
        "Destaque um objeto ao fundo e o trajeto até ele.",
      ],
      [
        "Separe pelo uso: o que sai sempre fica fácil de alcançar.",
        "Três grupos genéricos: diário, ocasional e reserva.",
      ],
      [
        "O organizador entra para apoiar essa divisão: medida, abertura e acesso fazem parte da escolha.",
        "Desenho simples com cesto aberto e divisória, sem alegações de capacidade.",
      ],
      [
        "Veja as indicações atuais de organização no link do perfil.",
        "Uma única chamada para consultar a seleção atual.",
      ],
    ],
    caption:
      "A ideia é encontrar e pegar sem reconstruir a prateleira inteira.\n\nAntes de escolher o formato do organizador, defina o que vai ficar junto e com que frequência você usa esses itens. Assim, a compra acompanha uma necessidade concreta do espaço.",
    cta: "Veja as indicações atuais de organização no link do perfil.",
  },
  {
    slug: "kit-ou-avulso",
    title: "Kit ou avulso? Compare o que chega na caixa.",
    intention: "Retenção",
    metric: "Salvamentos",
    slides: [
      [
        "Kit ou avulso? Compare o que chega na caixa.",
        "Uma caixa com múltiplas peças e outra com uma; desenho sem preços.",
      ],
      [
        "Comece pela quantidade da opção selecionada.",
        "Destaque uma seleção de versão ilustrativa, sem imitar anúncio real.",
      ],
      [
        "Veja se as peças têm as mesmas medidas ou se o kit mistura tamanhos.",
        "Duas composições de kit identificadas como exemplos visuais.",
      ],
      [
        "Para peças equivalentes: total com frete dividido pela quantidade ajuda a comparar.",
        "Fórmula por extenso, sem valores fictícios.",
      ],
      [
        "Salve esta comparação para a próxima compra de kit.",
        "Mini resumo: quantidade, medidas, conteúdo e total com frete.",
      ],
    ],
    caption:
      "A foto pode mostrar várias opções juntas. A compra corresponde à versão selecionada.\n\nNo comparativo de kit e avulso, a gente separa quantidade, medidas e conteúdo. O custo por peça ajuda quando as peças são equivalentes e o cálculo considera o total com frete.",
    cta: "Salve para comparar kit e avulso na próxima compra.",
  },
  {
    slug: "barra-ou-ponto-de-luz",
    title: "Uma barra de luz ou um ponto de luz?",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "Uma barra de luz ou um ponto de luz?",
        "Duas silhuetas genéricas de luminária; sem marcas e sem preços.",
      ],
      [
        "Primeiro, desenhe a área que você quer iluminar.",
        "Uma arara comprida e um nicho pequeno, com a área desejada marcada.",
      ],
      [
        "O formato pode orientar a comparação. A área iluminada depende das características do modelo.",
        "Mesmo esquema com dimensões sem números e indicação de consultar especificações.",
      ],
      [
        "Olhe o conjunto: tamanho, luz descrita, posição e forma de instalar.",
        "Quatro etiquetas visuais simples, sem comparação de potência inventada.",
      ],
      [
        "Veja os modelos atuais de iluminação no link do perfil.",
        "Encerramento com chamada para a seleção atual.",
      ],
    ],
    caption:
      "Para uma prateleira, um nicho ou uma arara, o ponto de partida é o espaço que você quer enxergar melhor.\n\nO formato da luminária ajuda a organizar a busca. Para escolher um modelo, entram as características de luz e instalação descritas pelo fabricante.",
    cta: "Veja as indicações atuais de iluminação no link do perfil.",
  },
  {
    slug: "medida-livre-para-usar",
    title: "Cabe na gaveta. Mas dá para usar?",
    intention: "Retenção",
    metric: "Salvamentos",
    slides: [
      [
        "Cabe na gaveta. Mas dá para usar?",
        "Gaveta com divisórias e um objeto saindo, em desenho autoral.",
      ],
      [
        "A gaveta precisa abrir com o organizador e os objetos dentro.",
        "Vista lateral com altura do conjunto marcada, sem números.",
      ],
      [
        "A mão precisa alcançar o que está no fundo.",
        "Vista superior com um caminho de acesso desenhado.",
      ],
      [
        "A divisão faz sentido para os itens que você realmente guarda.",
        "Objetos genéricos em grupos coerentes; não prometer capacidade.",
      ],
      [
        "Salve a pergunta que vale junto da medida: cabe e dá para usar?",
        "Resumo visual com as duas perguntas, sem chamada secundária.",
      ],
    ],
    caption:
      "A medida é o começo. O uso é a segunda parte da escolha.\n\nPense no conjunto montado: organizador, objetos, abertura da gaveta e acesso com a mão. É esse conjunto que precisa funcionar todos os dias.",
    cta: "Salve para consultar antes de escolher divisórias ou organizadores de gaveta.",
  },
  {
    slug: "energia-na-rotina",
    title: "Recarregável ou tomada? Pense no lugar e na rotina.",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "Recarregável ou tomada? Pense no lugar e na rotina.",
        "Ícone de recarga e ícone de cabo, com mesmo peso visual.",
      ],
      [
        "Onde você quer instalar tem um ponto de energia acessível?",
        "Mapa simples do espaço e do caminho do cabo, sem instrução elétrica.",
      ],
      [
        "No modelo recarregável, veja como ele é retirado ou conectado para carregar.",
        "Esquema de acesso para recarga; nenhum número de autonomia.",
      ],
      [
        "No modelo com cabo, confira alimentação e acessórios descritos para a versão.",
        "Ilustração de ficha do produto; não atribuir fonte incluída sem evidência.",
      ],
      [
        "Veja as opções atuais de iluminação no link do perfil.",
        "Fechamento com chamada única para os modelos atuais.",
      ],
    ],
    caption:
      "O melhor encaixe também depende de como você vai alimentar a luminária no uso diário.\n\nA gente compara o acesso para recarga ou conexão, o que vem com a versão e as informações de alimentação. Autonomia e acessórios variam entre modelos; use os dados do anúncio específico.",
    cta: "Veja as indicações atuais de iluminação no link do perfil.",
  },
  {
    slug: "bancada-que-continua-livre",
    title: "Organizar a bancada e continuar com espaço para usar.",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "Organizar a bancada e continuar com espaço para usar.",
        "Bancada esquemática com uma área de uso claramente reservada.",
      ],
      [
        "Defina o que precisa ficar à mão.",
        "Poucos itens genéricos de uso diário destacados.",
      ],
      [
        "O resto pode ocupar outro lugar, conforme o seu uso.",
        "Dois espaços de armazenamento no desenho, sem prometer ganho de área.",
      ],
      [
        "Escolha o organizador pela base que ele ocupa e pelo acesso aos itens.",
        "Contorno da base e direção de retirada dos objetos.",
      ],
      [
        "Veja as indicações atuais de organização no link do perfil.",
        "Convite único para a seleção atual.",
      ],
    ],
    caption:
      "Uma bancada organizada precisa continuar disponível para o que você faz nela.\n\nComece pelos itens que precisam ficar à mão. O formato do organizador vem depois, considerando a área da base e como você acessa cada coisa.",
    cta: "Veja as indicações atuais de organização no link do perfil.",
  },
  {
    slug: "foto-e-unidade",
    title: "A foto mostra várias peças. Qual opção vai chegar?",
    intention: "Retenção",
    metric: "Salvamentos",
    slides: [
      [
        "A foto mostra várias peças. Qual opção vai chegar?",
        "Composição ilustrativa de tamanhos diferentes; identifique como esquema.",
      ],
      [
        "Uma imagem pode reunir cores, tamanhos ou quantidades diferentes.",
        "Separe visualmente três opções possíveis, sem atribuir isso a uma loja.",
      ],
      [
        "A referência da compra é a opção selecionada e o conteúdo descrito.",
        "Destaque versão, quantidade e conteúdo do pacote em uma ficha genérica.",
      ],
      [
        "No comparativo, mantenha a mesma quantidade e medida.",
        "Duas fichas lado a lado com os campos iguais destacados; sem preços.",
      ],
      [
        "Salve este lembrete: foto, opção e conteúdo precisam combinar.",
        "Fechamento com os três itens em sequência.",
      ],
    ],
    caption:
      "Na hora de indicar um kit, uma peça ou um tamanho, a gente mantém a foto alinhada à opção da compra.\n\nA composição da imagem não basta para definir o pacote. Quantidade, medidas e acessórios vêm da descrição da versão selecionada.",
    cta: "Salve para consultar antes de escolher a opção do anúncio.",
  },
  {
    slug: "compra-com-uso-definido",
    title: "O que precisa melhorar aí: pegar, guardar ou enxergar?",
    intention: "Conversão",
    metric: "Acessos às indicações atuais",
    slides: [
      [
        "O que precisa melhorar aí: pegar, guardar ou enxergar?",
        "Três cenas esquemáticas: alcançar, organizar e iluminar.",
      ],
      [
        "Pegar: o item que você usa fica acessível?",
        "Um objeto sendo retirado sem mover os demais.",
      ],
      [
        "Guardar: o espaço comporta o que precisa ficar junto?",
        "Grupo de objetos e contorno do lugar disponível.",
      ],
      [
        "Enxergar: a luz chega ao ponto em que você procura?",
        "Uma área desejada de luz dentro de um móvel.",
      ],
      [
        "Escolha a situação. Veja as indicações atuais no link do perfil.",
        "Três categorias com uma única seta para o perfil.",
      ],
    ],
    caption:
      "Um bom achado tem uma função clara na sua casa.\n\nA gente organiza as indicações em torno dessas situações: facilitar o acesso, guardar o que fica junto e levar luz ao lugar de uso. Daí vêm os critérios de tamanho, instalação e versão.",
    cta: "Veja as indicações atuais de organização e iluminação no link do perfil.",
  },
] as const;

export function editorialStarterContents(): MarketingContent[] {
  return EDITORIAL_POSTS.map((post, index) => ({
    ...emptyContent("casa-2026-" + post.slug, "casa-2026-pub-" + post.slug),
    title: post.title,
    headline: post.slides[0][0],
    body: post.slides.map((slide) => slide[0]).join("\n\n"),
    caption: post.caption,
    cta: post.cta,
    pillar: post.intention === "Conversão" ? "Benefício" : "Como usar",
    format: "Carrossel",
    week: Math.floor(index / 3) + 1,
    notes:
      "Intenção: " +
      post.intention +
      ". Métrica: " +
      post.metric +
      ".\n\n" +
      post.slides
        .map((slide, i) => "Imagem " + (i + 1) + ": " + slide[1])
        .join("\n\n") +
      "\n\nPreparar as artes finais. Esquemas não representam teste de um produto específico. Fotos de produtos precisam corresponder à versão e ter uso permitido. Ofertas e preços ficam no WhatsApp e nos Stories.",
    references: "social/posts/post-" + (17 + index) + "-" + post.slug + ".md",
    assets: [],
  }));
}

export function isStarterContent(content: MarketingContent) {
  return content.id.startsWith("casa-2026-");
}

/** Append the authored pack once, preserving every existing edit, publication and attachment. */
export function withEditorialStarter(
  workspace: MarketingWorkspace,
): MarketingWorkspace {
  const ids = new Set(workspace.contents.map((content) => content.id));
  const missing = editorialStarterContents().filter(
    (content) => !ids.has(content.id),
  );
  if (workspace.contents.length + missing.length > 250) return workspace;
  const next = { ...workspace, contents: [...missing, ...workspace.contents] };
  const active = next.routine?.days.find(
    (day) => day.date === next.routine?.activeDate,
  );
  if (active && !active.contentId) {
    const suggestion = suggestedRoutineContent(next);
    if (suggestion)
      next.routine = {
        ...next.routine!,
        days: next.routine!.days.map((day) =>
          day.date === active.date ? { ...day, contentId: suggestion.id } : day,
        ),
      };
  }
  if (!missing.length && next.routine === workspace.routine) return workspace;
  try {
    validateWorkspace(next);
    return next;
  } catch {
    return workspace;
  }
}

export function suggestedRoutineContent(
  workspace: MarketingWorkspace,
): MarketingContent | undefined {
  const completedFeed = new Set(
    (workspace.routine?.days ?? [])
      .filter(
        (day) =>
          day.steps.content.status === "done" &&
          [2, 4, 6].includes(new Date(day.date + "T12:00:00Z").getUTCDay()),
      )
      .map((day) => day.contentId),
  );
  const available = (content: MarketingContent) =>
    !content.archived &&
    !completedFeed.has(content.id) &&
    !content.publications.some((p) => p.publishedDate);
  for (const day of [...(workspace.routine?.days ?? [])].reverse()) {
    const previous = workspace.contents.find(
      (content) => content.id === day.contentId,
    );
    if (previous && isStarterContent(previous) && available(previous))
      return previous;
  }
  return workspace.contents.find(
    (content) => isStarterContent(content) && available(content),
  );
}
