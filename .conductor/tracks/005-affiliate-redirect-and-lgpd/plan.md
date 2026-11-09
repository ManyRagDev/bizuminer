# Track 005 — Medição de saídas da Pauta

**Status em 9 de novembro de 2026:** Reaberta. Diagnóstico confirmado. Plano aguardando aprovação.

O botão de compra dos links assinados da Pauta redireciona para o anúncio correto com a tag da conta. A rota `/go/pauta/[token]` responde `302`, mas não registra em `garimpa.click_event`. Esse registro alimenta o total e o ranking de cliques do painel Resultados. O fluxo `/go/[slug]` já usa o registrador do catálogo.

Na checagem de lançamento, 11 das 12 ofertas prontas do WhatsApp usavam o caminho assinado. Todas as 12 páginas públicas abriram sem login e os destinos estavam atribuídos à conta. No banco havia 44 produtos aprovados do Mercado Livre na conta da casa sem publicação `web`. O registro exige vínculo com `garimpa.publication`, portanto depender de uma publicação da vitrine deixaria cliques sem cobertura.

## Escopo e critérios de aceite

- [x] Confirmar em produção, por leitura, que páginas e destinos afiliados funcionam. Reproduzir em banco isolado dois redirecionamentos válidos com zero cliques persistidos.
- [ ] Registrar a saída de um visitante real pelo link assinado no mesmo sistema que alimenta Resultados. Resolver produto, anúncio e conta pelo token válido no servidor. Reutilizar a publicação apropriada quando existir. Para a oferta sem publicação web, associar o clique a uma publicação própria da Pauta, com chave idempotente por conta e produto, sem inserir a oferta na vitrine por causa de um clique.
- [ ] Aplicar ao caminho assinado as proteções do catálogo para `HEAD` e prévias de mensageiros, registrar o IP apenas como hash e limitar os campos de origem. Preservar o destino afiliado e o `302` quando apenas a telemetria falhar. Tokens inválidos, ofertas revogadas e contas suspensas devem continuar bloqueados e sem evento.
- [ ] Conferir as permissões e o isolamento da escrita com duas contas. Se for necessária uma função SQL nova, versionar a migração, restringir a chamada ao runtime e revalidar o dono no banco. Nenhuma consulta pública deve aceitar a conta ou a publicação escolhida pelo cliente.
- [ ] Em banco isolado, demonstrar que dois redirecionamentos reais incrementam o painel da conta correta, inclusive sem publicação web, e que prévias, `HEAD` e tokens inválidos não incrementam. Testar links emitidos antes da mudança e falha simulada da telemetria.
- [ ] Verificar que a Pauta e os destinos já divulgados continuam funcionando. Conferir o primeiro clique real no painel ou identificar explicitamente um teste autorizado na conferência de produção. Atualizar este plano e o roadmap com resultados e revisão publicada.

O registro mede saídas para o marketplace. Conversões e comissões exigem conferência separada com a fonte do programa de afiliados. O painel global do GA4 tem escopo próprio na track 015.
