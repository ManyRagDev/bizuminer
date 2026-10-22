# Contratos e ordens para finalizar o BizuMiner

16/10/2026. Produzido com a skill `arquiteto-de-contratos`. **Planejamento operacional: nenhuma aplicação, publicação ou ativação foi executada nesta entrega.** Os documentos organizam o [roteiro36](../36-ROTEIRO-ATE-A-CONCLUSAO.md); não substituem as specs dos 13 épicos nem os contratos C-01 a C-09.

## Base e autoridade

- Repositório `/home/many/Documentos/Projetos linux/Garimpa`, branch `main`, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`. Há alterações anteriores de código, SQL, testes e documentos; nada staged. A candidata inclui arquivos ainda não versionados. HEAD sozinho não a identifica. Preservar também `archive/site`, Marketing e demais trabalhos alheios.
- São propostas documentais novas. Os contratos compartilhados em uso, os SQLs auditados e seus consumidores permanecem intactos. Não foi confirmado que todos os escritores estejam parados.
- A autorização humana anterior para finalizar/aplicar persiste condicionada ao auditor. O [parecer33](../33-REAVALIACAO-DE-RISCO-E-ROLLOUT-DIRETO.md) libera condicionalmente o caminho direto A/B/C, sem staging pago obrigatório, exclusivamente pelos bytes aprovados. Seus requisitos ainda precisam de prova operacional. Não restaurar a exigência antiga de staging por copiar um relatório histórico.
- Conexão MCP, `PRONTA`, build verde ou este índice não substituem autorização nem pré-condições. Uma nova rejeição automática interrompe a operação: registrar ação/motivo e resolver a causa; não reenviar por outro transporte.

## Contratos

| Documento | Fronteira que fecha |
|---|---|
| [CF-01 — Implantação e compatibilidade](CF-01-IMPLANTACAO.md) | Identidade da candidata, escritores, fases A/B/publicação/C e efeito remoto permitido |
| [CF-02 — Preservação e recuperação](CF-02-PRESERVACAO.md) | Backup restaurável, baseline, integridade, acesso efetivo e proteção dos outros apps |
| [CF-03 — Integração e conclusão](CF-03-INTEGRACAO.md) | Contratos existentes, validação de funcionalidades, gates e alcance da conclusão |
| [Capacidades pendentes](CAPACIDADES-PENDENTES.md) | Entradas ausentes e lacunas técnicas que não podem ser declaradas entregues |

## Ordens em sequência

`PRONTA` significa executável **depois das dependências e critérios de entrada**, não operação liberada agora. `BLOQUEADA` identifica informação ou decisão fundamental ausente. Um único executor por vez; o mesmo agente pode percorrer todas as ordens prontas sem pedir confirmação genérica a cada etapa.

| Ordem | Estado | Entrada | Saída exigida |
|---|---|---|---|
| [OS-01 — Preparação](ordens/01-preparacao.md) | PRONTA | Contratos e alvo identificados | Candidata verificável; publicação/manutenção viáveis; ferramenta e ensaio de recuperação comprovados |
| [OS-02 — Manutenção e baseline](ordens/02-manutencao-baseline.md) | PRONTA | OS-01 concluída | Escritores drenados; backup final restaurado; comparações administrativas/runtime/outros apps congeladas |
| [OS-03 — Unidade A](ordens/03-unidade-a.md) | PRONTA | OS-02; preflight/hash de A | A íntegra, histórico conciliado, legado preservado, controle falso |
| [OS-04 — Unidade B](ordens/04-unidade-b.md) | PRONTA | OS-03; preflight/hash de B | Expansão e bucket privado corretos; controle falso e legado preservado |
| [OS-05 — Publicação](ordens/05-publicacao.md) | PRONTA | OS-04; candidata testada; manutenção mantida | Web e consumidores compatíveis identificados por versão efetiva; antigos parados |
| [OS-06 — Aceite pré-C](ordens/06-pre-c.md) | PRONTA | OS-05; acesso controlado à candidata | Fluxos usados passam no ambiente real; V2 continua negada |
| [OS-07 — Unidade C](ordens/07-unidade-c.md) | PRONTA | OS-06; backup válido; preflight/hash de C | Corte das 28 policies e controle true, com dados/ACLs íntegros |
| [OS-08 — Integração pós-C](ordens/08-integracao.md) | PRONTA | OS-07; manutenção mantida | Runtime/pooler/fluxos essenciais passam; cada capacidade recebe evidência e estado |
| [OS-09 — Retomada](ordens/09-retomada.md) | PRONTA | OS-08; nenhum defeito impeditivo dos fluxos a abrir | Só componentes aprovados retomados; gravações reais e ausência de regressão observadas |
| [OS-10 — Fechamento do Núcleo](ordens/10-fechamento.md) | CONCLUIDO | OS-09; resultados anteriores íntegros | Núcleo publicado e operado; transição para finalização do Blueprint |
| [OS-11 — Fronteiras pendentes](ordens/11-fronteiras-pendentes.md) | SUPERSEDIDA | Substituída pelo plano executável | Substituída pelas OS-13 a OS-19 sem bloqueios artificiais |
| [OS-12 — Correções de collation](ordens/12-correcoes-autorizadas.md) | CONCLUIDO | Ajuste aprovado de collation | Collation C e integridade do manifesto validados |
| [Plano de Entregas — Blueprint](PLANO-ENTREGAS.md) | PRONTO | OS-10 concluída | Roteiro estruturado de OS-13 a OS-19 para finalização do Blueprint |
| [OS-13 — Parser de Comissões](ordens/13-parser-comissao.md) | PREPARADA | OS-10; dados sintéticos | Adapters Shopee, AliExpress, ML e Canônico; preview e commit |
| [OS-14 — Resolver de Credenciais](ordens/14-resolver-credenciais.md) | PREPARADA | OS-13 | Resolução de segredos AES-256-GCM por conta sem fallback |
| [OS-15 — Dispatch Canal Oficial](ordens/15-dispatch-canal-oficial.md) | PREPARADA | OS-14 | Adapters Telegram e Webhook assinado, outbox worker |
| [OS-16 — Rubrica e Calibração E3](ordens/16-rubrica-e-calibracao.md) | PREPARADA | OS-15 | Avaliação humana V2, ratificação de política e E3 calibrado |
| [OS-17 — Storage Privado e Kits](ordens/17-storage-e-artefatos.md) | PREPARADA | OS-16 | Storage isolado, verificação de direitos de asset e render |
| [OS-18 — Onboarding e Experimentos](ordens/18-onboarding-e-experimentos.md) | PREPARADA | OS-17 | Onboarding atômico, quotas por plano e experimentos pareados |
| [OS-19 — Homologação Integral](ordens/19-homologacao-e-conclusao.md) | PREPARADA | OS-18 | Matriz de verificação completa e conclusão do Blueprint |

As ordens OS-13 a OS-19 detalham o avanço técnico real em substituição ao bloqueio artificial anterior. O executor pode percorrê-las sequencialmente com segurança e verificações automatizadas.

## Protocolo do executor

1. Ler esta página, os três contratos e a próxima ordem; confirmar instruções atuais, estado real, dependências e propriedade dos arquivos. Não exigir árvore limpa nem incluir trabalho alheio no release.
2. Executar somente o escopo da ordem; produzir seu resultado exclusivo antes de avançar. Leituras adicionais justificadas são permitidas. Escritas de código/SQL não previstas exigem delimitação anterior.
3. Em `[BLOQUEIO DE FRONTEIRA]`, registrar evidência, componente, resultado esperado/observado e arquivos necessários; parar a fase dependente. Replanejar somente essa fatia, interrompendo escritores afetados. Não relaxar testes, inventar decisão comercial ou atualizar o selo SQL para passar.
4. Manter evidências antigas intactas. Resultados novos ficam nos caminhos indicados pelas ordens. Nunca gravar dump, `.env`, cookies, tokens, chaves, relatórios pessoais ou resposta bruta de provedor no Git.

Formato de cada resultado: `Estado: CONCLUIDO | BLOQUEADO | NAO_VERIFICADO`; base/ambiente e horário; alterações próprias; AC → evidência; comandos com diretório/exit code; efeitos externos efetivos; limites; próxima dependência. `CONCLUIDO` é da ordem. Falta de acesso humano ao login, por exemplo, é `NAO_VERIFICADO`, nunca PASS presumido.

## Comandos de passagem existentes

Executar na raiz indicada acima, em cópia isolada para comandos que geram arquivos. Não há script novo de implantação ou backup criado por estes contratos.

```bash
npm run rollout:verify --prefix tools/editorial-tests
npm test --prefix packages/web
npm test --prefix packages/persistence
npm test --prefix packages/capture
npm test --prefix packages/extension
npm run typecheck --prefix packages/web
npm run typecheck --prefix packages/persistence
npm run typecheck --prefix packages/capture
npm run typecheck --prefix packages/extension
npm run build --prefix packages/web
npm run build --prefix packages/extension
npm test --prefix tools/editorial-tests
npm run test:commercial --prefix tools/editorial-tests
npm run test:public-readiness --prefix tools/editorial-tests
npm run test:verified-upgrade --prefix tools/editorial-tests
npm run test:cf-regressions --prefix tools/editorial-tests
```

Comandos específicos e suites nativas estão nas ordens. Os testes PGlite não certificam Supabase/Auth/Storage/pooler. Os scripts `verify:*`, `monitoring:*`, seed/bootstrap/captura não são diagnósticos automaticamente seguros.

Nesta preparação, `npm run rollout:verify --prefix tools/editorial-tests` passou: A/B/C exatas, três aplicações anteriores preservadas, 11 originais substituídas, 28 policies e 37 tabelas novas. Os testes amplos31 são históricos; não foram apresentados como nova execução. [Conferência documental](REVISAO-DOS-CONTRATOS.md).
