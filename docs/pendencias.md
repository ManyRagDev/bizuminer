# Pendências — export da sessão de 19–20/08/2026

Não é spec. É o resumo prático de tudo que essa conversa decidiu, construiu e deixou em aberto — para quem chegar depois (inclusive uma versão futura de mim) não precisar reconstruir o raciocínio do zero. Os documentos vivos (`estado-do-projeto.md`, os `plano-*.md`) têm o detalhe técnico; este aqui é o mapa de "o que fazer a seguir e por quê".

---

## O que já está pronto

**Área do cliente** (`/minha-area`) — salvos sincronizados com o servidor (o coração da vitrine grava lá, localStorage virou só cache), "de olho no preço" com baseline e ticker de movimento ("caiu R$32 desde 14/08"), recomendações com o motivo declarado, perfil com categorias e faixa de preço. Redesenhada depois do primeiro feedback ("ficou meio feia") — ganhou ritmo de superfícies como a vitrine, o ácido de volta como assinatura de marca, hero em duas colunas.

**Painel do dono** (`/admin`) — telemetria (produtos, observações, rodagens, cliques, assinantes, dados da área do cliente), tabela de rodagens com destaque pra vazia/erro, botão de acionar rodagem nova.

**Dois bugs achados e corrigidos no caminho:**
- `garimpa.subscriber` existia só como arquivo, nunca tinha sido aplicada no banco — newsletter respondia 500 em silêncio desde 17/08. Corrigido.
- O perfil do cliente validava categorias contra a última varredura, não o catálogo inteiro — uma rodagem curta apagava preferência salva sem avisar. Corrigido com teste que reproduz o defeito exato.

**A régua do projeto** — os documentos de estratégia de julho (`docs/estrategia/*`) descreviam um SaaS B2B (OfertaFlow) que não é o que foi construído. Marcados como histórico/suplantado. `docs/estado-do-projeto.md` criado como documento mestre: o BizuMiner é o produto, B2C, comissão da casa, vocês são o único canal de distribuição (nada de compartilhamento por cliente como mecanismo de crescimento).

**D-1 do plano de distribuição** — o card que aparece quando um link é colado no WhatsApp/Telegram. Construído, testado contra o banco, com 3 bugs do Satori descobertos e corrigidos (detalhe abaixo). Aguardando conferência visual do dono e teste em WhatsApp/Telegram reais (trava no domínio próprio).

---

## O plano de distribuição — as 6 decisões e os 6 D's

Registrado em `docs/tecnico/plano-distribuicao.md`. Veio de uma correção importante do dono no meio da conversa: **o cliente não compartilha, vocês são o único canal.** WhatsApp manual (você posta como pessoa, zero automação — resolve de vez o risco jurídico que o brief antigo tinha mapeado), Telegram por Bot API oficial.

Decisões fechadas nesta sessão:
- Card v1 só com selo em texto, sem mini-gráfico (vem quando o histórico for denso)
- Canal do Telegram público desde o início
- Cadência de publicação (um a um vs. lote) fica flexível — o formato emerge da seleção no composer, não é travado
- **O aviso de queda de preço é individual, não broadcast.** Quem marcou "de olho" recebe o aviso daquele produto — nunca a lista inteira. Ordem de canal: painel sempre → e-mail como padrão → Telegram opcional (deep link) → WhatsApp só com autorização explícita e registrada, por último e só se o dado justificar o custo
- Copy: soar humano, não parecer anúncio; gatilho sempre vem do dado real (nunca fabricar urgência que o histórico não sustenta)
- Preço envelhecido no card cacheado vira demonstração de honestidade: a página compara o preço do momento da publicação com o atual, e só mostra isso se o valor existir de fato no histórico (evita adulteração via URL)

| Fase | O quê | Status |
|---|---|---|
| D-1 | Card OG em `/bizu/[slug]` | 🟡 feito, aguardando conferência |
| D-2 | Composer no painel (escolher produto/destino, gerar mensagem) | 🟡 entregue 20/08, aguardando conferência |
| D-3 | Atribuição por destino (`via` no clique e no subId) | ⬜ depende de D-2 |
| D-4 | Comparação de preço na chegada | ⬜ depende de D-3 |
| D-5 | Publicação no canal do Telegram com botão inline | ⬜ depende de D-2 |
| D-6 | Alerta individual por Telegram | ⬜ depende da varredura recorrente |

