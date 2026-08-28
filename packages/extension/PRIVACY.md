# Política de Privacidade — Extensão BizuMiner

**Última atualização: 26/08/2026.**

A extensão BizuMiner ("a extensão") ajuda você, afiliado do BizuMiner, a adicionar ofertas do Mercado Livre ao seu catálogo. Esta política explica o que a extensão acessa e o que envia.

## O que a extensão lê

- Somente após você **clicar no ícone e ativar a página**, a extensão decora os cards do catálogo do Mercado Livre com um botão "Adicionar ao BizuMiner".
- Quando você **clica no botão de um card específico**, a extensão lê **apenas aquele card**: título, preço, URL do produto e imagem — os dados públicos que a página já exibiu.

## O que a extensão NÃO faz

- Não varre páginas sozinha, não lê todos os cards de uma vez e não abre abas em segundo plano.
- Não acessa o Mercado Livre por conta própria fora da página que você abriu.
- Não lê nem envia credenciais do Mercado Livre, senhas ou qualquer dado de outras páginas.

## O que é enviado e para onde

- Quando você clica no botão, a extensão envia o produto para a API do BizuMiner (`www.bizuminer.com.br`) usando um token exclusivo deste dispositivo (navegador).
- O token é guardado apenas no armazenamento local deste navegador (`chrome.storage.local`); nunca é sincronizado.
- A extensão **não** envia dados a terceiros nem ao Supabase diretamente — o BizuMiner (servidor) é o único destino.

## Permissões

- `activeTab`: só a aba atual, após o seu clique.
- `scripting`: injeta o botão nos cards, sob seu comando.
- `storage`: guarda o token e a fila de envio localmente.
- `alarms`: tenta reenviar capturas pendentes quando a rede volta.

## Como revogar o acesso

No painel do BizuMiner, você pode revogar um dispositivo. A revogação interrompe novas capturas imediatamente.

## Contato

`emanuel.adm10@gmail.com`
