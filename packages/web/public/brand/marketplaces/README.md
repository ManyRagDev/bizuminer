# Logos das lojas parceiras

Arquivos esperados por `packages/web/lib/marketplaces.ts` (campo `logo`):

| Arquivo | Loja | Onde obter |
|---|---|---|
| `mercadolivre.svg` | Mercado Livre | `afiliados.mercadolivre.com.br` → área de banners/criativos |
| `shopee.svg` | Shopee | painel do Shopee Affiliate → seção de creatives/banners |

Enquanto o arquivo não existir, o card cai automaticamente no carimbo textual
(`MarketplaceStamp` em `app/vitrine.tsx` trata o 404). Nada quebra; só não há
logo.

## De onde NÃO tirar

Não usar Brandfetch, LogoDownload, Logokit, Brands of the World ou similares.
Três motivos concretos, levantados na pesquisa de 27/08/2026:

1. Hospedam material protegido sem licença de uso.
2. Circulam versões **obsoletas** — o Brands of the World marca a entrada
   "Mercado Livre" como fora de uso pela própria empresa.
3. O Logokit declara explicitamente não ter vínculo nem endosso das marcas.

O caminho correto é o painel de afiliado: lá o uso do logo já está licenciado
para divulgação, que é exatamente o nosso caso. O BizuMiner é afiliado
autorizado das duas plataformas.

## Requisito que costuma passar batido: contraste nos DOIS temas

O mesmo arquivo é servido no tema claro (fundo bege `--paper`) e no escuro
(fundo azul-marinho). **Um logo monocromático escuro some no tema escuro; um
monocromático branco some no claro.**

Escolha a variante que carrega o próprio fundo:

- Mercado Livre: o lockup com a **placa amarela** (fundo amarelo próprio).
- Shopee: o lockup com o **fundo laranja** ou o símbolo da sacola colorido.

Se só houver versão monocromática disponível, avise — dá para servir arquivos
por tema, mas isso exige mudança no componente (hoje é um arquivo só).

## Formato

- **SVG** preferido (escala sem borrar; o card usa `height: 16px` no desktop
  e `14px` no mobile, com largura automática).
- PNG serve se for o único disponível: exportar em **@3x** da altura final
  (48px de altura) para não borrar em tela retina.
- Sem espaço em branco excessivo em volta — o SVG deve ter `viewBox` colado
  no desenho, senão o logo aparece pequeno demais dentro da caixa.
