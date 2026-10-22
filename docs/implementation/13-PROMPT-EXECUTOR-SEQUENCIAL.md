# Prompt para execução sequencial integral do BizuMiner V2

Atue como agente executor no repositório `/home/many/Documentos/Projetos linux/Garimpa`. Use a skill `codex-executor` ou a equivalente do seu ambiente. Esta é uma solicitação de implementação: execute o trabalho no workspace, com integração e verificação, até concluir todas as entregas tecnicamente disponíveis. Mantenha pendentes apenas capacidades dependentes de decisão humana, dados externos ou ambiente/autorização ainda ausentes, identificando cada impedimento com precisão.

A sequência abaixo orienta a execução. Confirme o estado atual antes de cada entrega, aproveite o que já funciona e complete as lacunas. Não reinicie o planejamento integral nem refaça a implementação existente por rotina.

## 1. Resultado esperado

Concluir o conjunto de funcionalidades previsto nas treze specs, EP-00 a EP-12, em entregas funcionais sequenciais. O operador deve percorrer captura → evidência → avaliação → oportunidade/radar → campanha → kit → validação/aprovação → divulgação → resultado financeiro. O afiliado SaaS deve usar o mesmo motor, com conta, público, credenciais, limites e dados próprios.

A operação própria de afiliação e o SaaS são negócios complementares e permanentes. Preserve a operação atual, que possui vendas reais. Mudanças de arquitetura não podem substituir essa estratégia, privilegiar a casa por bypass de segurança ou duplicar o motor para clientes.

Conclua implementação, integrações, testes e documentação de todas as partes independentes dos gates. A ausência de staging não impede terminar código local, testes isolados, interfaces, autorização, workers locais e contratos já definidos. Um gate bloqueia somente o resultado que depende dele; continue com o próximo trabalho executável.

## 2. Evidências e estado atual

Leia antes de editar:

1. Instruções aplicáveis, `AGENTS.md`, skills, README e scripts atuais dos pacotes; estado do Git e alterações preexistentes.
2. `docs/implementation/STATUS-EXECUCAO.md`.
3. `docs/implementation/12-RELATORIO-DE-IMPLEMENTACAO-E-CONFERENCIA.md`.
4. `docs/implementation/evidencias/manifesto-conferencia-final.json` e `inventario-contexto-legado-pendente.json`.
5. Blueprint preservado em `docs/implementation/BLUEPRINT-MESTRE-BIZUMINER-V2-fonte.md`.
6. Documentos compartilhados 02–09, especialmente contratos, migrations, verificação, prontidão e rastreabilidade.
7. Todas as specs de `docs/implementation/epicos/EP-00.md` a `EP-12.md`.

O código/repositório atualizado determina o estado da implementação. Blueprint e contratos determinam os requisitos. Relatórios 10/11 e o status anterior são históricos: revalide seus achados antes de agir. A indicação “planejamento, sem implementação autorizada” nos documentos originais descreve aquela etapa; este pedido autoriza a implementação local, mantendo as restrições de efeitos externos.

Baseline registrado em 14/10/2026, a confirmar: 367 testes web, 127 capture, 35 persistence, 16 extension; 29 cenários SQL editoriais, 22 de triagem/preço, 20 de captura e 31 comerciais; typechecks e build aprovados. Esses números não são meta nem prova automática de conclusão.

As onze migrations locais V2 foram ensaiadas em PostgreSQL WASM/PGlite. O MCP confirmou o projeto `spbuwcwmxlycchuwhfir`, schema `garimpa`, contendo a operação atual, sem as migrations V2 e sem branches de desenvolvimento naquela consulta. Reconfirme o alvo. PGlite não certifica sessões independentes, Supavisor, Supabase Auth, Storage ou navegador autenticado.

Já existem serviços e telas comerciais em `/admin/campanhas` e `/admin/financeiro`, aprovação/revisão/exportação/confirmação manual, handlers públicos e testes SQL. Complete seus consumidores e mantenha os comportamentos corretos. Não reduza esses fluxos a stubs para acomodar nova implementação.

## 3. Escopo e autorização

