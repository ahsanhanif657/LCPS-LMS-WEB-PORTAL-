export const maxUploadBytes=4*1024*1024;
export const documentAccept='image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.zip';
export const timetableAccept='image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf';
const imageAccept='image/png,image/jpeg,image/webp';
const officeTypes:Record<string,string>={
 '.doc':'application/msword',
 '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 '.xls':'application/vnd.ms-excel',
 '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 '.ppt':'application/vnd.ms-powerpoint',
 '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 '.csv':'text/csv',
 '.zip':'application/zip'
};
const isZip=(bytes:Uint8Array)=>bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&[[0x03,0x04],[0x05,0x06],[0x07,0x08]].some(([a,b])=>bytes[2]===a&&bytes[3]===b);
const isOle=(bytes:Uint8Array)=>bytes.length>=8&&[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((b,i)=>bytes[i]===b);
const validCsv=(bytes:Uint8Array)=>{
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return !text.includes('\0')&&!/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
 }catch{return false;}
};
export function inspectUpload(fileName:string,bytes:Uint8Array,purpose:'avatar'|'academic'|'timetable'){
 const ext=fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]||'';
 const png=ext==='.png'&&bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 const jpg=['.jpg','.jpeg'].includes(ext)&&bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=ext==='.webp'&&bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 const pdf=ext==='.pdf'&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 let mime=png?'image/png':jpg?'image/jpeg':webp?'image/webp':pdf?'application/pdf':null;
 if(purpose==='academic'&&ext==='.csv'&&validCsv(bytes))mime='text/csv';
 if(purpose==='academic'&&['.doc','.xls','.ppt'].includes(ext)&&isOle(bytes))mime=officeTypes[ext];
 if(purpose==='academic'&&['.docx','.xlsx','.pptx','.zip'].includes(ext)&&isZip(bytes))mime=officeTypes[ext];
 if(purpose==='timetable'&&mime&&!['image/png','image/jpeg','application/pdf'].includes(mime))return null;
 if(!mime||(purpose==='avatar'&&!mime.startsWith('image/')))return null;
 return mime;
}
export function inlineFileAllowed(mime:string){return mime==='application/pdf'||mime==='text/csv'||['image/png','image/jpeg','image/webp'].includes(mime);}
export const fileAcceptFor=(purpose:string)=>purpose==='avatar'?imageAccept:documentAccept;
