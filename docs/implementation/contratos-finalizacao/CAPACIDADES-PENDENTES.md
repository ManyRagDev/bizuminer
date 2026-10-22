# Capacidades — estado após correções da auditoria OS-19

18/10/2026. Baseline main 43700c59 + alterações locais preservadas + OS-020…025. A afirmação anterior de todas as capacidades homologadas foi contestada pela [auditoria de entrega](resultados/19-auditoria-entrega.md). A contraprova independente final foi CONFORME para as correções locais dos doze BUGs e as sete capacidades delimitadas: [parecer vigente](correcoes-19/AUDITORIA-ENTREGA.md). Esta tabela distingue software local de homologação/ativação no ativo; não certifica resultado comercial.

| Capacidade | Implementação / prova local corretiva | Limite vigente |
|---|---|---|
| Comparabilidade / E3 | Motor e fallback conservador preservados; benchmark EXP-02 e suíte price-evidence | Calibração/ratificação real exigida para E3; benchmark sintético não substitui aprovação |
| Rubrica humana / sombra | OS-023, BUG-009: gate comum de 30–50 ofertas, ator owner, critérios/amostra congelados e evento | Amostra/política reais ainda dependem aprovação; não inventadas nesta correção |
| Parser multi-rede | OS-020, BUG-001/002/003: CSV BR, datas rejeitadas honestamente, header-only e commit financeiro verificados | Relatórios reais e upload no ativo não homologados nesta rodada |
| Credenciais de captura por conta | OS-021, BUG-004/005: dispatch/worker/adapter A/B, segredo próprio, publicação isolada e revalidação; local suspensa bloqueada | APIs autenticadas Shopee/AliExpress implementadas; ML multicliente sem adapter contratado permanece indisponível. Nenhuma captura real nova |
| Storage / kits | OS-024, BUG-010/011: contenção local, artefatos privados, três formatos e QR decodificado | Direitos por asset continuam obrigatórios; Storage/Auth remotos e câmera física não testados |
| Canal oficial / outbox | OS-022, BUG-006/007/008: fábrica/CLI compatíveis, sem fallback, HMAC e retries persistidos | Canal/destino/aprovação reais e kill switch continuam gates; não houve envio real |
| Experimentos / onboarding / quotas | Protocolo pareado preservado; reconciliação R-02 mantém provisionamento separado e campanhas ativas; suspensão corrigida | Não implementa cobrança nem novo limite mensal; piloto/termos/privacidade e prova de valor exigem decisões/evidência próprias |

Resultados locais, limites e estado dos mesmos BUGs em [25-correcao-conclusao.md](resultados/25-correcao-conclusao.md). Contrato corretivo e ordens em [correcoes-19/PLANO-ENTREGAS.md](correcoes-19/PLANO-ENTREGAS.md). A implantação anterior do núcleo não foi desfeita nem auditada novamente de forma irrestrita. Não se declara Blueprint integral homologado no ativo.
