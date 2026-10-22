# OS-17 — Armazenamento Privado de Artefatos e Validação de Kits

```yaml
id: OS-17
estado: PREPARADA
origem: EP-04 / EP-06 / OPEN-08 / OPEN-09 / CAPACIDADES-PENDENTES linha 12
baseline: "main 43700c59 + OS-16 concluída"
objetivo: "Implementar o pipeline completo de validação, renderização e armazenamento de kits promocionais e artefatos de marketing em bucket privado (Supabase Storage / driver local de desenvolvimento), assegurando verificação de tipo via magic numbers, checagem de direitos autorais de imagens, contraste, disclosure de afiliados e download seguro autenticado."
nao_objetivos:
  - "Não permitir upload de arquivos executáveis ou que excedam 10 MiB."
  - "Não expor URLs públicas permanentes sem controle de acesso ou download de tokens."
  - "Não utilizar imagens ou marcas de terceiros sem declaração de origem/licença."
dependencias:
  - "OS-16 concluída"
escopo_leitura:
  - "packages/web/lib/kit-validator.ts"
  - "packages/web/lib/kit-renderer.ts"
  - "packages/web/lib/kit-artifact-db.ts"
  - "packages/web/lib/marketing-storage-core.ts"
  - "packages/web/app/api/admin/artifacts/upload/route.ts"
  - "packages/web/app/api/admin/artifacts/[id]/route.ts"
  - "tools/editorial-tests/cockpit-commercial-assisted.test.ts"
escopo_escrita:
  - "packages/web/lib/marketing-storage-core.ts" # Atualizar: implementar driver de storage com fallback para filesystem local em dev/testes e Supabase Storage em produção
  - "packages/web/lib/kit-validator.ts" # Atualizar: checagem estrita de proveniência de imagem, licença declarada e disclosure obrigatório
  - "packages/web/test/storage-and-kit-rendering.test.mjs" # Novo teste com upload de imagens sintéticas, validação de MIME e geração de artefatos
arquivos_protegidos:
  - "packages/persistence/supabase/rollouts/v2/"
  - "packages/web/app/globals.css"
contratos:
  - "C-04 / C-05 (Campanhas, kits promocionais e artefatos)"
  - "CF-02 (Preservação de dados e isolamento de Storage)"
autorizacoes_remotas: []
aceites:
  - id: AC-17.1
    dado: "Um upload de imagem para artefato de marketing via POST /api/admin/artifacts/upload"
    quando: "O arquivo for submetido por usuário autenticado em sua conta"
    entao: "O sistema valida os magic numbers (JPEG, PNG, WebP), rejeita arquivos maiores que 10 MiB, calcula o SHA256 do conteúdo e armazena com isolamento de tenant."
  - id: AC-17.2
    dado: "Uma tentativa de download de um artefato privado da conta A por uma sessão da conta B ou anônima"
    quando: "A requisição GET /api/admin/artifacts/[id] for executada"
    entao: "O sistema nega o acesso com código HTTP 403 (ou 401 para anônimos) sem vazar os metadados do arquivo."
  - id: AC-17.3
    dado: "Um kit promocional montado para Instagram Stories (1080x1920) ou Feed"
    quando: "O método validateKitArtifacts for executado"
    entao: "Ele exige que todas as imagens possuam licença/direitos declarados (house_created, merchant_provided, authorized_stock) e que o aviso de divulgação/afiliado esteja presente no layout."
  - id: AC-17.4
    dado: "A renderização de um kit aprovado"
    quando: "O kitRenderer for executado para exportação"
    entao: "Gera o layout pronto nos formatos padrão (Story, Banner, Feed) com tipografia, contraste e QR code/short link corretos."
verificacoes:
  - comando_ou_cenario: "node --test packages/web/test/storage-and-kit-rendering.test.mjs"
    resultado_esperado: "Testes de storage, verificação de magic numbers e validação de kit passam."
  - comando_ou_cenario: "npm run test:cockpit --prefix tools/editorial-tests"
    resultado_esperado: "Suíte de cockpit assistido e validação de kits passa sem regressão."
risco_e_rollback: "Risco baixo. Se houver falha de storage remoto, o driver local atua como fallback determinístico sem bloquear a esteira."
```
