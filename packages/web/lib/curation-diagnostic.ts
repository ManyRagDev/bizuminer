export type CurationDiagnostic={version:1;stage:'context'|'provider'|'commit'|'lease'|'configuration';kind:'credential'|'quota'|'rate_limit'|'transient'|'permanent'|'unknown';certainty:'uncertain'|'not_started';code:string;at:string;nextAt?:string};
const kinds=['credential','quota','rate_limit','transient','permanent'] as const;
/** Never copy message, cause, body, prompt or arbitrary provider codes. */
export function curationDiagnostic(error:unknown,stage:CurationDiagnostic['stage'],now=new Date()):CurationDiagnostic {
  const value=error && typeof error==='object' ? error as {kind?:unknown} : {};
  const kind=kinds.includes(value.kind as any) ? value.kind as typeof kinds[number] : 'unknown';
  return {version:1,stage,kind,certainty:stage==='configuration'?'not_started':'uncertain',code:stage==='lease'?'lease_expired':`attributes_${stage}_${kind}`,at:now.toISOString(),
    ...(stage==='configuration'?{nextAt:new Date(+now+300_000).toISOString()}: {})};
}
export function diagnosticLabel(value:unknown):string {
  const data=value && typeof value==='object' ? value as Partial<CurationDiagnostic> : {};
  const labels:Record<string,string>={credential:'A conexão do provedor precisa ser conferida',quota:'O provedor informou limite de uso',rate_limit:'O provedor limitou as chamadas',transient:'Ocorreu uma indisponibilidade temporária',permanent:'O provedor recusou a operação',unknown:'A causa detalhada não foi registrada'};
  return data.version===1 && ['context','provider','commit','lease','configuration'].includes(data.stage??'')
    ? data.stage==='lease' ? 'A execução perdeu seu prazo sem resultado confirmado' : labels[data.kind??'unknown']??labels.unknown
    : labels.unknown;
}
