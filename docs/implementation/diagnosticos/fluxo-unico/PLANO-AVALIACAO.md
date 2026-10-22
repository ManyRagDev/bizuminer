# Avaliação de IA e continuidade das decisões

Estado: plano diagnóstico; não autoriza chamadas pagas nem altera prompts, modelos ou gates existentes. Baseline: [DIAGNOSTICO.md](DIAGNOSTICO.md).

## Evidência disponível

O benchmark existente de triagem contém 50 produtos sintéticos em seis grupos. Foram executados seus cinco testes: passaram. Os avaliadores semânticos são simulados; inclusive o teste cujo nome contém “calibração perfeita” valida a composição com respostas controladas, não a qualidade do modelo real.

Também passaram 22 cenários SQL de preço/triagem: há cobertura de recuperação de retenção, escopo de lote/tenant, adiamento, validade, aplicação obsoleta, revisão humana e amostragem. Isso sustenta partes do comportamento; não demonstra que o operador entenda a transição entre avaliações.

## Matriz proposta de avaliação reproduzível

| Grupo | Sequência / evidência necessária | O que medir |
|---|---|---|
| Entrada comum | Mesmo produto equivalente pelas entradas lote/manual/extensão, respeitando evidência disponível | Mesmo critério quando fatos/política forem iguais; diferenças de escopo explicadas |
| Regra vs IA | Preço inválido, barato com/sem histórico, risco, qualidade baixa, saturação | Decisão esperada e razão; se houve chamada de IA; custo evitado |
| Humano vs IA | Avaliações independentes sobre o mesmo snapshot, política e público | Concordância por dimensão, falsos positivos de aprovação, riscos ignorados, desconhecidos inventados |
| Reavaliação | Recaptura, variante diferente, nova observação durante inferência, ação humana concorrente | Nenhuma aplicação de saída obsoleta; identidade/digest/versionamento corretos |
| Avaliação editorial vs V2 | Mesmo item revisado nos dois formulários | Correspondências e divergências explicitadas; esforço repetido e critérios não equivalentes |
| Oportunidade | Mesmo produto, dois públicos/canais e políticas distintas | Classificação contextual e preservação da origem no kit |
| Temporalidade | Aprovado antigo com evidência nova; pendência antiga recapturada; retido retomado; expirado | Ordem visível previsível e validade preservada; ausência de desaparecimento silencioso |
| Publicação | Copiar → gerar material → validar → exportar → confirmar → resultado | O operador reconhece cada estado; nenhuma cópia contada como publicação |

## Procedimento e critérios

1. Congelar conjunto de entradas, snapshots, política/diretriz, versão do prompt/modelo, parâmetros e rótulos humanos; separar calibração de conjunto de avaliação. Incluir produtos sem avaliação anterior e casos rejeitados/retidos, não apenas aprovados pela IA.
2. Rodar primeiro o modo determinístico, com relógio e respostas controlados. Reaproveitar fixtures existentes sem editar o código durante a investigação.
3. Havendo autorização posterior para IA real, executar conjunto limitado com orçamento e destino definidos. Registrar latência, tentativas/fallback, resposta, custo observável e versão. Credenciais ficam fora de fixtures/relatórios.
4. Comparar decisões por dimensão e por grupo, incluindo desconhecidos e riscos. Os critérios formais de promoção/ratificação existentes continuam vigentes; este plano não inventa novos limiares nem chama a amostra simulada de homologação.
5. Com sessão e ambiente de teste definidos, observar as mesmas tarefas de operador em desktop/mobile, com teclado, empty/error/loading e dois contextos do mesmo produto. Medir passos e retorno às telas sem estimar ganho percentual sem baseline.

Fechamento: evidência de coerência de decisão **e** continuidade na interface. O plano permanece pendente para avaliação semântica real e jornada autenticada; a investigação local e o mapeamento entregues não dependem de afirmar esses resultados.
