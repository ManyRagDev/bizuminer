# Conferência do plano de retomada com o planejamento original

15/10/2026. Skill codex-arquiteto. **Parecer: o caminho24 preserva o objetivo e os contratos originais, após os complementos registrados nesta conferência. Ele é um plano de retomada da implantação; não substitui o escopo dos13 épicos.** Nenhuma funcionalidade, migration ou configuração remota foi alterada nesta rodada.

## 1. Resultado esperado e fontes

Evitar que a correção da implantação reduza a entrega a instalar SQL ou adie segurança para depois do uso comercial. O executor deve concluir a mesma plataforma prevista: motor de inteligência comercial comum para afiliação própria e SaaS, com produção preservada e capacidades verificáveis.

Fontes confrontadas:

- Blueprint original em `/home/many/Downloads/BLUEPRINT-MESTRE-BIZUMINER-V2.md`. A cópia [preservada no repositório](BLUEPRINT-MESTRE-BIZUMINER-V2-fonte.md) é **idêntica byte a byte** ao arquivo original nesta conferência.
- [Arquitetura02](02-ARQUITETURA-GLOBAL.md), [contratos03](03-CONTRATOS-COMPARTILHADOS.md), [evolução04](04-EVOLUCAO-E-MIGRATIONS.md), [verificação05](05-VERIFICACAO-INTEGRAL.md), [dependências/gates07](07-PRONTIDAO-E-DECISOES.md), [rastreabilidade08](08-RASTREABILIDADE.md) e as13 specs EP-00–EP-12.
- Planos executáveis [15 / D00–D14](15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md) e [17 / R00–R14](17-PLANO-SEQUENCIAL-DE-CORRECAO-CF01-CF18.md), incluindo as regras de continuar frentes independentes e não chamar código pendente de gate externo.
- [Auditoria22](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md), [execução23](23-CORRECOES-AUDITADAS-E-APLICACAO-SEGURA.md) e [retomada24, agora complementada](24-CAMINHO-SEGURO-PARA-CONCLUSAO.md).

O pedido original do proprietário de planejamento integral prevalece sobre o prompt de exemplo do blueprint que sugeria começar apenas por EP-00. Isso já está registrado na matriz08; a conferência não executa instruções dos prompts anexos nem modifica o blueprint.

## 2. O que coincide e o que precisava de ajuste

| Tema | Plano original | Plano24 conferido |
|---|---|---|
| Negócios | D-01/02 e REQ-DOM-02: próprios e SaaS permanentes, motor comum | Preservado. Staging separado é isolamento de ambiente, não outro motor nem abandono de uma frente |
| Produção | D-05, INV-09/10, T18 e REQ-OPS: adaptação incremental, recuperação e continuidade | Preservado pela matriz S0–S3, atualização dos escritores e isolamento após compatibilidade comprovada |
| Segurança antecipada | EP-10A antecede novas escritas comerciais, inclusive da casa; cada tabela nova nasce protegida | O texto24 anterior proibia externos durante S1/S2, mas deixava ambígua a ativação de novas escritas da casa. **Corrigido:** essas escritas também ficam bloqueadas em produção até10A/S3 conferidos; testes novos ocorrem no staging |
| Abrangência |13 specs,62 requisitos, C-01–C-09; D/R são filas de execução | O resumo24 não explicitava a herança completa. **Corrigido:** specs/contratos continuam normativos; fechamento individual por épico/requisito, ambiente e evidência |
| Aceite | T01–T18, sete suítes S-* e J1–J3 | O quadro24 resumido não enumerava esses critérios. **Corrigido:** adoção expressa integral, com resultados e casos não executados identificados |
| Evidência real | G-EVIDENCE para comparação por fonte; G-PRICE para E3 | G-EVIDENCE estava implícito. **Corrigido:** E2 também exige configuração/proveniência reais autorizadas; fixture ou payload v2 não comprovam obtenção da evidência |
| Liberação independente | Manual08-A/C pode anteceder parser; piloto assistido12 não exige09/11 | Não havia proibição explícita de depender de toda a fila. **Corrigido:** gates de automação/experimentos não bloqueiam o piloto assistido permitido nem registro manual independente |
| Ativação progressiva | Fixture → staging → casa em sombra/comparação → assistido → observação → externos após10B | Complementada em24 após isolamento. Contratos de segurança são preparados cedo; a troca tardia e compatível de policies não adia autorização para o fim |
| Critérios comerciais | Cadência, demonstração com fonte, economia dual e ausência de métricas fabricadas | REQ-MKT-01–03 estavam resumidos em “resultados”. **Corrigido:** provas de cadência/contexto, tempo/cobertura e separação financeira no fechamento |
| Conclusão | REQ-OPS-03 exige ganho funcional verificável, não apenas existência de arquivos | Reforçado: EP-08 completo não encerra com parser só sintético;11 não encerra com adapter de teste;12 não encerra com contas fictícias |

