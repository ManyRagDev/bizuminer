import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import { configurePautaSlots, readPautaSlots } from "../../../../lib/pauta-slots-db.ts";

export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};

export async function GET(request:NextRequest) {
  const check=await checkAffiliateUser(request);
  if(check.kind!=="ok") return Response.json({ok:false,error:"forbidden"},{status:403,headers:noStore});
  const raw=request.nextUrl.searchParams.get("channel");
  if(raw!=="whatsapp" && raw!=="stories") return sinkJson(check.sink,{ok:false,error:"invalid_channel"},{status:400,headers:noStore});
  try {return sinkJson(check.sink,{ok:true,...await readPautaSlots(check.context,raw)},{headers:noStore});}
  catch {return sinkJson(check.sink,{ok:false,error:"slots_unavailable"},{status:503,headers:noStore});}
}

export async function PUT(request:NextRequest) {
  const check=await checkAffiliateUser(request);
  if(check.kind!=="ok") return Response.json({ok:false,error:"forbidden"},{status:403,headers:noStore});
  const body=await request.json().catch(()=>null);
  if(!body || (body.channel!=="whatsapp" && body.channel!=="stories"))
    return sinkJson(check.sink,{ok:false,error:"invalid_channel"},{status:400,headers:noStore});
  try {
    const result=await configurePautaSlots(check.context,body.channel,body);
    const status=result==='ok' ? 200 : result==='forbidden' ? 403 : result==='conflict' ? 409 : 400;
    return sinkJson(check.sink,{ok:result==='ok',error:result==='ok' ? null : result},{status,headers:noStore});
  } catch {return sinkJson(check.sink,{ok:false,error:"slots_unavailable"},{status:503,headers:noStore});}
}
