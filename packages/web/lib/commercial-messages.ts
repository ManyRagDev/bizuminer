const messages:Record<string,string>={
 forbidden:'A conta não está autorizada para esta operação.',owner_required:'Somente o responsável pela conta pode criar campanhas.',
 not_found:'O registro não está disponível nesta conta.',conflict:'O registro mudou. Atualize a página antes de continuar.',
 idempotency_conflict:'Este identificador já foi usado com dados diferentes.',invalid_input:'Confira os campos obrigatórios.',
 offer_unavailable:'A oferta não está aprovada ou não possui preço válido e recente.',link_unavailable:'A oferta precisa de um link público ativo.',
 LINK_INVALID:'O link da oferta não está disponível ou não está monetizado.',CURRENCY_UNKNOWN:'A moeda da oferta precisa ser confirmada.',
 FACTS_CHANGED:'O preço ou as condições da oferta mudaram. Crie uma nova revisão.',EVIDENCE_STALE:'A evidência da oferta venceu. Atualize a revisão.',
 CLAIM_NOT_CURRENT:'Uma alegação perdeu o suporte dos dados atuais.',CONTENT_DIGEST_MISMATCH:'A revisão não confere com o conteúdo aprovado.',
 MISSING_AFFILIATE_DISCLOSURE:'Inclua a identificação do link de afiliado.',UNSUPPORTED_URGENCY_CLAIM:'Remova a alegação de urgência sem comprovação.',
 UNSUPPORTED_PRICE_CLAIM:'O texto contém uma alegação de preço sem suporte.',MISSING_PRICE_SOURCE:'A fonte do preço precisa ser confirmada.',
 MISSING_RIGHTS_FOR_ASSET:'O uso comercial da imagem ainda não foi autorizado.',
 approval_required:'A revisão precisa de aprovação humana.',validation_required:'Valide a revisão antes de aprovar.',
 publication_not_ready:'O material ainda não está pronto para esta etapa.',invalid_publication_time:'A data da postagem deve estar dentro da validade da aprovação.',
 currency_required:'Informe a moeda.',invalid_amount:'Informe um valor válido, com até duas casas decimais.',invalid_date:'Informe uma data válida.',
 invalid_period:'Confira o início e o fim do período.',invalid_duration:'Informe uma duração válida em segundos.',source_required:'Informe a fonte e o identificador do lançamento.',
 invalid_predecessor:'O lançamento anterior deve pertencer à mesma venda, moeda e conta.',cost_measurement_required:'Informe um valor conhecido ou uma duração medida.',
};
export function commercialIssueMessage(code:string):string {return messages[code]??'O material precisa ser revisado antes de continuar.';}
export function commercialActionError(error:unknown):string {
 const code=error instanceof Error?error.message.split(':')[0]!:'';
 if(code==='kit_invalid'||code==='evidence_stale') return 'A oferta ou a revisão mudou. Revise e valide novamente antes de continuar.';
 return messages[code]??'Não foi possível concluir a operação. Atualize a página e tente novamente.';
}
