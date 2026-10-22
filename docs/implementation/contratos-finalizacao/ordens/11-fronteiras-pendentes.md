# OS-11 — Fechar somente contratos de capacidades com entradas reais

Estado: BLOQUEADA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: Entrada concreta da capacidade em CAPACIDADES-PENDENTES, proprietário identificado e OS-10 encerrada se compartilhar documentação.
Execução: sequencial

## Objetivo e aceite

- AC-1: para cada entrada recebida, registrar origem/autorização, decisão e limite sem presumir as demais.
- AC-2: confirmar o ponto técnico ainda ausente e produtores/consumidores atuais; propor contrato mínimo e ordem de implementação com lista exata de arquivos/testes antes de liberar código.
- AC-3: separar ausência de decisão/dado da lacuna técnica implementável; nenhuma capacidade é considerada implementada porque o contrato foi escrito.

## Leitura e contrato

- CF-03 e CAPACIDADES-PENDENTES; contratos C-01 aC-09 e spec do épico afetado.
- Callsite específico indicado no registro (parser, adapter, resolver, política, onboarding), amostra/termos/canal realmente fornecidos e validações existentes.
- Resultado OS-10 para saber versão instalada e alcance pendente.

## Escrita autorizada

Somente resultado/evidência próprios e `docs/implementation/contratos-finalizacao/CAPACIDADES-PENDENTES.md`, sob propriedade exclusiva, para registrar entradas/decisões reais e fronteira técnica diagnosticada. Relatório sanitizado bruto fica em local privado autorizado fora do Git; seu conteúdo não entra automaticamente em fixtures.

Esta ordem não autoriza editar SQL/runtime, criar contrato novo em uso ou executar integração externa. Novos contratos/ordens de implementação exigem replanejamento localizado com nomes/caminhos concretos definidos após a entrada; não criar diretórios de código genéricos antecipadamente.

Resultado: `docs/implementation/contratos-finalizacao/resultados/11-fronteiras-pendentes.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/11-fronteiras-pendentes.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Conferir entrada com cada linha do registro: relatório do programa e semântica para parser; destino/capability/permissão para adapter; credenciais e termos por conta para resolver; ratificação editorial/direitos/plano/privacidade quando aplicáveis. Não há comando genérico que homologue esses dados.

Validação do contrato: comparar produtor/consumidor/testes reais, justificar mecanismo novo e identificar observável de fim. Para dados/termos externos, validação runtime e fonte autorizada; só tipos estáticos não bastam. Sem entrada, manter BLOQUEADA naquela capacidade. Ordem técnica independente pode ser delimitada sem esperar decisão não relacionada, depois de diagnóstico suficiente.

## Operações externas

Nenhuma mutação externa, postagem, convite, cobrança, teste de envio ou ativação de política por esta ordem. Ler documentação oficial vigente quando a capability escolhida for analisada. Autorização específica de canal/cliente continua necessária; não há canal/preço/quota escolhido nestes contratos.
