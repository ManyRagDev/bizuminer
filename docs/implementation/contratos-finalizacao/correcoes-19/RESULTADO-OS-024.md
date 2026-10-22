# Resultado OS-024 — storage, formatos e HTTP

18/10/2026. Tentativa #1 BUG-010/011 e reconciliação R-01; main 43700c59 + snapshot f4fb6cbd + OS-020…023. Alterações restritas à OS-024, com revisão4 autorizando jsqr 1.4.0 como dependência exclusiva de teste (lock fixado, sem scripts de instalação).

Contenção local usa fronteira de diretório, rejeita caminho absoluto, componente .. e symlinks; abertura de arquivo com O_NOFOLLOW. Preset Story preservado; Feed 1080x1080 e Banner 1200x628 possuem layouts próprios e seleção validada no renderer/serviço/action; metadados registram formato/template. Artefatos de outra conta continuam invisíveis/404; sem sessão retorna401, conta não autorizada403, sem metadados.

Verificações exit0: storage/render/http unitários, artifact-isolation-flow em PGlite e test:cockpit (7 cenários), typecheck web. Novo teste decodifica QR a partir dos pixels do PNG final de cada formato com jsqr e exige o link canônico exato. Integração demonstra download próprio com hash, recusa de leitura alheia antes do object store e geração de kit aprovado com Feed inferido/Banner explícito. Nova lib somente devDependency, API documentada em https://github.com/cozmo/jsQR. Instalação inicial bloqueada por DNS da sandbox; repetição autorizada no host exit0.

Logs /tmp/bizuminer-correcao-os19/os24-*.log; PNGs de inspeção no mesmo diretório. Não foi executado teste de câmera física ou sessão Supabase remota. Sem remoto operacional. Estado IMPLEMENTADO_PENDENTE_VERIFICACAO.

Fechamento vigente — CONCLUIDO no escopo técnico local desta OS, após contraprova seletiva dos mesmos IDs e parecer independente final CONFORME em [AUDITORIA-ENTREGA.md](AUDITORIA-ENTREGA.md), adendo final de 18/10/2026. Fonte examinada: manifesto f4e512c932a6c3de4f789afdd57aa5c6cc444bb3cd083811050a4546221da391. Os estados pendentes anteriores registram o histórico. Esta atualização encerra documentação; não altera fonte/teste nem declara implantação/homologação no ativo.
