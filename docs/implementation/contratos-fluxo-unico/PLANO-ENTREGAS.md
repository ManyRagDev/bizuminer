# Fluxo único de trabalho — plano de entregas

## Atualização de 20/10/2026

**OS-037 concluída e auditada conforme no escopo local; BUG-021 fechado localmente e OS-029 desbloqueada.** [Parecer vigente](AUDITORIA-OS-037.md) e [levantamento](../diagnosticos/estado-atual-2026-10-20/DIAGNOSTICO.md). A migration ainda não tem aplicação remota comprovada; concorrência nativa e interação autenticada continuam pendentes. O [plano de conclusão](../contratos-conclusao-2026-10-20/PLANO-ENTREGAS.md) reutiliza OS-029/030/031/033 e adiciona OS-038–048 para as demais frentes. Esta atualização prepara contratos, sem autorizar implementação ou efeito remoto.

19/10/2026. Porte **crítico** pela composição multi-tenant e pelos efeitos de captura/publicação. Origem: pedido do proprietário, [diagnóstico](../diagnosticos/fluxo-unico/DIAGNOSTICO.md), [mapa](../diagnosticos/fluxo-unico/MAPA.md), [plano de avaliação](../diagnosticos/fluxo-unico/PLANO-AVALIACAO.md), Blueprint REQ-UX-01–04/11.6 e EP-05. Baseline: `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` **mais working tree preexistente**; HEAD isolado não representa o código examinado. Antes de cada OS, registrar `git status` e diff dos seus caminhos; não sobrescrever alterações locais. Este plano e as OS-027–037 são documentos novos. Nenhuma implementação, migration, deploy ou operação remota foi autorizada por esta elaboração de contratos.

## Decisão de produto e limites

- Uma bancada de **trabalho diário** por conta apresenta uma linha por produto com próxima ação inequívoca e contextos subordinados de público/canal/kit; duas oportunidades do mesmo produto permanecem identificáveis. Contagem da bancada é de produtos distintos, com contagem de ações separada. A ordenação padrão é `actionableSince ASC, productId ASC`, isto é, pendência mais antiga primeiro. Filtros não criam filas concorrentes.
- `actionableSince` é a entrada **da ação atual** em estado executável, derivada dos eventos/tempos existentes. `first_seen_at`, `last_seen_at`, `observed_at` e edição incidental não a substituem. Adiamento retira a ação até o prazo; nova ação ou reabertura legítima recebe sua data própria. Uma recaptura sem mudança material não move a posição. Se um estado ativo não tiver data defensável no histórico, OS-029 para nessa fronteira e devolve evidência; não inventa timestamp nem migração silenciosa.
- A identidade persistida continua sendo anúncio por conta/marketplace/ID externo. `family_key` indica **semelhança editorial**, nunca prova que modelos/marcas sejam o mesmo item. Configurações/variantes só são afirmadas quando a fonte traz identidade suficiente. Ofertas de lojas distintas não são fundidas automaticamente. Semelhança organiza a comparação e evita apresentar uma sequência de nicho como descobertas independentes.
- Vendas são sinal de procura; nota e quantidade de avaliações são sinais diferentes. Dentro de contexto comparável e com mesma procedência, amostra robusta pode superar uma pequena vantagem de estrelas na **prioridade de revisão**. Sinais ausentes são desconhecidos, não zero; contagens de marketplaces diferentes não se somam nem se comparam como se tivessem a mesma medição. Nenhum sinal isolado determina “melhor produto”. Alegações editoriais de superioridade exigem recorte (uso/preço), alternativas consideradas, evidência atual e decisão humana justificada. Preservar gates atuais de risco, preço, rubrica, aprovação e publicação.
- Mercado Livre entra **somente por captura humana** (extensão/bloco manual) e atualização humana; Shopee/AliExpress mantêm descoberta sob demanda e reconsulta periódica pelo GitHub. Triagem posterior pode usar critérios comuns. Captura por lote e dispatch técnico continuam processos próprios, sem virar a bancada do operador.
- Qualidade da IA, políticas, experimentos, operação técnica e Marketing mantêm responsabilidades próprias e rótulos claros. Copiar link, gerar material, exportar e confirmar publicação não são o mesmo estado. O calendário de Marketing não passa a significar publicação comercial sem contrato futuro.

## Sequência e entregáveis observáveis