Esses ajustes esclarecem obrigações já estabelecidas. Não alteram preço de plano, quotas, rubrica, thresholds, canal, direitos ou estratégia do proprietário.

## 3. A divergência que justificou reorganizar as migrations

O plano04 previa M-10A2 com **policies restritas e funções públicas mínimas**, quando a aplicação inteira já usasse transação contextual. A arquitetura02 também determinava adotar contexto nos consumidores antes da ativação das policies.

Na materialização atual, o arquivo original2 restringe o acesso, mas as projeções públicas estão nos arquivos6/8. A auditoria22 demonstrou essa janela e encontrou incompatibilidades do bootstrap/autoria. Portanto, a ordem executável não satisfez integralmente as pré-condições do desenho original. Reorganizar essa implantação corrige a divergência; não muda a finalidade do produto.

Também não basta deslocar original2 intacta para o fim: seu laço de substituição pode alcançar as policies especializadas criadas depois. A candidata revisada deve separar dependências aditivas e usar substituição explícita das policies legadas, preservando os controles específicos. A autorização é por efeito e artefato revisado, não pelo número ou nome original do arquivo.

**Limite:** esta conferência não criou a nova candidata SQL nem a aprovou para produção. A sequência final por arquivo/hash continua sendo resultado exigido da entrega2 de24, a ensaiar em staging. A rejeição automática anterior e o parecer técnico sobre original2 não foram revogados.

## 4. Correspondência dos13 épicos

E1–E6 abaixo são as seis entregas do plano24; não representam novos épicos. A coluna de prova mantém a condição funcional original, não certifica sua implementação atual.

| Épico | Correspondência na retomada | Prova original que continua obrigatória |
|---|---|---|
| EP-00 | E1, E3, E6 | Deployment/roles/fontes/baseline conhecidos; discrepâncias explicadas sem inventar fatos |
| EP-01 | E2, E4–E6 | Mesma evidência em todos os consumidores, variantes/moedas/gaps corretos; E3 aprovado ou desligado com gate; G-EVIDENCE por fonte |
| EP-02 | E2, E4, E6 | Revisão humana sem depender de IA, Q/V/O/A separados, sombra e ratificação explícita; marca/preço não viram veto universal |
| EP-03 | E2, E4–E6 | Política contextual, radar e fila de monitoramento reais; produto caro pode servir a nicho; barato não é descartado pelo piso universal |
| EP-04 | E2, E4–E6 | Campanha/rascunho/revisão/snapshot/link utilizáveis; publication web preservada; purge não destrói referência comercial |
| EP-05 | E2, E4–E6 | Pauta/Radar/Resultados com ações reais, próxima ação, erros e desconhecidos honestos; comprador sem regressão |
| EP-06 | E2–E6 | Kit editado/validado/aprovado/exportado por revisão; arte inspecionada; direitos, preço, claim e link rechecados |
| EP-07 | E2, E4–E6 | Exportar não confirma postagem; canais distinguíveis; links4/12 e monetização por dono preservados |
| EP-08 | E2–E6 | Registro manual com fonte/origem desconhecida; ledger e custos/receita SaaS separados; importação real autorizada idempotente para fechar08-B |
| EP-09 | E2, E4, E6 | Métricas com fonte/coorte/denominador; promoção revisada e reversível; sem exposição não há CTR ou causalidade inventada |
| EP-10 | E1–E6 | Contexto em todos os caminhos, isolamento DB/Storage/URL/worker, duas sessões, autoria global, revogação e relatório10B da versão exata |
| EP-11 | E2–E4, E6; E5 somente se seus gates permitirem | Claim/marker/finalize, quota/cooldown/kill switch, unknown sem retry cego; envio oficial autorizado e fallback manual para concluir o épico |
| EP-12 | E2–E6, respeitando gates | Onboarding/plano/quotas/suporte/saída;10B incluindo onboarding; afiliado real autorizado completa campanha;09/11 não obrigatórios |