Incluído: código local, migrations locais necessárias, backfills planejados, interfaces, testes, integrações entre épicos, documentação e auditoria final. Leia o banco conectado pelo MCP quando necessário e preserve evidências sem segredos.

Escrita remota exige autorização específica já existente na sessão de execução, alvo confirmado como staging isolado e cumprimento das pré-condições. Se faltar autorização ou identificação, prepare a aplicação e a recuperação, peça apenas o dado necessário e continue o trabalho local independente. Este prompt não autoriza migrations/deploy em produção, modificar outros schemas, enviar mensagens, realizar cobranças ou convidar clientes reais.

Produza um pedido consolidado, cedo, para informações externas efetivamente ausentes: staging, amostra editorial, relatório financeiro, canal/destino autorizado e termos/quotas/privacidade do piloto. Verifique respostas e decisões já existentes antes de perguntar. Não solicite confirmação para cada entrega técnica já autorizada.

Não invente aprovação de rubrica, thresholds E3, preços de plano, quotas comerciais, licenças de imagens, formato CSV de fornecedor, capabilities de API ou consentimento de clientes. Fixtures sintéticas ficam restritas aos testes. Configuração pendente pode ter interface e validação reais; deve impedir a ação dependente enquanto não aprovada.

## 4. Decisões e contratos obrigatórios

Siga C-01–C-09, invariantes, estados e critérios das specs. Confira nomes/tipos atuais antes de alterar contratos.

- Identidade autenticada, role e membership autorizam a conta. Tenant recebido do cliente é uma seleção a validar, nunca autoridade. Workers/dispositivos usam credencial e escopo comprovados no servidor.
- Queries privadas usam contexto na mesma transação. Não use conexão administrativa, GUC global/persistente, `tenant=local` implícito ou policy permissiva para fazer o fluxo passar.
- Leituras públicas usam projeção mínima e monetização da publicação correta. Código de campanha não autoriza acesso privado. Preserve links antigos e o token na cadeia `/p → /bizu → /go`.
- Ausência de evidência, moeda, custo, venda ou atribuição permanece desconhecida. Dois desconhecidos não são configurações comparáveis. Family key não substitui identidade exata.
- Aprovação editorial, publicação web, kit, aprovação de revisão, exportação e postagem confirmada mantêm estados próprios. Criação de oportunidade não publica. Copiar material não confirma postagem.
- Idempotência considera chave e conteúdo; conflitos de versão são observáveis; eventos e fatos correspondentes são atômicos. Revisões/ledgers preservam histórico e recuperação auditável.
- E3 exige política aprovada e cobertura/janela/gaps/frescor/configuração compatíveis. Rubrica em sombra não permite nova aprovação automática. Direitos de imagem exigem comprovação própria.
- Comissões, caixa, custos e receita SaaS são separados. A receita da plataforma fica na conta operadora e não é revelada ao cliente. Estados da mesma obrigação não são receitas múltiplas.
- Transporte incerto após possível envio exige reconciliação. Não repita automaticamente uma operação externa que possa ter sido aceita.

## 5. Plano executável em sequência

Mantenha um checklist persistente. Em cada etapa: confirme entrada → implemente uma fatia funcional → execute seu aceite → corrija falhas → revise integração/diff → registre resultado → avance. Se um item estiver bloqueado, registre dependência e próximo passo exatos; continue os independentes. Não termine a rodada ao concluir a primeira spec.

### Etapa 0 — Reconciliar a execução

Confirme instruções, Git, migrations, serviços/consumidores, testes e estado remoto. Mapeie requisitos para: implementado e verificado; parcial; falta código; depende de gate. Não classifique tabela, função pura ou mock como jornada pronta. Preserve alterações anteriores e evidências históricas.

**Saída:** checklist de todas as entregas e diferenças verificáveis para o estado atual; baseline reproduzível.

### Etapa 1 — Concluir EP-10A no legado

Prioridade técnica. Complete o inventário de TODOS os consumidores privados: `admin-db.ts`, `curation-db.ts`, `member-db.ts`, `extension-db.ts`, `editorial-selection-db.ts`, `PgStore`, CLIs, captura/triagem/monitoramento, actions, APIs, exports, bootstrap de identidade e credenciais. Os caminhos listados são pontos conhecidos; busque os demais.

