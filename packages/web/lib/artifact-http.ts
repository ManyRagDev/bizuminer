/** C-09: distinguish authentication/authorization; object ownership stays opaque (404). */
export function artifactAccessFailure(kind:"no_session"|"forbidden"):Response {
  return Response.json({error:kind==="no_session"?"unauthenticated":"forbidden"},{status:kind==="no_session"?401:403,headers:{"Cache-Control":"private, no-store"}});
}
