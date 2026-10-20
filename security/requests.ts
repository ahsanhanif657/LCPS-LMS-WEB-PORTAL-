import {headers} from 'next/headers';
import {createHash,timingSafeEqual} from 'node:crypto';
import {AppError} from './errors';
export function sameOrigin(req:Request){
 const origin=req.headers.get('origin');
 const requestUrl=new URL(req.url);
 // Next may reconstruct req.url with an internal hostname behind its server.
 // Compare the browser origin to the actual incoming Host, never forwarded-host.
 const host=req.headers.get('host')||requestUrl.host;
 const protocol=process.env.VERCEL?'https:':requestUrl.protocol;
 if(!origin||origin!==`${protocol}//${host}`)throw new AppError('Request origin rejected.',403);
 if(req.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Cross-site request rejected.',403);
}
export async function jsonBody(req:Request,limit=100000){
 const length=Number(req.headers.get('content-length')||0);if(length>limit)throw new AppError('Request is too large.',413);
 if(!req.headers.get('content-type')?.includes('application/json'))throw new AppError('JSON request required.',415);
 const reader=req.body?.getReader();if(!reader)throw new AppError('Request body is required.');const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError('Request is too large.',413);}chunks.push(value);}
 try{const text=Buffer.concat(chunks).toString('utf8'),body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=='object')throw new Error();return body as Record<string,any>;}catch{throw new AppError('Invalid JSON request.');}
}
export async function clientKey(){const h=await headers();const ip=process.env.VERCEL?h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||'unknown-vercel-client':'local';return createHash('sha256').update(ip).digest('hex');}
export function secretMatches(a:unknown,b:string){if(typeof a!=='string')return false;const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);}
export const cookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'});