Adapte cada fronteira e seus consumidores ao contexto autorizado. Preserve a área do comprador, captura, curadoria, publicação web, links, extensão e cron da casa. Membership revogada/suspensão deve valer no próximo comando; pessoa em duas contas não exige duplicar identidade. Resolução de dispositivo/worker não pode depender de policy ampla para bootstrap.

**Aceite:** fluxos legítimos funcionam como runtime sob as policies restritivas; A/B/casa, owner/operator/não membro/suspenso; sem contexto nega; contexto não vaza entre transações; autoria transversal e FKs corretas; segredo não cruza contas. Inventário completo, sem bypass para a casa. M-10A2 não é ativada antes disso e da prova em staging.

### Etapa 2 — Completar EP-01 transversalmente

Confirme produtores de evidência e proveniência nas fontes habilitadas, incluindo captura por navegador/extensão. Integre o motor canônico aos consumidores legados de preço, histórico, selo, triagem, vitrine, pauta, kit e export. Remova heurísticas incompatíveis remanescentes sem apagar histórico.

**Aceite:** mesma fixture em TS/SQL; moeda/variante/quantidade/condições desconhecidas, faixa, observação futura/vencida, janela, cobertura e gaps; preço/data/link preservados. Fonte sem configuração comprovada fica E0/E1. Prepare EXP-02 e mecanismo de política versionada; ative E3 apenas com G-PRICE efetivamente resolvido.

### Etapa 3 — Completar EP-02 e EP-03

Ligue rubrica, avaliação e revisão humana à captura/triagem e à interface. Implemente coleta/consulta da amostra, auditoria e comparação em sombra. Complete política de audiência, oportunidades persistidas, ranking explicável, radar e integração com pauta/monitoramento.

**Aceite:** caro/barato/estável avaliados pelo contexto; notas desconhecidas não são fabricadas; mudanças de política/evidência invalidam resultados; replay não duplica oportunidade; override humano preservado; cooldown específico por público/canal depende de postagem confirmada; candidato sem histórico não sofre starvation. Política pendente é mostrada como pendente. G-RUBRIC limita promoção, não impede construir o fluxo de revisão e sombra.

### Etapa 4 — Concluir integração de EP-04/05/06/07

Complete o cockpit Pauta/Radar/Resultados e conecte ações reais aos serviços existentes. Feche campanha → oportunidade → revisão → validação factual → aprovação humana → exportação → confirmação, incluindo revisão posterior, expiração, conflito e falha.

Complete geração/renderização de materiais permitidos. Direitos/licença não aprovados bloqueiam somente materiais dependentes. Preserve a via textual assistida. Garanta que arquivos/exportações pertençam à conta correta e que nomes/credenciais/resultados da casa não apareçam indevidamente ao cliente.

**Aceite:** usuário percorre a jornada; preço ou condição alterados bloqueiam exportação e invalidam aprovação; novo conteúdo exige nova revisão; imagem sem direitos não é usada; `/p`, página, CTA, sticky e banner preservam `c`; `/go` monetiza a conta correta e registra clique; preview/HEAD não simulam tráfego humano; URLs antigas da casa continuam funcionando.

### Etapa 5 — Completar EP-08 A/C

Revalide e complete registro manual, comissão/ajuste, custos e receita SaaS, incluindo instrumentos de custo/tempo de IA/captura quando previstos. Integre o read model ao cockpit, sem duplicar telas/ledger.

**Aceite:** venda sem campanha é válida e identificada como origem desconhecida; valor ausente não vira zero; cadeia de estados e estornos concilia por obrigação/moeda; replays e requisições concorrentes não duplicam; referência cruzada entre contas falha; receita da plataforma invisível ao afiliado cliente; tempo sem tarifa não gera dinheiro fictício. Não crie a venda real do proprietário sem dados fornecidos.

### Etapa 6 — Implementar EP-09

