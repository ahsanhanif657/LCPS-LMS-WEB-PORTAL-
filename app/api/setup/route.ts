import {NextRequest,NextResponse} from 'next/server';
import {ensureDatabase} from '@/lib/database';
import {stmt,db,insert,AppError} from '@/lib/lms/service';
import {sameOrigin,jsonBody,secretMatches,clientKey} from '@/security/requests';
import {rateLimit} from '@/security/rate-limit';
import {hashPassword} from '@/security/passwords';
import {env} from '@/lib/platform';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const fail=(e:unknown)=>NextResponse.json({error:e instanceof AppError?e.message:'Setup could not complete. Check the database connection and try again.'},{status:e instanceof AppError?e.status:500});
export async function GET(){try{await ensureDatabase();const ready=!!await stmt("SELECT value FROM settings WHERE key='college_auth_v2'").first();return NextResponse.json({ready,storageConnected:!!env.BUCKET,setupKeyConfigured:!!process.env.ADMIN_SETUP_KEY&&process.env.ADMIN_SETUP_KEY.length>=24});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{
 sameOrigin(req);const b=await jsonBody(req,10000);await ensureDatabase();
 if(await stmt("SELECT value FROM settings WHERE key='college_auth_v2'").first())throw new AppError('Setup is already complete. Sign in instead.',409);
 await rateLimit('setup:'+await clientKey(),5);
 const key=process.env.ADMIN_SETUP_KEY;if(!key||key.length<24)throw new AppError('Set ADMIN_SETUP_KEY to a random secret of at least 24 characters in Vercel, then redeploy.',503);
 if(!secretMatches(b.setupKey,key))throw new AppError('Setup key is incorrect.',403);
 if(await stmt('SELECT id FROM users LIMIT 1').first())throw new AppError('Existing accounts detected. Setup will not overwrite them.',409);
 const name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase();
 if(name.length<2||name.length>100||!/^[-\w.]{3,60}$/.test(username))throw new AppError('Enter a valid name and a 3–60 character username.');
 let hash;try{hash=await hashPassword(b.password);}catch(e){throw new AppError((e as Error).message);}
 const id='lcps-administrator';
 await db().batch([insert('settings',{key:'college_auth_v2',value:'1'}),insert('users',{id,name,username,role:'ADMIN',active:1,demo:0,permissions:'{}',createdAt:new Date().toISOString()}),insert('credentials',{userId:id,hash}),insert('settings',{key:'owner',value:id}),insert('settings',{key:'college',value:'Lahore College of Pharmaceutical Sciences'})]);
 return NextResponse.json({ok:true});
 }catch(e){return fail(e);}}
