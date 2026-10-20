import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {ensureDatabase} from '@/lib/database';
import {stmt,db,context,auditStmt,AppError} from '@/lib/lms/service';
import {token,digest,hashPassword,verifyPassword} from '@/security/passwords';
import {sameOrigin,jsonBody,clientKey,cookieOptions} from '@/security/requests';
import {rateLimit} from '@/security/rate-limit';
import {Row} from '@/lib/lms/types';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(req:NextRequest){try{
 sameOrigin(req);const body=await jsonBody(req,10000);await ensureDatabase();
 if(!await stmt("SELECT value FROM settings WHERE key='college_auth_v2'").first())throw new AppError('First administrator setup is required. Open /setup.',428);
 const jar=await cookies(),clear=()=>jar.set('lcps_session','',{...cookieOptions(),maxAge:0});
 if(body.action==='logout'){const value=jar.get('lcps_session')?.value;if(value)await stmt('DELETE FROM loginSessions WHERE tokenHash=?',[await digest(value)]).run();clear();return NextResponse.json({ok:true});}
 await rateLimit('auth-ip:'+await clientKey(),100);
 if(body.action==='change'){
  const c=await context(false);await rateLimit('password-change:'+c.user.id,10);const cred=await stmt('SELECT hash FROM credentials WHERE userId=?',[c.user.id]).first<Row>();
  if(!cred||!await verifyPassword(body.currentPassword,cred.hash))throw new AppError('Current password is incorrect.');
  let hash;try{hash=await hashPassword(body.newPassword);}catch(e){throw new AppError((e as Error).message);}
  await db().batch([stmt('UPDATE credentials SET hash=? WHERE userId=?',[hash,c.user.id]),stmt('DELETE FROM loginSessions WHERE userId=?',[c.user.id]),stmt('DELETE FROM loginLimits WHERE key=?',['password-change:'+c.user.id]),auditStmt(c.user,'password-change','users',c.user.id)]);
  clear();return NextResponse.json({ok:true});
 }
 if(body.action!=='login')throw new AppError('Unknown authentication action.');
 const username=typeof body.username==='string'?body.username.trim().toLowerCase().slice(0,100):'';
 const key='auth-user:'+await digest(username);await rateLimit(key,10);
 const user=await stmt('SELECT users.*,credentials.hash FROM users JOIN credentials ON credentials.userId=users.id WHERE lower(username)=lower(?) AND active=1 AND demo=0',[username]).first<Row>();
 const dummy='pbkdf2$100000$'+'0'.repeat(64)+'$'+'0'.repeat(64);
 const valid=await verifyPassword(body.password,user?.hash||dummy);
 if(!user||!valid)throw new AppError('Invalid username or password.',401);
 const value=token(),old=jar.get('lcps_session')?.value;
 await db().batch([stmt('DELETE FROM loginSessions WHERE expires<?',[Date.now()]),stmt('DELETE FROM loginLimits WHERE expires<? OR key=?',[Date.now(),key]),...(old?[stmt('DELETE FROM loginSessions WHERE tokenHash=?',[await digest(old)])]:[]),stmt('INSERT INTO loginSessions(tokenHash,userId,expires) VALUES(?,?,?)',[await digest(value),user.id,Date.now()+28800000])]);
 jar.set('lcps_session',value,{...cookieOptions(),maxAge:28800});return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof AppError?e.message:'Unable to complete sign-in. Check server configuration and try again.'},{status:e instanceof AppError?e.status:400});}}