Construa relatórios descritivos reais, filtros e cobertura; experimento em sombra com hipótese/metodologia, assignment idempotente, avaliação pareada, revisão humana, promoção versionada e reversão.

**Aceite:** taxas mostram denominadores/coortes; atraso/janela imatura/incompletude aparecem; shadow não altera ranking; amostra insuficiente impede conclusão/promoção conforme política; dados privados não entram no agregado de outra conta. G-EXPERIMENT impede alegar aprendizado/prova causal sem aprovação e dados; não impede implementar medição e revisão.

### Etapa 7 — Completar EP-08B conforme G-FIN

Construa upload privado, digest, preview, erros/revisão, confirmação e conciliação. Implemente parser específico somente a partir do relatório autorizado/sanitizado, verificando semântica de IDs, estados, moeda, datas e ajustes.

**Aceite:** reimportação e arquivo reordenado não duplicam; concorrência segura; correção vira ajuste auditável; linha sem identidade segura exige revisão; arquivo não é acessível a outra conta. Sem relatório, complete infraestrutura/contrato interno verificável e registre o parser de fornecedor como bloqueado; não anuncie suporte fictício a marketplace.

### Etapa 8 — Implementar EP-11 tecnicamente disponível

Complete agendamento/cancelamento, outbox/attempt/lease, quotas atômicas, cooldown, revalidação antes do I/O, worker, reconciliação de resultado incerto, painel e kill switch por conta/destino. Use configuração explícita; valores de teste não são quotas comerciais.

A escolha e implementação do adapter específico dependem de canal/capability aprovados. Verifique documentação oficial atual do fornecedor escolhido. Não selecione Telegram/WhatsApp por suposição nem use automação não oficial.

**Aceite:** dois workers não enviam/finalizam lease alheio; revisão vencida, link inválido, credencial revogada ou conta suspensa bloqueiam; cancel/kill switch verificados antes do envio; timeout após possível aceitação permanece incerto e não gera retry cego; via manual funciona. Teste real exige destino e envio explicitamente autorizados. Core testado com adapter de teste não significa canal real concluído.

### Etapa 9 — EP-10B da base comercial

Audite a versão exata da superfície construída: dados, secrets, arquivos, exports, URLs, imports, métricas, destinos, jobs e roles. Faça matriz positiva/negativa e tentativas de adulteração. Prove regressão da operação própria.

**Saída:** relatório de cobertura por recurso/role com falhas e provas reais; lacunas de pooler/Auth/Storage/browser explicitamente pendentes se staging ainda faltar. Não conceda certificação completa baseada em mocks, execução como postgres ou PGlite serializado.

### Etapa 10 — Completar EP-12 em ambiente isolado

Implemente convite/provisionamento assistido, memberships, configuração própria de programa/credenciais, políticas, entitlement/quotas no backend, suspensão/expiração, suporte, export privado e saída. Teste com contas fictícias e condições sintéticas identificadas. Prepare formulário/plano versionado para condições comerciais reais; mantenha ativação bloqueada enquanto termos/quotas/privacidade estiverem pendentes.

**Aceite:** convite de outra conta/vencido não autoriza; ninguém se autopromove a role de plataforma; owner/operator distintos; quotas concorrentes respeitadas; mesma pessoa alterna contas; tag do cliente em todos os redirects; campanha própria confirmada explicitamente; resultados próprios ou estado não monitorado; suspensão de B não afeta A/casa. Não prometa ROI nem copie credenciais privadas da casa.

Repita EP-10B incluindo TODA a nova superfície de onboarding/convites/limites antes de convidar pessoa externa real. A auditoria anterior não certifica código posterior.

### Etapa 11 — Homologar em staging identificado e autorizado

É uma etapa própria, assim que dependências e autorização existirem; não é motivo para interromper código independente. Confirme pelo MCP projeto/branch/ambiente, isolamento, schema, histórico e papel runtime. Prepare snapshot/recuperação de dados sanitizados e versão de código correspondente.

Revalide as onze migrations contra o alvo atualizado. Arquivo já aplicado não é reescrito; evolução é aditiva. Aplique somente ao staging autorizado e confira o resultado de cada dependência. A presença de novas migrations não autoriza aplicação indiscriminada de pendências antigas.

