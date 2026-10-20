import {database} from '@/lib/database';
import {AppError} from './errors';
export async function rateLimit(key:string,maximum:number,windowMs=900000){
 const now=Date.now();await database.prepare('INSERT INTO loginLimits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END').bind(key,now+windowMs,now,now).run();
 const value=await database.prepare('SELECT count FROM loginLimits WHERE key=?').bind(key).first<{count:number}>();if(value!.count>maximum)throw new AppError('Too many attempts. Try again in 15 minutes.',429);
}
