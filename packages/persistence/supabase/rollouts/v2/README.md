# Sequência substituta BizuMiner V2

**Candidata vigente: rodada31.** A reconciliação MCP confirmou o baseline real e revelou defaults de privilégios que não estavam na fixture28. A/B/C foram corrigidas e novamente seladas; os SQLs, manifesto e catálogo28 foram preservados em `docs/implementation/evidencias/rollout-28-aprovado/`. Use os hashes do manifesto atual, não os pareceres históricos. Ver [resultado31](../../../../../docs/implementation/31-RECONCILIACAO-E-PACOTE-DE-HOMOLOGACAO.md) e [auditoria31](../../../../../docs/implementation/31-AUDITORIA-INDEPENDENTE-RECONCILIACAO.md).

A/C recusam defaults de privilégios diferentes dos observados. B declara as permissões de cada uma das 37 tabelas novas e da nova view: retira UPDATE/DELETE herdados indevidamente, mantendo somente os GRANTs do contrato, inclusive as três permissões de atualização de colunas específicas. Não altera os defaults globais, grants legados nem FORCE RLS existente. C verifica também o inventário de permissões de coluna; ACL vazia e ausência de ACL representam igualmente nenhuma permissão adicional.

**Candidata local para homologação. Nenhuma destas três migrations foi aplicada remotamente.** Substitui as 11 originais pendentes para o baseline parcial observado na rodada26. A autorização humana já foi dada, condicionada à aprovação técnica; este diretório não concede aprovação de produção.

Os timestamps foram gerados pelo Supabase CLI. Os arquivos originais foram preservados como histórico e fonte revisável. **Não executar a pasta `supabase/migrations/` por ordem alfabética ou `db push`.** Este rollout consome exclusivamente `manifest.json`; o primeiro arquivo original e os dois complementos já instalados não devem ser reaplicados no ativo.

| Unidade | Arquivo | Entrada e saída |
|---|---|---|
| A — Fundação | [20261015194719_garimpa_v2_foundation.sql](20261015194719_garimpa_v2_foundation.sql) | Exige o subconjunto instalado e suas policies exatas. Cria role pública restrita, helpers e controle administrativo `rollout_control`, inicialmente desligado. Nenhuma policy legada é removida. |
| B — Expansão | [20261015194748_garimpa_v2_expansion.sql](20261015194748_garimpa_v2_expansion.sql) | Exige A e nenhuma estrutura comercial previamente instalada. Reaproveita os contratos das originais3–12, congela os laços de integridade e acrescenta proteção restritiva às 37 tabelas comerciais novas. Mantém acesso legado. O aceite de convite fica sem EXECUTE do runtime e tem defesa no próprio corpo. |
| C — Corte delimitado | [20261015194759_garimpa_v2_scoped_cutover.sql](20261015194759_garimpa_v2_scoped_cutover.sql) | Exige a expansão exata, versão compatível e escritores atualizados. Confere catálogo, roles, permissões, funções e views; substitui exclusivamente as 28 policies legadas listadas. Preserva segredos e policies específicas. Liga o controle somente ao final da transação. |

A/B/C são novas unidades de implantação; não são apenas uma renomeação da original2. A substitui suas dependências aditivas; C substitui sua mudança de acesso usando uma lista fechada. B incorpora as estruturas já implementadas, mudando os laços de M11 e acrescentando o bloqueio de transição, sem redesenhar os contratos de negócio.

## Conferência local reproduzível

```bash
npm run rollout:verify --prefix tools/editorial-tests
BIZUMINER_TEST_PG_BIN=/caminho/postgresql/bin npm run test:replacement-rollout --prefix tools/editorial-tests
```

O primeiro comando só lê arquivos, confere hashes e ordem; não conecta ao banco. O segundo cria seu próprio PostgreSQL17.6 temporário em loopback, usando dados sintéticos. Se a distribuição precisar, configure `LD_LIBRARY_PATH` para suas bibliotecas. Não aceita URL remota e encerra o cluster ao finalizar.

