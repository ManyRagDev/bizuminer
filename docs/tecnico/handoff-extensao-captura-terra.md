# Handoff executável — Extensão de captura (sessão Terra médio)

> Escrito com o código real na frente em 25/08/2026. Rege-se por [`plano-extensao-captura.md`](./plano-extensao-captura.md). Este handoff serve para uma nova sessão Codex sem o contexto da conversa.

## 0. Mensagem para colar na nova sessão

```text
Você vai implementar o plano de extensão/multi-afiliado do BizuMiner neste repositório.

Leia completamente, nesta ordem:
1. docs/estado-do-projeto.md
2. docs/tecnico/plano-afiliados.md
3. docs/tecnico/plano-extensao-captura.md
4. docs/tecnico/handoff-extensao-captura-terra.md
5. docs/tecnico/mercadolivre-engenharia-reversa.md

Use as skills engenharia-documentada, supabase, supabase-postgres-best-practices e graphify-windows. Use frontend-autoral somente quando chegar às entregas E5–E7.

Comece exclusivamente pela entrega E0 do plano. Trabalhe com autonomia até fechá-la, mas não inicie E1 sem conferência. Antes de editar, inspecione git status/diff e preserve todas as alterações existentes. Não faça commit, push, deploy, rotação de credencial nem migration remota sem autorização explícita.

Implemente na ordem contrato → núcleo → borda → interface → testes. Rode os degraus de verificação aplicáveis. Atualize E0 para 🟡 (nunca ✅ por conta própria), registre fatos e achados no documento mestre e termine emitindo um PEDIDO DE CONFERÊNCIA total, com afirmações falsificáveis, comandos para re-derivá-las, contagem de testes antes/depois e pontos de desconfiança.

Não exponha em saída nenhum valor de .env, token, código de pareamento, tracking_id/tool_id completo, DATABASE_URL ou senha encontrada em migration. Se uma ação externa for necessária, pare no ponto seguro e peça autorização indicando exatamente o alvo e o efeito.
```

## 1. Estado real que não pode ser presumido diferente

- O working tree já contém mudanças do dono e uma captura por bookmarklet ainda não conferida. Não limpar, resetar ou reescrever arquivos não relacionados.
- `packages/web/app/api/capture/route.ts` usa token global e CORS `*`; é legado temporário da casa, não base multi-afiliado.
- `packages/web/lib/manual-capture.ts` grava sempre em `tenant_id="local"`.
- `packages/web/lib/db.ts::affiliateLink()` lê `ML_TRACKING_ID`/`ML_TOOL_ID` globais.
- `/go/[slug]` sintetiza produto por `ml-<external_id>` e cria publication no clique.
- `publication.slug` é unique global; dois afiliados colidiriam.
- `app_user` é pessoa/comprador e já participa de merge de Auth, favoritos, alertas e perfil.
- Migrations canônicas ficam em `packages/persistence/supabase/migrations`; o projeto usa SQL imperativo.
- O schema `garimpa` é acessado pelo servidor via `DATABASE_URL`; não mover dados para acesso direto da extensão/Supabase client.
- O adapter `deals.ts` contém rede automatizada e parser puro na mesma unidade. E0 deve impedir a rede operacional sem destruir o parser/testes.
- Há uma credencial de role exposta numa migration histórica. Não a reproduza. Rotação é ação externa e requer autorização; sanitização/rewrite de Git não está autorizada.

## 2. Escopo fechado de E0

E0 entrega apenas contenção e coerência operacional:

1. criar flag server-only `ML_AUTOMATED_CAPTURE_ENABLED`, default desligado;
2. bloquear o caminho de rede ML no CLI e na rota administrativa antes de iniciar processo/fetch;
3. devolver erro/estado explícito e seguro no painel; não simular rodagem;
4. manter parser puro, fixtures e testes;
5. corrigir documentação viva que ainda recomenda cron/baixa cadência para scraping ML;
6. manter bookmarklet da casa funcionando;
7. criar testes que provem flag ausente/desligada e flag ligada somente em ambiente de desenvolvimento explicitamente autorizado;
8. registrar a rotação da credencial como bloqueio externo, sem executá-la até autorização.

Fora de E0: tabelas de afiliado, RLS, extensão, API de dispositivo, mudança de slug, remover `/api/capture`, alterar comissão ou cadastrar terceiros.

## 3. Decisões de implementação para E0

- A flag deve ser lida por uma função pura central, não por condicionais duplicadas.
- Produção deve falhar fechada. Se o plano e o código divergirem sobre permitir `true` em produção, pare e registre o conflito; não facilite a automação.
- O parser `parseDealsHtml()` continua disponível e testável sem rede.
- A rota admin deve responder um erro de domínio estável (não stack trace) e o painel deve explicar que a captura manual é o caminho atual.
- Não afirmar que a extensão/bookmarklet recebeu parecer jurídico; usar linguagem de limite técnico e risco residual.

## 4. Mapa de impactos de E0

| Ponto | Consumidores | Conferir |
|---|---|---|
| `packages/persistence/bin/sweep.ts` | execução CLI/manual/futura action | não nasce `capture_run` falso quando bloqueado |
| `/api/admin/rodagem` | botão e polling do admin | status HTTP/JSON estável e gate admin preservado |
| `packages/capture/.../deals.ts` | testes, fixture e investigação | nenhuma regressão do parser puro |
| docs de roadmap/motor/mestre | próxima sessão | não continuar mandando configurar cron ML |
| bookmarklet `/api/capture` | captura atual da casa | permanece operacional e claramente temporário |

## 5. Verificação de E0

No mínimo:

```text
cd packages/capture     && npm test && npm run typecheck
cd packages/persistence && npm test && npm run typecheck
cd packages/web         && npm test && npm run typecheck && npm run build
```

Adicionar teste sabotado que falha se o caminho de rede puder iniciar com flag ausente. Se for viável sem segredo, testar a rota admin autenticada por unidade/contrato; se não for, declarar a lacuna.

Depois:

- `rg` por recomendações de cron/sweep ML e classificar cada ocorrência como histórico, parser offline ou instrução operacional;
- `git diff --check`;
- revisar o diff limitado aos arquivos tocados;
- registrar contagem de testes antes/depois;
- emitir pedido de conferência total.

## 6. Como continuar após E0 aprovado

Somente depois de um veredito independente, a nova instrução deve ser:

```text
E0 foi conferida e aprovada. Atualize E0 para ✅ com o veredito e implemente exclusivamente E1 de docs/tecnico/plano-extensao-captura.md. Antes de SQL, confira changelog e docs atuais do Supabase, descubra a CLI com --help, audite o banco real e valide que os únicos tenant_id existentes possuem plano de bootstrap. Crie migration pelo fluxo real do projeto. Não aplique remotamente sem autorização. Termine em 🟡 com PEDIDO DE CONFERÊNCIA total; não inicie E2.
```

O mesmo padrão vale para E2–E8: uma entrega, evidência, pedido, conferência, próxima entrega.

## 7. Formato obrigatório do fechamento

```text
Resultado da entrega: <o que ficou observavelmente diferente>

Arquivos tocados:
- caminho — mudança

Verificação:
- comando — resultado real
- testes antes/depois
- execução real, se houve — IDs derivados pela máquina

Fora de escopo preservado:
- itens

Onde desconfio:
- lacunas/suposições

PEDIDO DE CONFERÊNCIA — E<N> (total|parcial)
<afirmações a falsificar e como re-derivar>
```

Não declarar “pronto” nem marcar ✅ antes do veredito.

