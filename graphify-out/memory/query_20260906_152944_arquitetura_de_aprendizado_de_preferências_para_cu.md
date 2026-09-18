---
type: "query"
date: "2026-09-06T15:29:44.550401+00:00"
question: "Arquitetura de aprendizado de preferências para curadoria: embeddings/RAG, processo iterativo ou fine-tuning"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Vitrine()", "Ranking por sinal de valor", "Saturação por espelhamento de ofertas"]
---

# Q: Arquitetura de aprendizado de preferências para curadoria: embeddings/RAG, processo iterativo ou fine-tuning

## Answer

Recomendação híbrida em camadas: começar com embeddings e recuperação de decisões humanas semelhantes, combinados com um loop iterativo versionado que ajusta prompt, regras, pesos de sinais e limiares com base em avaliações; não permitir que a LLM altere os próprios parâmetros a cada rodada. Manter approved, rejected e held/family_saturation como sinais distintos, pois saturação não é rejeição. Rodar inicialmente em shadow mode, registrar previsão antes da decisão humana, medir concordância e falsos positivos por família, categoria e marketplace e automatizar primeiro ações reversíveis de alta confiança. Fine-tuning somente depois de taxonomia estável, dataset limpo e diverso e evidência de que RAG mais prompting atingiu platô; mesmo então, manter RAG para preferências recentes e explicabilidade. No estado atual, o projeto já tem eventos e snapshots de curadoria, mas ainda não tem índice vetorial, inferência LLM em shadow, controlador de confiança nem fine-tuning.

## Outcome

- Signal: useful

## Source Nodes

- product
- Vitrine()
- Ranking por sinal de valor
- Saturação por espelhamento de ofertas