As fixtures comerciais completas das suítes SQL agora usam as três instalações históricas mais A/B/C (seis unidades). Os diagnósticos de instalação parcial e o teste de upgrade histórico continuam usando a cadeia antiga explicitamente; não a certificam para produção.

`tools/editorial-tests/build-rollout.py` gera os corpos a partir das fontes preservadas e da matriz explícita `tools/editorial-tests/rollout-privilege-matrix.json`. Depois de qualquer alteração em A/B, `inspect-replacement-expansion.ts` precisa capturar novamente o catálogo num PostgreSQL descartável; somente então `build-rollout.py --seal` pode gerar C. O catálogo registra os hashes dos seus SQLs de entrada. Qualquer regeneração invalida o parecer referente aos hashes anteriores. O catálogo vigente é `docs/implementation/evidencias/rollout-31-expansion-catalog.json`; os bytes aprovados27/28 estão arquivados nas respectivas pastas `evidencias/rollout-27-aprovado/` e `evidencias/rollout-28-aprovado/`. Pacotes não selados, catálogo divergente e combinações intermediárias B/C são recusados pelo loader/verificador.

## Condições de execução

1. Confirmar o alvo e a concordância entre histórico, catálogo e três instalações prévias; conferir backup/recuperação e versão publicada. A leitura remota31 reconcilia o alvo em seu horário registrado, mas deve ser repetida antes de cada escrita.
2. Ensaiar A/B/C em staging isolado do Supabase, com Auth, Storage, pooler e artefatos reais web/workers/extensão. Os testes nativos não emulam esses serviços nem identificam o deployment publicado.
3. Executar cada unidade em **uma única transação**, com os timeouts presentes no SQL (`lock_timeout=5s`, `statement_timeout=45s`). O transporte precisa garantir transação e registro de histórico consistentes; não executar instruções individualmente. O manifesto inclui hash do arquivo e de um envelope manual exato `BEGIN;\n` + arquivo + `\nCOMMIT;\n`. O hash do envelope não é alegação de envio remoto.
4. Depois de A/B, conferir a operação existente. Publicar a candidata compatível e atualizar/encerrar todos os escritores anteriores antes de C. Durante esse intervalo, os novos serviços negam por padrão no backend/CLI e no banco. O site público usa as projeções completas; sua prontidão inclui roles e permissões, não somente nomes de funções.
5. C somente após matriz de compatibilidade/recuperação e revisão independente por hash, mais avaliação automática aplicável. Objeto ou permissão divergente interrompe o preflight. Não editar o snapshot para fazê-lo aceitar um ambiente desconhecido.
6. Registrar cada envio, sucesso, versão remota e pós-verificações. Interrupção exige reconciliar histórico e catálogo; não supor rollback nem marcar arquivos antigos como aplicados.

O namespace e os contratos `garimpa` são preservados. O controle do rollout é de implantação, separado dos gates comerciais: ligá-lo não homologa E3, amostra humana, direitos, canal, experimento, termos de piloto ou convites reais.

## Pós-verificações mínimas

- A: mesmo catálogo/policies legados; controle falso; runtime sem DML no controle; role pública sem login, bypass ou acesso a relações privadas.
- B: legado acessível, funções públicas completas e monetização preservada; novas escritas/IA V2/arquivos/envio/provisionamento bloqueados; convite bloqueado inclusive no definer; estado não aplicado parcialmente em falha.
- C: ausência das 28 policies antigas; todas as específicas preservadas; público sem acesso direto a tabelas/views privadas; owner/operator separados; suspensão/reativação; A/B/A, login e autores cross-home; quota, convite, dispatch, financeiro e artefatos no ambiente apropriado. Dados e autoria histórica preservados.

Os testes locais incluem falhas reais por policy inesperada, grants de tabela/coluna/view, mudanças de definição/opções de views e funções completas, role herdada privilegiada, SET/USAGE ausente, singleton ausente, RLS/owner, FK e trigger divergentes. C confere esses contratos antes da primeira remoção de policy. Isso não substitui ensaiar volume, locks e todos os escritores reais em staging.

