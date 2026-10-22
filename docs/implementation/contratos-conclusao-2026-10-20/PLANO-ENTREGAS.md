# Conclusão da implementação e homologação por capacidade

20/10/2026. Intenção: **arquitetura**. Porte global **crítico** por conta, dados privados, migrations, publicação e fatos financeiros. Origem: pedido de contratos para todas as correções do [levantamento](../diagnosticos/estado-atual-2026-10-20/DIAGNOSTICO.md). Baseline: `main`, `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` **mais working tree preexistente**. Preparar estes contratos não autoriza sua execução, publicação ou escrita remota.

## Direção e comportamento preservado

O núcleo tem implantação comprovada em 16/10; OS-020–026 e OS-027/032/034–037 contêm correções posteriores locais. BUG-021 fechou localmente na [auditoria OS-037](../contratos-fluxo-unico/AUDITORIA-OS-037.md), liberando OS-029. Não reimplementar parser, credenciais, storage ou adapters já corrigidos apenas porque a homologação real está pendente. Não reabrir defeitos resolvidos sem contraprova.

Reutilizam-se [C-01–C-09](../03-CONTRATOS-COMPARTILHADOS.md), [CF-01](../contratos-finalizacao/CF-01-IMPLANTACAO.md), [CF-02](../contratos-finalizacao/CF-02-PRESERVACAO.md), [CF-03](../contratos-finalizacao/CF-03-INTEGRACAO.md) e [gates originais](../07-PRONTIDAO-E-DECISOES.md). Membership autoriza conta; tenant recebido não cria autoridade. Ausência de evidência permanece desconhecida. Avaliar, aprovar catálogo, destacar, exportar e confirmar publicação continuam estados distintos. ML permanece exclusivamente humano, WhatsApp assistido/manual e Marketing mantém calendário próprio. Sem cobrança automática, matching universal, score novo, fila persistida nova ou plano/limite comercial inventado.

## Sequência e cobertura completa do levantamento

As quatro OS existentes são mantidas; apenas suas referências/dependências e a cobertura necessária foram reconciliadas. As novas começam em OS-038, sem renumerar histórico.

| Ordem | Avanço observável / achado coberto | Dependência e prontidão |
|---|---|---|
| [OS-029](../contratos-fluxo-unico/OS-029.md) | Projeção paginada de uma bancada por produto e próxima ação | PREPARADA; BUG-021 localmente fechado |
| [OS-030](../contratos-fluxo-unico/OS-030.md) | Bancada visível e continuidade; BUG-014, BUG-015 e BUG-016 | PREPARADA; após OS-029 |
| [OS-033](../contratos-fluxo-unico/OS-033.md) | Prova reproduzível de web/subprocessos/rede e captura humana em PostgreSQL nativo | PREPARADA; após OS-032; pode executar antes de OS-029, sequencialmente |
| [OS-038](OS-038.md) | Concorrência nativa da memória comparativa v3, isolamento e plano | PREPARADA; OS-037 local, binários nativos verificáveis |
| [OS-031](../contratos-fluxo-unico/OS-031.md) | Oferta percorre entrada→bancada→decisão→oportunidade→kit→resultado; UI autenticada classificada separadamente | PREPARADA; após OS-030 e pareceres OS-033/038 |
| [OS-039](OS-039.md) | Candidata consolidada, fontes/consumidores identificados, recuperação e alvos verificáveis | PREPARADA; após verificação local; sem commit/push/deploy |
| [OS-040](OS-040.md) | Migration OS-037 e web/writers compatíveis publicados com pós-condições | CONDICIONAL; OS-039 aprovada, destino e autorização específicos |
| [OS-041](OS-041.md) | Calibração E3, rubrica e política de audiência com evidência e decisão reais | CONDICIONAL; amostra/método/responsável, ambiente autorizado |
| [OS-042](OS-042.md) | Captura/monitoramento e credenciais efetivamente isolados por conta, Auth/pooler e dispositivos delimitados | CONDICIONAL; contas, programas, credenciais e rodada limitados autorizados |
| [OS-043](OS-043.md) | Assets privados, três formatos, kit aprovado, exportação e atribuição em jornada real | CONDICIONAL; direitos, Storage, oferta/campanha e conta autorizados |
| [OS-044](OS-044.md) | Compatibilidade de relatório real de comissão e reconciliação financeira | CONDICIONAL; arquivo sanitizado e semântica do programa; commit real separado |
| [OS-045](OS-045.md) | Envio oficial único e rastreável com reconciliação e kill switch | CONDICIONAL; OS-043 aplicável, canal/destino/revisão e envio autorizados |
| [OS-046](OS-046.md) | Experimento pareado com método prévio e decisão humana justificada | CONDICIONAL; versões, unidade, amostra, coorte e métrica aprovadas |
| [OS-047](OS-047.md) | Preparação controlada da conta e posterior liberação do piloto, com gates distintos | CONDICIONAL; etapa A pode preparar B antes da OS-042; etapa B exige provas das capacidades contratadas |
| [OS-048](OS-048.md) | Matriz final por requisito/capacidade com limites e estado real reconciliados | PREPARADA; consome resultados e bloqueios de todas as frentes |

