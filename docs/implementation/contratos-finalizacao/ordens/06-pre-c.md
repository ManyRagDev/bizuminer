# OS-06 — Fluxos reais usados passam antes do corte C

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-05 CONCLUIDA; B exata, controle falso, acesso reservado à candidata e backup válidos.
Execução: sequencial

## Objetivo e aceite

- AC-1: login Google do proprietário e conta/membership legítimos comprovados na candidata real.
- AC-2: catálogo, detalhe, links antigos/monetização, curadoria e caminhos usados de captura manual/navegador/extensão e monitoramento passam na conexão/runtime efetivos; V2 continua negada.
- AC-3: todos os writers essenciais compatíveis; antigos parados; backup ainda recupera o estado necessário antes de C. Falta de smoke essencial impede C.

## Leitura e contrato

- CF-01/02/03, resultados OS-04/05; T18/S-DB/S-LINK em aceite05.
- Auth callback/google-button, account-context/tenant-db/public-offer-db e inventário de writers usados.
- `packages/web/lib/commercial-rollout.ts`, `workflow-readiness.ts`.

## Escrita autorizada

Somente resultado/evidência sanitizados. Capturas de tela redigidas, logs e eventual atualização privada do backup em `/tmp/bizuminer-finalizacao/os-06/`; nenhuma edição de serviço, handler, policy ou OAuth.

Resultado: `docs/implementation/contratos-finalizacao/resultados/06-pre-c.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/06-pre-c.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Pelo acesso reservado comprovado na OS-02, observar Google login/callback e sessão do proprietário, resolução de conta/autor, home/detalhe, código legado de4 e novo de12 caracteres quando existente, destino monetizado e comportamento administrativo usado. Não gravar cookies/codes/credenciais.

Pela conexão real sem bypass, conferir acesso legítimo e funções públicas mínimas; backend deve negar V2 enquanto controle falso. Exercitar apenas ações reais autorizadas do proprietário; explicar cada gravação deliberada e atualizar proteção/baseline com comparação rastreável. Se esses smokes mudarem dados necessários à recuperação, alinhar backup/restore seletivo antes de C sem substituir referências para ocultar divergência.

Dispositivo ou writer não usado pode ficar desabilitado com limite explícito; essencial sem prova bloqueia. Não executar `monitor-prices --execute` ou dispatch como consulta. O dono deve completar o trecho Google se houver interação que o agente não pode legitimamente realizar; manter resultado NAO_VERIFICADO até isso ocorrer.

## Operações externas

Leituras e smokes legítimos no deployment/banco CF-01, dentro da manutenção. Escritas somente de ações existentes realmente necessárias e controladas da operação própria, registradas antes/depois; nenhuma venda, clique, comissão, conta de teste, convite, compra ou envio fabricados. Sem habilitar E3/canal/piloto ou mudar Auth. Se acesso reservado for inviável, registrar bloqueio antes de C; não abrir todos os endereços antigos.
