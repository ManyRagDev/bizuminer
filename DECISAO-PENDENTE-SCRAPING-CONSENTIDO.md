# Decisão do dono — scraping automatizado com consentimento

**Registrada em 26/08/2026.**  
**Status:** decisão de produto confirmada; ainda não incorporada aos documentos vivos nem implementada.

> Esta nota foi criada isoladamente porque outra sessão está implementando com base na documentação atual. Nenhum documento existente foi alterado nesta decisão. Quando a sessão em andamento chegar a um ponto seguro, esta nota deve ser conciliada com o plano, o handoff, o roadmap e o documento mestre.

## Decisão

O scraping automatizado do Mercado Livre **deve permanecer disponível** no BizuMiner como recurso opcional por afiliado.

Ele não será habilitado silenciosamente. Cada afiliado deverá:

1. receber um aviso claro de que o uso de acesso automatizado pode causar bloqueio, suspensão ou exclusão da conta/programa de afiliados e possível impacto em comissões;
2. aceitar expressamente um termo de consentimento antes da primeira ativação;
3. escolher voluntariamente habilitar o recurso;
4. poder revogar o consentimento e desligar o scraping a qualquer momento.

O consentimento registra ciência e escolha do afiliado, mas **não transforma o scraping em uso autorizado pelo Mercado Livre, não garante conformidade e não elimina o risco jurídico ou operacional do BizuMiner**.

## Regras obrigatórias para implementação

- Default por afiliado: `disabled` até existir consentimento válido.
- Nada de checkbox pré-marcado, consentimento implícito ou consentimento global herdado.
- O aceite deve ser versionado e auditável, contendo no mínimo: `affiliate_id`, `terms_version`, `accepted_at`, `revoked_at`, `accepted_by_app_user_id`, texto/hash da versão aceita e evidência técnica mínima da ação.
- O aviso deve aparecer antes do aceite e novamente na tela de ativação/configuração.
- Revogar ou suspender o afiliado impede novos agendamentos imediatamente; execução já iniciada deve respeitar uma política explícita de cancelamento.
- Alterar materialmente o termo exige nova versão e novo aceite.
- Logs e relatórios não armazenam credenciais, tokens ou conteúdo sensível.
- A extensão e a captura manual continuam disponíveis como alternativa sem scraping automatizado.
- Cadência, limites, backoff e kill switch global continuam sob controle do BizuMiner; consentimento não autoriza operação ilimitada.
- O dono precisa poder desligar globalmente o canal em caso de bloqueios, mudança dos termos ou incidente.

## Mudança necessária no plano atual

A E0 do plano atual não deve remover definitivamente o scraping. Ao incorporar esta decisão, ela deve passar de **“desligar o acesso automatizado”** para:

> **Conter e tornar opt-in:** scraping desligado por default para cada afiliado, habilitado somente depois de aviso + consentimento versionado, com revogação individual e kill switch global.

Todo o restante do plano — identidade por afiliado, isolamento de tenant, tokens por dispositivo, captura manual, extensão catalog-first, idempotência e comissão correta — permanece válido.

## Instrução para a sessão implementadora

Antes de concluir ou consolidar E0, leia esta nota e trate a decisão acima como a orientação mais recente do dono. Não marque a mudança como implementada apenas porque esta nota existe. Registre divergências com o plano atual e só altere os documentos vivos quando não houver risco de conflito com outra sessão.
