export type ExportFormat='pdf'|'word'|'zip';

function escapeHtml(value:string){
 return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}

export function reportHtml(title:string,headers:string[],rows:string[][]){
 const head=headers.map(value=>`<th>${escapeHtml(value)}</th>`).join('');
 const body=rows.map(row=>`<tr>${headers.map((_,index)=>`<td>${escapeHtml(row[index]??'')}</td>`).join('')}</tr>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#23352f;margin:32px}h1{font-size:22px}p{color:#66736c}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #d8dfda;padding:8px;text-align:left;vertical-align:top}th{background:#eef3ed}tr{break-inside:avoid}@media print{body{margin:16mm}h1{font-size:18pt}table{font-size:9pt}}</style></head><body><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}. This is a fixed report, not a fillable form.</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function reportCsv(headers:string[],rows:string[][]){
 const quote=(value:string)=>{
  const safe=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 return '\ufeff'+[headers.map(quote).join(','),...rows.map(row=>headers.map((_,index)=>quote(row[index]??'')).join(','))].join('\r\n');
}

function crc32(data:Uint8Array){
 let crc=0xffffffff;
 for(const byte of data){
  crc^=byte;
  for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}

export function createZip(files:{name:string;contents:string}[]){
 const encoder=new TextEncoder();
 const locals:Array<{bytes:Uint8Array;offset:number}>=[];
 let size=0;
 for(const file of files){
  const name=encoder.encode(file.name),data=encoder.encode(file.contents);
  const bytes=new Uint8Array(30+name.length+data.length),view=new DataView(bytes.buffer);
  view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x0800,true);
  view.setUint16(8,0,true);view.setUint16(10,0,true);view.setUint16(12,0,true);
  view.setUint32(14,crc32(data),true);view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);
  view.setUint16(26,name.length,true);view.setUint16(28,0,true);bytes.set(name,30);bytes.set(data,30+name.length);
  locals.push({bytes,offset:size});size+=bytes.length;
 }
 const centralStart=size,central:Array<Uint8Array>=[];
 for(const [index,file] of files.entries()){
  const name=encoder.encode(file.name),data=encoder.encode(file.contents),local=locals[index],view=new DataView(new ArrayBuffer(46+name.length)),bytes=new Uint8Array(view.buffer);
  view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);
  view.setUint16(8,0x0800,true);view.setUint16(10,0,true);view.setUint16(12,0,true);view.setUint16(14,0,true);
  view.setUint32(16,crc32(data),true);view.setUint32(20,data.length,true);view.setUint32(24,data.length,true);
  view.setUint16(28,name.length,true);view.setUint16(30,0,true);view.setUint16(32,0,true);view.setUint16(34,0,true);
  view.setUint16(36,0,true);view.setUint32(38,0,true);view.setUint32(42,local.offset,true);bytes.set(name,46);
  central.push(bytes);size+=bytes.length;
 }
 const centralSize=size-centralStart,buffer=new ArrayBuffer(size+22),out=new Uint8Array(buffer);
 let offset=0;
 for(const local of locals){out.set(local.bytes,offset);offset+=local.bytes.length;}
 for(const directory of central){out.set(directory,offset);offset+=directory.length;}
 const end=new DataView(buffer,offset,22);
 end.setUint32(0,0x06054b50,true);end.setUint16(4,0,true);end.setUint16(6,0,true);
 end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);
 end.setUint32(12,centralSize,true);end.setUint32(16,centralStart,true);
 end.setUint16(20,0,true);
 return buffer;
}

export function showReport(title:string,headers:string[],rows:string[][],print=false){
 const popup=window.open('','_blank');
 if(!popup)throw new Error('Your browser blocked the report window. Allow pop-ups and try again.');
 popup.document.open();popup.document.write(reportHtml(title,headers,rows));popup.document.close();
 if(print)setTimeout(()=>{popup.focus();popup.print();},300);
}

export function downloadReport(title:string,filename:string,headers:string[],rows:string[][],format:ExportFormat){
 const html=reportHtml(title,headers,rows),csv=reportCsv(headers,rows);
 let blob:Blob,name=filename;
 if(format==='word'){
  blob=new Blob(['\ufeff'+html],{type:'application/msword;charset=utf-8'});
  name+='.doc';
 }else if(format==='zip'){
  blob=new Blob([createZip([{name:'report.html',contents:html},{name:'report.csv',contents:csv}])],{type:'application/zip'});
  name+='.zip';
 }else{
  showReport(title,headers,rows,true);
  return;
 }
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
