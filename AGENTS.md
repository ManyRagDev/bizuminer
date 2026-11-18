# Trabalho no Garimpa

Retome as implementações existentes pelo objetivo funcional e pelo estado real do código. Use planos e diagnósticos como referências; não gere outra cadeia de OS para corrigir pendências do mesmo objetivo.

Planeje consequências relevantes na interface, persistência, isolamento entre contas e integrações afetadas. Descobertas técnicas dentro do objetivo podem ajustar o plano; preserve proteções explícitas e alterações locais. Autorizações externas continuam vinculadas ao destino e à operação.

Na implementação autorizada, siga até integrar e verificar a capacidade, sem pedir confirmação a cada arquivo ou etapa. Para um bloqueio real, peça a informação específica e continue onde for independente.

Ao entregar, explique o que o aplicativo agora permite fazer, como conferiu e quais condições ou limitações permanecem. Atualize documentação permanente apenas quando houver conhecimento duradouro relevante, aproveitando o documento existente.

## Agendamentos suspensos por decisão do dono — 15/11/2026

Os crons deste projeto devem permanecer desativados até que o dono solicite explicitamente a reativação. Isso inclui descoberta Shopee, acompanhamento de preços e qualquer outro cron. Não reativar workflows no GitHub, restaurar gatilhos `schedule` nem habilitar agendamentos equivalentes em outro executor como parte de correções, migrações ou deploys. Os três workflows do repositório `ManyRagDev/bizuminer` foram conferidos no GitHub como `disabled_manually`, sem execuções pendentes ou em andamento.
