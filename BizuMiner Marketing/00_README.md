# BizuMiner Marketing

Pasta operacional de growth e distribuição do BizuMiner.

## Como usar

O ponto de partida diário é **Marketing → Meu dia**, em `/admin/marketing`. O painel conduz uma etapa por vez: oferta conferida, WhatsApp e Stories, conteúdo, divulgação e fechamento. Ele salva o progresso por conta, retoma o dia aberto e mantém tarefas adiadas com o motivo. `Materiais` preserva os rascunhos anteriores; `Semana e histórico` mostra a cadência e os registros.

Selecionar da pauta preenche os dados disponíveis e reaproveita seu link de compartilhamento. No WhatsApp, copiar apenas esse link é o caminho principal; texto adicional é opcional. Preços em faixa, “a partir de” e moeda não confirmada mantêm seu contexto. Data de captura não é tratada como conferência manual.

Os campos e os lembretes não bloqueiam a conclusão das etapas; o motivo de adiamento também é opcional. Concluir é uma decisão manual de checklist e não inventa envio, imagem, data ou URL de publicação. O envio e a publicação continuam manuais. A rotina usa o armazenamento privado de Marketing existente, sem migração. Evite editar simultaneamente em várias abas; conflitos preservam o texto local para exportar e recuperar.

O painel adiciona uma sequência de 12 roteiros de organização e iluminação, com textos das imagens, legenda, CTA e direção de arte, sem substituir edições existentes. As artes finais ainda precisam ser produzidas. Um novo dia sugere o roteiro em preparação; depois de uma publicação registrada ou de concluir a tarefa de feed em dia de publicação, sugere o seguinte. Isso não cria um registro fictício de publicação. As fontes dos roteiros estão em `social/posts/post-17-…` a `post-28-…`; o pacote usado pelo aplicativo fica em `packages/web/lib/marketing-editorial.ts`.

Comece pela [rotina de trabalho](02_Pipeline/rotina-operacional.md): ela explica o que fazer todo dia com conteúdo, ofertas, WhatsApp, divulgação e atendimento. O [calendário de conteúdo e vendas](../social/calendario-mes-1.md) contém as pautas de 28/10 a 26/11/2026, as metas e o placar. As datas antigas dos roteiros e do CSV não são a agenda deste ciclo.

1. Consulte `01_Estrategia/Growth-OS.md` para a direção comercial vigente.
2. Registre os materiais e o andamento no painel. O CSV anterior serve como referência e exportação manual, sem exigir registro duplicado.
3. Use os modelos de `03_Templates/` sem inventar dados.
4. Crie uma pasta em `04_Conteudo/Em-Producao/` somente quando a peça tiver assets.
5. Depois da publicação, mova os assets para `04_Conteudo/Publicados/` e registre as métricas.
6. No fim da semana, atualize `02_Pipeline/metricas.csv` e anote apenas aprendizados sustentados por resultados em `01_Estrategia/Aprendizados.md`.

## Regra de simplicidade

Documento = estratégia. Painel = execução. Pastas = arquivos. Analytics = aprendizado.

Se o processo der mais trabalho do que publicar, simplifique.
