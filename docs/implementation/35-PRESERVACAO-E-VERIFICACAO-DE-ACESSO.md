# 35 — Preservação e verificação de acesso

16/10/2026, America/Sao_Paulo. Complemento operacional do parecer33; nenhuma migration foi aplicada. O objetivo é demonstrar preservação dos registros e acesso legítimo entre etapas, sem presumir que resultado administrativo comprova funcionamento do aplicativo.

## Verificações já realizadas

- Registradas contagens e assinaturas do conteúdo das 28 tabelas originais de `garimpa`, calculadas dentro de um único SELECT. A consulta guarda a projeção das colunas originais: adicionar novas colunas em B não simula corrupção dos valores antigos. Nenhum conteúdo de usuário ou segredo foi retornado: apenas contagens e digests agregados. [Evidência preliminar](evidencias/execucao-35-preservacao-preliminar.json).
- Confirmado acesso pelo DATABASE_URL existente do aplicativo, em transação somente leitura: role `garimpa_app`, sem SUPERUSER/BYPASSRLS, lê 1.657 produtos, 9.261 observações, 1.495 publicações e 172 links. [Resultado runtime](evidencias/execucao-35-runtime-readonly.json) e [script](evidencias/execucao-35-runtime-readonly.cjs). Credenciais não foram impressas.
- Os hashes A/B/C e a decisão condicional33 permanecem inalterados. As provas acima são anteriores à aplicação; não demonstram resultado pós-migration, login Google ou requests servidos pelo deployment.

## Conferência por etapa da implantação direta

1. Pausar/drenar somente os processos BizuMiner. Criar backup recuperável e comprovar restauração seletiva, conforme33. Repetir então o snapshot das 28 tabelas: o registro atual é preliminar porque automações e acessos ainda podem produzir eventos. Assinatura não substitui backup.
2. Aplicar A inteira em transação. Conferir dados originais, policies preservadas e controle falso; repetir leitura pelo runtime. Se divergir, parar antes de B e investigar.
3. Aplicar B inteira. Comparar as mesmas colunas antigas: produtos, preços, títulos, URLs, referências e históricos devem permanecer preservados, salvo mudança expressamente prevista e revisada. Conferir permissões, bucket próprio, controle falso e legado. Repetir consultas pelo runtime e verificar URLs públicas representativas. Parar se o comportamento divergir.
4. Publicar o código compatível e atualizar/desativar escritores antigos. Conferir o deployment e os fluxos reais usados: login Google do proprietário, catálogo, links, curadoria e captura. Não ativar C enquanto esses consumidores não estiverem prontos.
5. Aplicar C inteira e repetir a integridade administrativa, mais acesso pelo runtime e pelos caminhos reais do aplicativo. A visibilidade privada deve respeitar conta/pessoa: exigir acesso legítimo, não acesso irrestrito de todo usuário a todas as linhas. Registrar escritas deliberadas dos testes para distingui-las de perda ou alteração inesperada. Reabrir somente o que passou.

Comparações preservam contagens e digests; divergência deve ser explicada, não ocultada atualizando a referência automaticamente. Falha de hash isolada não prova corrupção enquanto escritores estiverem ativos. FKs/integridade e fingerprints dos demais aplicativos seguem o parecer33.

## Recuperação

Há caminhos de recuperação, mas cada fase tem limites claros:

- Antes do commit de uma unidade, sua falha deve reverter a transação. Em desconexão com resultado incerto, conferir histórico/catálogo antes de repetir.
- A/B podem permanecer com o controle comercial falso enquanto a compatibilidade do código é corrigida; não há obrigação de ativar C na mesma tentativa.
- Depois de C, falha de acesso exige manter manutenção e corrigir o contexto/permissão específica ou publicar código compatível. Desligar o controle comercial não desfaz as novas regras de acesso. Não restaurar permissões irrestritas para fazer a tela aparecer.
- Se for preciso recuperar registros, usar o backup seletivo verificado, preservando os outros aplicativos e contabilizando alterações posteriores. Não restaurar globalmente o Supabase compartilhado.

Não se trata de uma alteração necessariamente irreversível. A execução pode ser interrompida entre fases e o acesso pode ser corrigido sem apagar o catálogo. Continuam pendentes de execução: backup/restauração comprovados, manutenção, publicação compatível, aplicação e testes posteriores. Não foi anunciada garantia de erro zero nem aprovação de resultados que ainda não ocorreram.
