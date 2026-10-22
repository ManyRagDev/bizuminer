# CF-02 — Preservação, acesso e recuperação seletiva

Estado: PRONTA para consumo. Reutiliza o parecer33, [preservação35](../35-PRESERVACAO-E-VERIFICACAO-DE-ACESSO.md) e sua consulta de projeção original. Não cria infraestrutura nova de backup.

## Entrada e saída

Entrada: alvo CF-01, catálogo real das 28 tabelas originais, acesso de exportação legítimo, binários PostgreSQL 17 compatíveis, destino protegido e escritores drenados. Saída: backup seletivo recuperável e localização restrita; prova de restore descartável; baseline consistente; comparações por fase; evidência distinta de acessibilidade runtime. O conteúdo sensível permanece fora do repositório.

Falhas explícitas: exportação parcial por RLS, dependência ausente, restore com erro, local efêmero como única cópia, escritor ativo, diferença inexplicada, usuário legítimo sem acesso ou alteração inesperada em outro app. Qualquer falha impede a próxima DDL/abertura. Contagem igual não prova conteúdo igual; consulta como postgres não prova acessibilidade.

## Backup proporcional e verificável

1. Na OS-01, localizar ou preparar ferramentas padrão `pg_dump`, `pg_restore`, `psql`, `initdb`, `pg_ctl`, compatíveis com PostgreSQL17. Na inspeção desta rodada, dump/restore não estavam no PATH nem no pacote nativo temporário conhecido; Docker também não. Não anunciar ferramenta ou comando de backup já disponível. Download/instalação local de ferramentas requer origem verificada, sem modificar dependências da aplicação.
2. Usar conexão explicitamente identificada e apropriada ao export. `garimpa_app` não tem BYPASSRLS: só serve se exportação completa for demonstrada. Não conceder bypass ao runtime para facilitar. O MCP de SELECT não substitui um dump consistente. Segredos por mecanismo protegido, como serviço/passfile privado; nunca URL com senha em argv, relatório ou log.
3. Exportar schema/dados `garimpa`, DDL/owners/ACLs/policies/functions/triggers/sequências e atributos/memberships **somente das roles necessárias**, sem senhas. Catalogar dependências fora do schema e incluir apenas o necessário à restauração local; não exportar indiscriminadamente Auth/dados dos outros apps ou `pg_dumpall` global.
4. Registrar estado/referências Storage específicos do BizuMiner. Antes de B, o bucket próprio foi observado ausente e vazio33; reconferir. Após existir conteúdo, preservação inclui os objetos correspondentes, não apenas metadata SQL. Verificar disponibilidade das versões de chaves server-only necessárias à recuperação sem registrá-las nos artefatos públicos.
5. Proteger diretório temporário com modo0700 e arquivos0600; manter cópia recuperável em destino privado persistente aprovado e verificá-la antes da primeira DDL. `/tmp` sozinho não é retenção durável. Registrar apenas localização sem credencial, responsável e método de recuperação no resultado.
6. Restaurar em cluster **novo, descartável, em loopback**, com roles/dependências necessárias. Não restaurar sobre banco ativo ou sobre a fixture já semeada de `native-postgres-fixture.ts`. Nenhum erro de restore pode ser ignorado. Conferir inventário, dados, referências, DDL/ACLs/RLS relevantes. Dependência gerenciada simulada localmente deve ser identificada: restore local não certifica Auth/Storage/Supavisor.
7. Repetir/alinhar backup final na OS-02 após drenagem, com baseline congelada. Uma estratégia alternativa com snapshot compartilhado exige suporte e demonstração reais; não presumir que exista. Antes de A, demonstrar restauração do backup final e equivalência com essa baseline.

Os comandos padrão serão determinados por ferramenta/capacidade comprovadas na OS-01 e registrados ali com parâmetros não sensíveis. Este contrato não inventa um script npm de exportação nem exige projeto pago.

## Comparações

| Dimensão | Antes de A | Após A/B | Após C e retomada |
|---|---|---|---|
| Conteúdo legado | Counts + digests agregados da projeção exata de colunas originais35, em snapshot consistente | Mesma projeção e ordenação; novas colunas não entram na comparação | Mesma referência; contabilizar separadamente somente escritas controladas/legítimas |
| Referências | FKs validadas, órfãos, relações de conta/autor/evento/publicação/preço/link | Zero nova inconsistência; defaults/owners/grants conforme fase | Integridade estrutural e história preservada |
| Acesso | Runtime real sem SUPER/BYPASS; conta legítima; público limitado | Acesso legado mantido; V2 negada | Contexto humano/worker e pool real; negativas de ausência/outra conta/público |
| Outros apps | Fingerprints ordenados de schema/owner/ACL/RLS/functions/triggers/constraints e buckets preexistentes | Mesmos fingerprints, ressalvadas apenas exceções CF-01 | Mesmos fingerprints; atividade própria dos outros apps não é atribuída automaticamente ao BizuMiner |

Reusar a consulta em `docs/implementation/evidencias/execucao-35-preservacao-preliminar.json`, cuja projeção é explícita. Digests existentes são comparação de conteúdo, não backup, prova criptográfica de origem ou novo ledger. Não executar o script35 inalterado: ele sobrescreve a evidência histórica e seu contexto pré-C não representa todos os acessos pós-C.

O snapshot35 tem 1.657 produtos, 9.261 observações, 1.495 publicações e 172 links; são números datados, não valores fixos exigidos na execução. Há cliques, capturas, avaliações e vínculos além de produtos/regras. Crescimento legítimo anterior à pausa é nova baseline, não perda. Depois da pausa, toda diferença precisa de explicação verificável antes de continuar; nunca atualizar automaticamente a referência para fazer PASS.

## Identidade e acesso

- Administração mede preservação de **todos** os registros. Runtime usa a conexão efetiva da aplicação, sem SUPER/BYPASS, transação e handle de `tenant-db.ts`; contexto vem de identidade/membership validada. Não basta `SET ROLE` por administrador como única prova do pooler real.
- Após C, pessoa, conta e projeção pública têm visibilidades distintas. Exigir todo registro privado para qualquer usuário seria regressão de segurança. Proprietário legítimo deve acessar seu catálogo/histórico/conta; a role pública recebe só projeções autorizadas.
- Verificar transações A/B/A ou equivalente de reuso/reset no pool real e ausência de vazamento. Sem contas reais múltiplas, cenários sintéticos de J2 ficam em ambiente local isolado; registrar o limite gerenciado, manter piloto desligado e não declarar J2 real concluída.

## Recuperação

Falha transacional: confirmar rollback antes de retomar. Falha de acesso sem perda: manter manutenção e reparar a fronteira afetada; restaurar dados não é tratamento padrão de autorização. Falha comprovada de dados: delimitar tabelas/registros/intervalo, escritas posteriores e dependências, obter revisão técnica da recuperação seletiva e executar apenas plano concreto autorizado. A autorização A/B/C não é autorização para sobrescrever o Supabase inteiro, apagar progresso de terceiros ou executar restore destrutivo indiscriminado.

Aceite: OS-01 comprova meios e ensaio; OS-02 comprova backup final/baseline; OS-03/04/07/08/09 comprovam comparações e acesso nas respectivas fases. Resultados guardam apenas agregados, comandos sanitizados e localização protegida do backup. A limitação de backups SQL quanto aos arquivos Storage está descrita na [documentação oficial de backups](https://supabase.com/docs/guides/platform/backups); não confundir metadata com conteúdo recuperado.
