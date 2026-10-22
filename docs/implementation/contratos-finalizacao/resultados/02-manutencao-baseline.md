# Resultado OS-02 — Manutenção e baseline

Estado: CONCLUIDO

**Limitação descoberta na OS-05:** o acesso reservado200 abaixo foi comprovado apenas em deployment antigo. A afirmação de que isso permitiria publicar/testar nova candidata sob pausa foi uma inferência incorreta. A Vercel posteriormente bloqueou os dois novos builds com motivo explícito de projeto pausado. Backup, drenagem e baseline continuam demonstrados; viabilidade da publicação sob esse mecanismo NÃO está comprovada. Ver [resultado OS-05](05-publicacao.md), que bloqueia o avanço e registra a manutenção substituta proposta, ainda não executada.

Projeto Supabase `spbuwcwmxlycchuwhfir`, schema garimpa; Vercel web/equipe previstos; GitHub ManyRagDev/bizuminer. A OS-01 foi concluída com autorização explícita do diretório persistente. Somente os recursos BizuMiner foram pausados.

## Aceites e evidências

- AC-1: domínios canônicos, alias padrão e deployment ativo retornam503 DEPLOYMENT_PAUSED, inclusive acesso Vercel autenticado. As16 outras URLs de deployment redirecionam para autenticação Vercel; SSO permanece ativo. Caminho protegido não ativo retorna200 para HEAD autenticado e permite publicar/testar candidata reservada sem reabrir domínios. CLI gerou automaticamente credencial de bypass de proteção restrita ao projeto para o acesso suportado; valor não foi exposto/commitado. Isso não autentica usuário dentro da aplicação; login Google continua obrigatório no pré-C.
- Monitoramento366364369 foi desabilitado, preservando MONITORING_ENABLED=true. Run38949720805 em andamento foi cancelado e conferido completed/cancelled. Workflow novo de captura ainda não publicado. Nenhum lote pendente, nenhum escritor local identificado no host, zero sessões runtime ativas após o término do teste reservado. Dispositivos antigos não foram revogados: seu endpoint público está pausado; último uso observado13/10.
- AC-2: backup final privado `20261016-os02-antes-rollout.dump` e metadata em `/home/many/.local/share/bizuminer/backups/`, cópia idêntica conferida, arquivo0600/diretório0700. Restauração real em cluster local novo17.11/SCRAM:28 contagens/digests iguais,29 policies,51 FKs, zero constraints inválidas; cluster encerrado.
- AC-3: baseline administrativa da projeção original35 congelada e contagens iguais ao snapshot runtime. Preservados1.657 produtos,9.338 observações,407 capturas,1.495 publicações,172 links e767 cliques. Crescimento desde o ensaio da OS-01 ocorreu antes do término do monitoramento cancelado; não foi ocultado ou descartado. Fingerprints dos8 schemas externos e8 buckets preexistentes registrados sem exportar seus dados. Verificador local A/B/C PASS exit0; histórico ainda contém apenas M1 e dois complementos relevantes.

[Evidência estruturada](02-manutencao-baseline.json). Comandos e exit codes, baseline e resultados de restore estão no JSON. Nenhuma migration/DML/alteração de Auth/Storage/global foi feita nesta ordem; manutenção continua ativa para OS-03.

## Recuperação e limites

Se a unidade seguinte não puder prosseguir antes de qualquer DDL, reativar somente web/workflow que foram pausados, preservando refs e variáveis anteriores. Não deixar site parado aguardando decisão sem necessidade. Após A/B, retorno depende da compatibilidade demonstrada, com controle comercial falso. Fluxos Google, Storage e pooler real serão verificados nas ordens próprias; testes locais não os certificam.

Arquivos próprios: somente este resultado e seu JSON. Próxima ordem autorizada: OS-03, A inteira pelo MCP, com bytes/hashes/preflight e histórico conferidos. Nenhuma alteração de fonte/SQL/contrato ou trabalho preexistente.
