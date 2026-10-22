import { collectBrowserOffers } from "../../extension/src/content/page-extractor.ts";

/** A copy-only fallback for the SAME batch import used by the extension. */
export function browserCaptureBookmarklet(): string {
  const source =
    "(function(){try{var p=(" +
    collectBrowserOffers.toString() +
    ")();" +
    "var bytes=new TextEncoder().encode(JSON.stringify(p)),s='';for(var i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);" +
    "var b=btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');var h=2166136261;" +
    "for(var j=0;j<b.length;j++){h^=b.charCodeAt(j);h=Math.imul(h,16777619)>>>0;}var block='BM2.'+b+'.'+h.toString(16);" +
    "function fallback(){prompt('Copie todo este conteúdo. Volte ao painel e cole no campo de ofertas copiadas:',block);}" +
    "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(block).then(function(){alert(p.products.length+' ofertas copiadas. Volte ao painel, cole no campo de ofertas copiadas e clique em Importar ofertas e iniciar triagem.');},fallback);}else{fallback();}" +
    "}catch(e){alert('BizuMiner: '+e.message);}})();";
  // Browsers strip literal line breaks from bookmark URLs. Encode the whole
  // source so newlines (including those ending // comments) survive pasting.
  return "javascript:" + encodeURIComponent(source);
}