| Ordem | Entrega | Dependência |
|---|---|---|
| [OS-027](OS-027.md) | Entrada ML exclusivamente manual; APIs e lote não iniciam robô ML, inclusive lotes antigos; Shopee/AliExpress seguem operantes | Nenhuma |
| [OS-032](OS-032.md) | Fecha executáveis locais e flags que ainda permitiam coleta HTTP automatizada ML fora de rotas/lotes | OS-027 |
| [OS-028](OS-028.md) | Comparação de modelos, prioridade de evidência com procedência/limites e alegação pública verificável; implementada localmente, [auditoria de entrega](AUDITORIA-OS-028.md) `NAO_CONFORME` | OS-027 e OS-032 |
| [OS-034](OS-034.md) | Correção local dos BUG-017–023; [auditoria de entrega](AUDITORIA-OS-034.md) `NAO_CONFORME` para BUG-019/021 e pendências BUG-018/020 | OS-028 implementada e auditada |
| [OS-035](OS-035.md) | BUG-019 fechado localmente; [auditoria](AUDITORIA-OS-035.md) `CONFORME_COM_RESSALVAS` pela UI não exercitada em browser | [Reinvestigação](../diagnosticos/os-034/DIAGNOSTICO.md) após OS-034 |
| [OS-036](OS-036.md) | BUG-018/020 fechados localmente; BUG-021 persistiu na [auditoria](AUDITORIA-OS-036.md) `NAO_CONFORME` | OS-035 |
| [OS-037](OS-037.md) | **Concluída localmente:** memória durável e gate v3; [auditoria conforme](AUDITORIA-OS-037.md), BUG-021 fechado localmente | Reinvestigação após OS-036; implantação e concorrência nativa separadas |
| [OS-033](OS-033.md) | Reproduz os testes web e PostgreSQL nativo da versão atual e reconcilia ressalvas ambientais da auditoria | OS-032; verificação para OS-031, sem bloquear OS-028 |
| [OS-029](OS-029.md) | **Próxima implementação:** projeção única, paginada, ordenável e isolada por conta, com ações reais e timestamps de etapa | Fechamento local OS-037 satisfeito |
| [OS-030](OS-030.md) | Bancada visível, navegação clara e continuidade Radar→Campanhas; fecha BUG-014–016 | OS-029 |
| [OS-031](OS-031.md) | Teste transversal e parecer local de entrega com lacunas explícitas | OS-030 e pareceres OS-033/038 |

As OS são fechadas por arquivos; descoberta fora da lista exige revisão do contrato, não expansão tácita. OS-032 é o complemento de segurança da OS-027. BUG-019 fechou localmente na OS-035; BUG-021 persistiu após OS-028/034/036, foi [reinvestigado](../diagnosticos/os-036/DIAGNOSTICO.md) e fechou localmente na auditoria OS-037. A migration aditiva preparada tem implantação separada pelas OS-039/040; não autoriza aplicação remota por inferência. OS-033 fecha a evidência ambiental de captura/web, OS-038 acrescenta concorrência nativa da evidência v3 e OS-031 integra a jornada; ausência de binário não impede implementação independente da bancada, mas deixa a prova nativa pendente. A documentação de OS-013–026 permanece histórica. A bancada reutiliza contratos C-01/C-02/C-03/C-04/C-07 e DALs atuais; não se cria tabela de fila ou score universal. A leitura nova deve ser paginada e não abrir pools por item.

## Portões

1. Auditor `auditor-red-team`, modo `contrato`, antes da implementação pelo risco de autorização, dados e estado. Corrigir apenas achados fundamentados, preservando decisões do proprietário.
2. Executar cada OS após autorização de execução, com testes comportamentais e integração correspondentes, não só typecheck/build. Sem chamadas pagas, publicação, GitHub dispatch, banco remoto ou deploy na bateria local.
3. OS-031 reconcilia aceites com a jornada autenticada em ambiente **explicitamente escolhido**; indisponibilidade de sessão/ambiente é limitação registrada, não resultado verde inventado. Migração e implantação remotas exigem confirmação do destino pelo usuário.

Rollback: reverter apenas o delta de cada OS a partir de cópia de seus caminhos, sem `git reset/checkout` geral e sem ressuscitar captura automática ML. Mudanças de UI mantêm rotas legadas até contraprova de navegação.
