import {sameOrigin,jsonBody} from '@/security/requests';
import {NextRequest,NextResponse} from 'next/server';
import {context,AppError} from '@/lib/lms/service';
import {createBackup,listBackups,restoreBackup} from '@/lib/lms/backups';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const fail=(e:unknown)=>NextResponse.json({error:e instanceof AppError?e.message:'Backup operation failed; database changes were not applied.'},{status:e instanceof AppError?e.status:500});
export async function GET(){try{return NextResponse.json({backups:await listBackups(await context(false))},{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){try{sameOrigin(req);const body=await jsonBody(req,10000),c=await context(false);if(body.action==='create')return NextResponse.json({id:await createBackup(c)});if(body.action==='restore')return NextResponse.json(await restoreBackup(c,body.id,body.password,body.confirmation));throw new AppError('Unknown backup action.');}catch(e){return fail(e);}}