Não há execução paralela autorizada. A sequência preferencial é 029→030→033→038→031→039→040; depois 041→042→043→044→045→046→047→048, avançando somente na capacidade cujo insumo esteja disponível. **Exceção necessária de preparação:** se faltar B, executar primeiro a etapa A da OS-047, nominalmente autorizada para conta/identidades de homologação; então 042/043/045 aplicáveis e só depois a etapa B de liberação do piloto. Com B já existente, usar suas identidades autorizadas; com somente conta própria e sem piloto autorizado, verificar só esse alcance, sem criar cliente. A preparação não entrega acesso amplo ao participante nem considera capacidades homologadas. Ausência de relatório financeiro não impede verificar Storage; ausência de piloto não impede operar a conta própria. Cada ordem registra bloqueio específico sem paralisar artificialmente as demais. Ambiente isolado pode homologar a capacidade antes de produção; para ensaio no ativo, OS-040 deve comprovar a versão correspondente.

## Fronteiras comuns obrigatórias

1. **Preservação:** antes de cada OS, registrar HEAD, status/diff dos seus caminhos e hashes dos arquivos lidos; incluir não rastreados. Trabalhar sobre o delta, sem reset/checkout/stash geral, stage amplo, restauração de arquivos alheios ou formatação em massa. As provas de 438 testes web/40 persistence são baseline de 20/10, não número obrigatório de testes futuros.
2. **Escrita fechada:** a lista de cada OS é exaustiva; fora dela, `BLOQUEIO_DE_FRONTEIRA` com causa, reprodução e menor ampliação necessária. Ordens de homologação não autorizam patches exploratórios. Defeito novo confirmado gera contrato corretivo ligado ao BUG/AC; duas falhas do mesmo achado exigem reinvestigação antes de outro patch.
3. **Identificação de execução:** cada `RESULTADO-OS-###.md` mapeia AC, versão/hashes, comando/cenário, exit code ou resposta real, ambiente, responsável e limitação. Estados: `NAO_EXECUTADO`, `PASSOU_LOCAL`, `HOMOLOGADO_NO_DESTINO`, `ATIVADO`, `BLOQUEADO` ou `NAO_VERIFICAVEL`. Manter implementação, instalação, homologação e ativação em colunas distintas; não reduzir tudo a um percentual.
4. **Dados/evidências:** cada OS nova pode criar somente seu `RESULTADO-OS-###.md` e `evidencias/OS-###.json`, além dos caminhos extras explícitos. Logs brutos, tokens, dumps, relatórios privados e capturas identificáveis ficam em diretório privado autorizado, fora do Git. O JSON contém referências opacas/digests e resumos sanitizados; não contém strings de conexão, e-mails, IDs pessoais ou segredos. Evidências históricas de caminho fixo são preservadas; usar cópia descartável em `/tmp` para suítes que as reescrevem.
5. **Verificação:** testes comportamentais/SQL e acesso real sustentam o aceite. Build/typecheck são complementares. Novos comandos que citam arquivo novo só existem após sua criação autorizada. Testes nativos exigem PostgreSQL local com versão, bibliotecas, role, PIDs e loopback verificados; nunca substituí-lo pela URL Supabase. Restrições ambientais são registradas e só contornadas em ambiente legitimamente permitido. Não alterar testes para esconder falha. Build e typecheck web não executam simultaneamente.
6. **Operações remotas:** autorização vigente destes documentos: **nenhuma**. Antes de mutação, vincular a autorização humana já existente ou nova ao alvo exato, conta, operação, artefato/revisão, limites e período. Segredos são fornecidos por mecanismo privado. Não pedir confirmação genérica repetida se esses elementos já estiverem autorizados na sessão; ler os requisitos não equivale a autorização. DDL, deploy/push, configuração de recurso, convite, envio, cobrança e exclusão nunca decorrem da autorização de elaborar contratos.
7. **Sem escolhas fabricadas:** registrar entradas no próprio resultado: ambiente/projeto e URL, conta(s), identidade/role autorizadas, amostra/arquivo privado, responsável, método/política, direitos, destino, orçamento e operações permitidas. Se faltar decisão essencial, a ordem fica condicional naquela etapa. Não escolher cliente, relatório, canal, thresholds, termos, prazo de retenção ou preço em nome do dono.
8. **Rollback:** reverter só o delta local da OS. Em homologação, cancelar somente intenção/job não enviado e revogar somente acesso/configuração incluídos na autorização; preservar eventos, fatos financeiros e publicações reais. Depois do isolamento instalado, nunca recuperar por policies globais permissivas. Erro remoto incerto exige reconciliar estado antes de repetir. Exclusão/restauração remota e reversão de schema exigem operação e plano próprios.

## Portões e responsáveis

Contrato crítico passa por `auditor-red-team`, modo `contrato`, antes da execução. Executor executa e registra evidência; auditor verifica o mesmo AC/snapshot sem mudar requisito; proprietário decide método, direitos, canal, programa e piloto. Falta de insumo comercial não é BUG de software.

A revisão de contrato desta rodada fica em `AUDITORIA-CONTRATOS.md`. Ela não homologa implementação, não ratifica política e não autoriza escrita remota. A OS-048 atualiza os registros centrais ao final; a atualização documental inicial desta arquitetura apenas corrige referências/status já sustentados pelo levantamento, sem declarar entregas futuras concluídas.