D-3 e D-5 não dependem um do outro — podem ser feitos em qualquer ordem depois de D-2.

---

## Os 3 bugs do card OG (vale registrar — vão se repetir em qualquer imagem gerada por `next/og` neste projeto)

Todos os três mascarados pelo **mesmo erro minificado e inútil** (`TypeError: u2 is not iterable`), que não aponta a causa. Só achados por bisecção (comentar bloco, testar, reintroduzir).

1. `width: "fit-content"` não existe no motor de layout do Satori (Yoga). Usar `alignSelf: "flex-start"`.
2. `textDecoration: "line-through"` também não é suportado. Sem substituto direto — usar contraste de tamanho/cor.
3. **O mais importante:** fotos do Mercado Livre vêm em WebP por padrão, e o Satori não decodifica WebP. A mesma URL da CDN (`mlstatic.com`) aceita trocar a extensão `.webp` por `.jpg` e devolve JPEG de verdade. Isso vale para qualquer lugar futuro que busque imagem do ML no servidor (não só `next/image`, que já lida com isso sozinho).

---

## O que falta decidir (só o dono decide)

- **Cron da varredura: GitHub Actions**, decidido nesta sessão. Falta configurar o secret `DATABASE_URL` no repositório e escrever o workflow (`.github/workflows/sweep.yml`) — ninguém fez isso ainda, só a decisão foi tomada.
- **Bot do Telegram**: criar no BotFather, guardar o token. Cinco minutos, ninguém fez ainda.
- **Domínio `bizuminer.com.br`**: dono disse que compra "hoje ainda" (20/08). Quando comprar, só apontar o DNS — o código já resolve o endereço-base sozinho (`lib/site-url.ts`), não precisa mexer em nada.
- **Provedor de e-mail**: SMTP da Hostinger, decidido. Só ativa depois que o domínio existir (verificação de DNS). Vale checar o limite de envio por hora do plano antes de contar com ele em volume.
- **`/admin` publicado ou só local**: parou de ser bloqueante. Como o acionamento de rodagem vai passar a pedir execução ao GitHub Actions (não mais `spawn` de processo local, que não funcionaria na Vercel), o painel funciona igual hospedado ou rodando na sua máquina. Decide quando quiser.

## Bloqueios duros que continuam de pé (pré qualquer deploy público de peso)

- RLS desabilitada em todo o schema `garimpa`
- `/admin` sem autenticação
- Área do cliente identificada só por cookie (perde tudo se limpar)

Nenhum dos três impede o uso atual (baixo risco, deploy provisório sem tráfego). Todos impedem escalar.

---

## Ordem prática sugerida a partir de daqui

1. Configurar o cron (GitHub Actions + secret) — destrava histórico denso, que destrava quase tudo o resto
2. Comprar o domínio (já em andamento) e apontar o DNS
3. Conferir visualmente os 4 PNGs do card D-1 (estão em `%TEMP%\og-final-*.png` nesta máquina) e testar colar um link real no WhatsApp/Telegram assim que o domínio resolver
4. D-2: entregue (20/08) — conferir o composer e validar a copy gerada em chat real após o domínio
5. D-3/D-5 em paralelo, D-4 na sequência de D-3
6. Autenticação + RLS + gate do admin, quando o volume justificar

## Onde está cada coisa

| Assunto | Arquivo |
|---|---|
| Estado geral do projeto, régua, bloqueios | `docs/estado-do-projeto.md` |
| Área do cliente e painel do dono | `docs/tecnico/plano-area-logada.md` |
| Distribuição (card, copy, composer, Telegram, alerta) | `docs/tecnico/plano-distribuicao.md` |
| Handoff já executado do card | `docs/tecnico/handoff-d1-card.md` |
| Varredura recorrente, decisão do GitHub Actions | `docs/tecnico/plano-motor-curadoria.md`, fase M1-C |
| Vitrine pública | `docs/tecnico/plano-ux-vitrine.md` |
| Brief antigo (histórico, não usar para decidir) | `docs/estrategia/*` |