## Recuperação

Antes de C, manter A/B com controle desligado e usar o artefato que passou no estado de expansão; não apagar estruturas ou histórico. Depois de C, manter o isolamento e usar um artefato compatível. O administrador pode desligar `garimpa.rollout_control.enabled` para impedir novas capacidades; o runtime não pode ligá-lo por DML, variável de ambiente ou GUC. A suíte demonstra que essa recuperação conserva as restrições privadas e as ofertas públicas.

Não reinstalar policies globais `using(true)`, apagar ledgers ou retornar ao código sem contexto após o corte. Os arquivos são deliberadamente de uso único: ausência/presença de objetos e `IF NOT EXISTS` não autorizam pular etapas ou repetir uma execução incerta.

Relatório, evidências e parecer da rodada em [`docs/implementation/`](../../../../../docs/implementation/).

## Monitoramento e limites da base reconstruída

O worker de monitoramento recebeu contexto transacional próprio, sem identidade de owner. Os três helpers privados de B expõem somente agregados de interesses, estado mínimo da própria conta e gravação idempotente de skip com motivo conferido. O cron da casa foi exercitado nos estados B/C; não há SELECT irrestrito de favoritos/alertas ao worker. O CLI nega execução externa em outra conta até existir resolução validada das credenciais dela. A operação SaaS continua parte do objetivo permanente.

`backfill-family.ts` agora tem contexto worker por tenant, prévia padrão e `--apply`. Bootstrap e seed da casa exigem conexão administrativa explícita separada (`BIZUMINER_MAINTENANCE_DATABASE_URL`), prévia padrão e `--apply`; não usam poderes de owner/plataforma inventados. A curadoria inicial histórica, purga, lifecycle e antigo teste de isolamento foram retirados do procedimento V2 e abortam antes de conectar. Ver inventário28 para comandos suportados e os diagnósticos com efeito externo.

A fixture é reconstruída: registra a função legada de seed de curadoria, e o ensaio operacional28 instala seu trigger exato e o exercita na captura real sob runtime. A fixture geral ainda não é um dump integral de produção. A conferência dos triggers reais, defaults e ações legadas de FKs continua obrigatória. O selo de C cobre os triggers instalados pela cadeia ensaiada e não substitui essa inspeção. Storage/Auth/pooler e versão publicada não foram homologados pelo PostgreSQL descartável.

Leia o [relatório27](../../../../../docs/implementation/27-MIGRATIONS-SUBSTITUTAS-E-VERIFICACAO.md) e o [parecer independente27](../../../../../docs/implementation/27-AUDITORIA-INDEPENDENTE-ROLLOUT.md) como histórico. Os pareceres27/28 referem-se aos bytes preservados; a candidata31 depende de seu parecer próprio, somente para ensaio isolado.

## Registro da candidata28 — histórico

B/C foram revisadas para preservar pareamento e uso de dispositivo sob RLS: duas funções estreitas, sem abertura de policies privadas. B e C exigem a unicidade original dos hashes de token/código, sem criar índices no alvo para mascarar drift. O backend de captura manual/navegador/dispositivos foi contextualizado e revalida revogação. **Publicar esse backend somente depois de B**, pois a troca de pareamento/marcação de uso depende dessas funções.

Aprovação histórica: [parecer28](../../../../../docs/implementation/28-AUDITORIA-INDEPENDENTE-FINALIZACAO.md), pelos hashes preservados na pasta28. Resultado e inventário: [finalização28](../../../../../docs/implementation/28-FINALIZACAO-LOCAL-E-INVENTARIO-OPERACIONAL.md). Os acessos Supabase/Vercel foram confirmados na rodada31; staging/recuperação e aprovação de produção continuam pendentes. O limite de execução com credenciais da casa permanece explícito.
