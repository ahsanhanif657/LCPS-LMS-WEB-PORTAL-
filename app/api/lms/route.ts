import {sameOrigin,jsonBody} from '@/security/requests';
import {NextRequest,NextResponse} from 'next/server';
import {validateGrading} from '@/lib/lms/grading';
import {context,payload,action,AppError,stmt} from '@/lib/lms/service';
export const dynamic='force-dynamic';
export const runtime='nodejs';
function fail(e:unknown){if(e instanceof AppError)return NextResponse.json({error:e.message},{status:e.status});console.error('LMS operation failed',e instanceof Error?e.message:'unknown');const message=e instanceof Error&&/Timetable conflict|Keep at least one active administrator|Teacher reassignment creates|Marks must be within/.test(e.message)?e.message:e instanceof Error&&/UNIQUE constraint/.test(e.message)?'A record with these details already exists.':e instanceof Error&&/FOREIGN KEY/.test(e.message)?'This record is still used by academic data. Archive it instead.':'The operation could not be completed. Please try again.';return NextResponse.json({error:message},{status:400});}
export async function GET(){try{const c=await context();const college=await stmt('SELECT value FROM settings WHERE key=?',['college']).first<{value:string}>();const grading=await stmt('SELECT value FROM settings WHERE key=?',['grading']).first<{value:string}>();return NextResponse.json({...payload(c),college:college?.value,grading:grading?validateGrading(JSON.parse(grading.value)):null},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return fail(e);}}
export async function POST(request:NextRequest){try{sameOrigin(request);const body=await jsonBody(request);const c=await context();const result=await action(c,body);return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