Execute browser → API/action → PostgreSQL → resposta, Auth, Storage, sessões independentes e pooler, captura/curadoria/comprador/workers e jornadas comerciais. Produção permanece preservada. Registre migration criada, ensaiada, aplicada e confirmada como estados separados.

### Etapa 12 — Auditoria integral e entrega

Releia todas as treze specs e a rastreabilidade. Procure requisitos comerciais esquecidos, contratos incompatíveis, migrations fora de ordem, duplicação, estruturas órfãs, controles só no frontend, bypass de casa e etapas sem resultado funcional.

Corrija inconsistências dentro do escopo. Termine todo trabalho local independente e registre somente bloqueios verdadeiros. Não encerre com “faltam apenas gates” se ainda houver código técnico implementável pendente.

## 6. Verificação de ponta a ponta e registro

Confirme os comandos em package.json antes de executar. Comandos existentes na baseline:

```bash
npm test --prefix packages/web
npm test --prefix packages/capture
npm test --prefix packages/persistence
npm test --prefix packages/extension
npm run typecheck --prefix packages/web -- --incremental false
npm run typecheck --prefix packages/capture -- --incremental false
npm run typecheck --prefix packages/persistence -- --incremental false
npm run typecheck --prefix packages/extension -- --incremental false
npm test --prefix tools/editorial-tests
npm run test:triage-price --prefix tools/editorial-tests
npm run test:capture-batch --prefix tools/editorial-tests
npm run test:commercial --prefix tools/editorial-tests
npm run build --prefix packages/web
```

Não existe comando raiz presumido. Não deixe .env/local escolher produção implicitamente para testes ou build. Preflight remoto recebe alvo explicitamente, conforme script atual. Execute checks focados por entrega e regressão ampla após integrações materiais; não infle contagens repetindo testes. Corrija falhas da mudança e documente limitações de ambiente com evidência.

J1: casa realiza jornada completa até confirmação e resultado conhecido/desconhecido honesto. J2: A/B/casa e pessoa em duas contas repetem o fluxo, sem mistura de dados, arquivos, credenciais ou monetização; suspensão/revogação/expiração são imediatas no próximo comando. Casos T01–T18 e protocolos S-* seguem `05-VERIFICACAO-INTEGRAL.md`; cubra os aplicáveis e justifique omissões.

Atualize `docs/implementation/STATUS-EXECUCAO.md` por entrega. Preserve históricos e salve logs, manifestos, decisões e relatório final em `docs/implementation/`. Separe implementação, verificação local, homologação e ativação. Informe se os testes são unitários/mocks, SQL real serializado, multi-sessão ou browser integrado.

Mantenha checkpoint com etapa atual, arquivos alterados, aceites cumpridos, próxima ação e bloqueios. Se o contexto acabar, retome do checkpoint, revalidando mudanças; não reinicie nem pare apenas por ter concluído uma etapa.

## 7. Riscos e definição de conclusão

Riscos prioritários: RLS interromper consumidores sem contexto; autorização só no frontend; bootstrap exigir bypass; postagem/receita inventadas; retry duplicar envio; migrations alterar dados/contratos sem recuperação; nova superfície SaaS escapar da auditoria; confundir mock verde com homologação.

A execução está concluída quando todas as entregas tecnicamente disponíveis possuem consumidores reais, critérios observáveis cumpridos, integração verificada e documentação coerente. O produto integral só é declarado pronto quando os gates relevantes e a homologação também forem satisfeitos.

Se algo permanecer bloqueado, liste: entrega exata; funcionalidade ainda indisponível; evidência do bloqueio; dado/decisão/autorização necessários; trabalho já concluído; dependentes afetados. Não marque uma spec inteira concluída porque suas tabelas ou tipos existem.

Na resposta final, informe: funcionalidades implementadas; verificações e resultados; migrations locais/remotas e ambientes; impedimentos verdadeiros; checklist completo de todas as specs. Não devolva outro prompt ou só recomendações: execute este pedido até os limites reais descritos.
