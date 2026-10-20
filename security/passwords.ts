const enc=new TextEncoder();
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
export const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export async function hashPassword(password:string,salt=token()){
 if(typeof password!=='string'||password.length<10||password.length>128)throw new Error('Password must contain 10–128 characters.');
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return 'pbkdf2$100000$'+salt+'$'+hex(bits);
}
export async function verifyPassword(password:string,stored:string){try{const value=await hashPassword(password,stored.split('$')[2]);if(value.length!==stored.length)return false;let diff=0;for(let i=0;i<value.length;i++)diff|=value.charCodeAt(i)^stored.charCodeAt(i);return diff===0;}catch{return false;}}
