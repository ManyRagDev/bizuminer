# Checklist — Chrome Web Store (E8)

Registro na loja é **decisão e ação do dono** (externa); este checklist prepara o que o código já garante.

## Antes de submeter

- [ ] `npm run build` limpo (sem erros) em `packages/extension`.
- [ ] `npm run verify:manifest` — 8/8 PASS (permissões mínimas, sem host permanente sobre o ML, CSP sem código remoto, sem segredo no manifesto).
- [ ] `npm test` — 13/13 (card-extractor, outbox, contracts).
- [ ] `npm run package` — release `release/bizuminer-extension-v<versão>/` com `RELEASE.txt` (hashes SHA-256).
- [ ] Teste em Chrome real como "unpacked" (`chrome://extensions` → Modo desenvolvedor → Carregar sem compactação → apontar para `dist/` ou a pasta `release/`).

## Itens da ficha da loja

- [ ] Nome: "BizuMiner — captura de ofertas".
- [ ] Descrição: texto que não promete desconto verificado (a extensão adiciona ofertas ao catálogo, não classifica preço).
- [ ] Categoria: Produtividade / Compras.
- [ ] Política de privacidade: URL apontando para `PRIVACY.md` (hospedar em `bizuminer.com.br`).
- [ ] Screenshots: popup + botão no card do ML (a capturar em Chrome real — externo).
- [ ] Justificativa de permissões: `activeTab` (só a aba clicada), `scripting` (injetar botão), `storage` (token local), `alarms` (retry).

## Bloqueios externos (não dependem de código)

- [ ] Conta de desenvolvedor Chrome Web Store ($5 one-time) — ação do dono.
- [ ] Aplicação das migrations E1–E4 no banco (autorização do dono).
- [ ] Configurar `EXTENSION_ALLOWED_ORIGINS` com o `chrome-extension://<id>` publicado após o registro.
- [ ] `EXTENSION_CAPTURE_ENABLED=true` após o piloto (E4→E5 gate).

## Não faz parte do E8

- Compra/comissão real via link — degrau separado de validação externa.
