# Track 020 — Enfileiramento Assíncrono e Auto-Retry na Extensão Chrome

> **Status:** Concluído  
> **Data:** 10/11/2026  
> **Objetivo:** Eliminar a espera manual do operador ao capturar ofertas no navegador (Amazon/Mercado Livre). Quando o backend estiver processando outro lote (ex: cron da Shopee), a extensão não mais rejeitará a importação com erro; ela salvará o lote localmente em fila (`queued: true`) e o Service Worker fará a entrega automática em segundo plano via alarmes silenciosos assim que o painel liberar.

---

## 1. Contexto e Motivação

Atualmente, o BizuMiner impõe a trava de integridade `uq_capture_batch_one_running_per_tenant` (apenas um lote de captura ativo por vez no tenant). Quando uma rodagem programada da Shopee está em andamento no servidor e o usuário clica em "Importar ofertas" na extensão, o endpoint `/api/extension/capture-batches` retorna `batchId: null`. A extensão falha imediatamente com o erro:
`"Existe outra captura em andamento no painel. Aguarde a conclusão ou tente novamente."`

Isso obrigava o operador a ficar vigiando a tela e tentando repetidamente até a Shopee acabar.

**Solução Entregue:**
A extensão armazena o lote de produtos com segurança localmente:
1. Marca o lote local como `queued: true` e agenda alarme periódico em segundo plano (`chrome.alarms`).
2. Notifica o usuário no popup com estado visual amigável: *"📥 Ofertas enfileiradas com sucesso! O painel está processando outra captura. O envio ocorrerá automaticamente em segundo plano assim que liberar."*
3. O `service-worker.ts` retenta a obtenção de batch e entrega em background a cada 30 segundos.
4. Quando o lote da Shopee conclui, a extensão entrega os dados, limpa a fila, exibe o badge temporário "✓" e conclui sem qualquer intervenção humana.

---

## 2. Tarefas Concluídas

- [x] **Fase 1: Motor de Enfileiramento no Service Worker**
  - [x] Criado módulo testável `packages/extension/src/lib/batch-queue.ts` com regras de enfileiramento, expiração (30 min / 60 tentativas) e retry.
  - [x] Implementado handler de alarme `bm_batch_queue_retry` no `service-worker.ts` para tentativa silenciosa a cada 30s.
  - [x] Atualizado badge da extensão: ampulheta âmbar (`⏳`) durante enfileiramento e checkmark verde (`✓`) no sucesso de entrega.
  - [x] Adicionados testes unitários em `packages/extension/test/batch-queue.test.ts` (33/33 testes passando).

- [x] **Fase 2: Interface no Popup da Extensão**
  - [x] Suporte à checagem de estado `GET_BATCH_STATE` ao abrir o popup.
  - [x] Exibição de cards informativos estilizados `.batch-queued-notice` e `.batch-success-notice` no `popup.css`.
  - [x] Botão para forçar envio imediato no popup com contador de tentativas.

- [x] **Fase 3: Backend & Contrato**
  - [x] Atualizado endpoint `/api/extension/capture-batches` com flag explícita `busy: batchId === null`.

- [x] **Fase 4: Verificação, Empacotamento e Deploy**
  - [x] Bump de versão da extensão de `0.3.0` para `0.3.1` em `manifest.json` e `package.json`.
  - [x] Compilado `dist/` e gerado pacote de release reproduzível `release/bizuminer-extension-v0.3.1/`.
  - [x] Manifest verificado (`npm run verify:manifest` OK).
  - [x] Typecheck e testes da extensão (`npm test` 33/33 OK, `typecheck` OK).
  - [x] Typecheck e testes do web (`npm test` 572/572 OK, `typecheck` OK).
  - [x] Comitado e deploy efetuado via `git push origin main`.
