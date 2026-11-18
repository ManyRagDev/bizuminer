/** Text similarity proposes review only; it never establishes identity. */
export type EquivalenceSuggestion = {firstId:string;secondId:string;similarity:number};

const commonWords = new Set(["a","as","ao","com","da","das","de","do","dos","e","em","o","os","para","por","um","uma"]);

function titleTokens(title:string):Set<string> {
  return new Set(title.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR")
    .match(/[a-z0-9]+/g)?.filter(token=>(token.length>1 || /^[0-9]$/.test(token)) && !commonWords.has(token)) ?? []);
}

/** Bounded inverted index: pairs without a shared token cannot pass Jaccard. */
export function suggestEquivalentPairs(items:readonly {productId:string;title:string}[],threshold=0.8,limit=30):EquivalenceSuggestion[] {
  if(!Number.isFinite(threshold) || threshold<=0 || threshold>1 || !Number.isInteger(limit) || limit<1 || limit>100)
    throw new Error("equivalence_suggestion_config_invalid");
  const tokens=items.map(item=>titleTokens(item.title));
  const index=new Map<string,number[]>();
  for(let i=0;i<items.length;i++) for(const token of tokens[i]!) {
    const list=index.get(token) ?? [];list.push(i);index.set(token,list);
  }
  const counts=new Map<string,number>();
  for(const list of index.values()) for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {
    const left=list[i]!,right=list[j]!;
    if(items[left]!.productId===items[right]!.productId) continue;
    const key=`${left}:${right}`;counts.set(key,(counts.get(key) ?? 0)+1);
  }
  const found:EquivalenceSuggestion[]=[];
  for(const [key,intersection] of counts) {
    const [left,right]=key.split(":").map(Number) as [number,number];
    const union=tokens[left]!.size+tokens[right]!.size-intersection;
    if(union<3 || intersection/union<threshold) continue;
    found.push({firstId:items[left]!.productId,secondId:items[right]!.productId,similarity:intersection/union});
  }
  return found.sort((a,b)=>b.similarity-a.similarity || a.firstId.localeCompare(b.firstId) || a.secondId.localeCompare(b.secondId)).slice(0,limit);
}