A entrega6 deve atualizar também D00–D14 e R00–R14. Um defeito técnico reabre sua fatia original; não reinicia automaticamente todos os épicos nem desaparece ao receber status “gate”.

## 5. Contratos e invariantes preservados

| Contrato | Condição a preservar na candidata revisada |
|---|---|
| C-01 | Identidade global + membership, contexto transacional, papéis distintos, credenciais privadas e projeção pública mínima; house usa o mesmo motor |
| C-02 | Observação factual/proveniência, comparabilidade explícita, legado sem variante inventada, E0–E3 e claims coerentes |
| C-03 | Qualidade, valor, momento e público separados; regras por contexto e justificativa, sem nicho/piso universal |
| C-04 | Campanha/kit/revisão, snapshot e aprovação imutáveis, validade e mudança material verificadas |
| C-05 | Catálogo, exportação, confirmação e envio incerto são estados distintos; evento e estado consistentes |
| C-06 | Links antigos mantidos, novos códigos por publicação/canal, ownership e monetização, preview não cria clique comercial |
| C-07 | Origem financeira honesta, ledger/idempotência/reversão, moeda/centavos e separação de comissões, custos e receita SaaS |
| C-08 | Experimentos com método/revisão; dispatch com marker/lease; plano/quotas explícitos; sem novos bloqueios cruzados entre piloto e automação |
| C-09 | Contexto estabelecido no servidor, comandos com idempotência/versão, erros observáveis e autorização também no backend |

D-01–D-06 e INV-01–INV-10 continuam critérios de aceite: não fabricar dados/provas; não anunciar mínima absoluta; IA não é evidência; estados distintos; nenhuma atribuição financeira presumida; nenhum vazamento entre contas; nenhuma regra global de nicho; automação recuperável; sem reescrita injustificada. A venda já existente não será recriada como fixture de produção.

## 6. Rastreabilidade dos requisitos e verificação desta conferência

Conferência determinística do arquivo original encontrou **62 IDs REQ distintos**, todos presentes na tabela normativa08: **zero IDs faltantes e zero extras**. Distribuição: CODEX2, CUR10, DIST3, DOM5, ED6, KIT5, MET5, MKT3, MON3, OPS3, PRICE6, SAAS5, TEST1 e UX5.

O [registro por requisito](evidencias/conferencia-25-aderencia.json) contém os62 IDs individualmente, a linha normativa de08, entregas24 correspondentes e hashes das fontes. Também registra as13 specs, nove contratos, T01–T18, D00–D14/R00–R14, o hash de24 antes/depois e as verificações de integridade desta conferência. A [versão de24 recebida para revisão](evidencias/conferencia-25-plano24-antes.md) foi preservada.

**Esta é cobertura documental e comparação semântica do plano. Não significa62 requisitos implementados/testados em produção.** Não foram executados testes de produto, SQL, deploy ou novos SELECTs remotos nesta rodada. Os resultados de implementação citados continuam atribuídos às rodadas22/23.

A evidência exigida da próxima execução é específica: requisito/spec → código/artefato → teste/caso → ambiente/hash → resultado e gate quando aplicável. G-BASE tem evidência histórica de rerun nativo verde em23, mas a candidata nova precisa confirmar seu próprio baseline. G-ENV/G-SEC e os gates de evidência/comerciais não são encerrados por esta comparação.

## 7. Parecer e uso pelo executor

**Bate com o plano original quanto à visão, domínio, escopo e resultados exigidos, com as correções acima incorporadas em24.** A alteração autorizável é a forma de implantar com compatibilidade; não há redução de épicos nem troca da estratégia dual.

O executor deve ler24 junto das specs/contratos/gates e deste quadro. Antes de aplicar, precisa materializar a nova cadeia revisada, provar S0–S3 e recuperação e obter o parecer correspondente aos hashes reais. Antes de declarar encerramento, precisa satisfazer a definição de pronto de cada épico ou registrar precisamente a entrega parcial/gate pendente. Segurança, instalação, homologação e ativação comercial permanecem estados diferentes.
