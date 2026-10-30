export type ExportFormat='pdf'|'word'|'zip';

function escapeHtml(value:string){
 return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}

export function reportHtml(title:string,headers:string[],rows:string[][]){
 const head=headers.map(value=>`<th>${escapeHtml(value)}</th>`).join('');
 const body=rows.map(row=>`<tr>${headers.map((_,index)=>`<td>${escapeHtml(row[index]??'')}</td>`).join('')}</tr>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#23352f;margin:32px}h1{font-size:22px}p{color:#66736c}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #d8dfda;padding:8px;text-align:left;vertical-align:top}th{background:#eef3ed}tr{break-inside:avoid}@media print{body{margin:16mm}h1{font-size:18pt}table{font-size:9pt}}</style></head><body><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}. This is a fixed report, not a fillable form.</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><footer style="font-size:11px;color:#52677a;margin-top:20px">Powered by A &amp; U</footer></body></html>`;
}

export function reportCsv(headers:string[],rows:string[][]){
 const quote=(value:string)=>{
  const safe=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 return '\ufeff'+[headers.map(quote).join(','),...rows.map(row=>headers.map((_,index)=>quote(row[index]??'')).join(',')),headers.map((_,index)=>quote(index===0?'Powered by A & U':'')).join(',')].join('\r\n');
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

export function reportOptions(title:string,filename:string,headers:string[],rows:string[][],_legacyFormat?:ExportFormat){
 const dialog=document.createElement('dialog');dialog.className='export-dialog';
 const h=document.createElement('h2');h.textContent=title;dialog.append(h);
 const error=document.createElement('p');error.setAttribute('role','alert');
 const actions=document.createElement('div');actions.className='export-actions';dialog.append(actions);
 const add=(label:string,action:()=>void)=>{const b=document.createElement('button');b.className='btn';b.textContent=label;b.onclick=()=>{try{action();}catch(e){error.textContent=(e as Error).message;}};actions.append(b);};
 add('View online',()=>showReport(title,headers,rows));
 add('Download PDF',()=>downloadReport(title,filename,headers,rows,'pdf'));
 add('Download JPG',()=>downloadJpg(title,filename,headers,rows));
 add('Download Word',()=>downloadReport(title,filename,headers,rows,'word'));
 add('Download ZIP / CSV',()=>downloadReport(title,filename,headers,rows,'zip'));
 const note=document.createElement('p');note.textContent='PDF: choose Save as PDF in the print window. Long JPG reports download as numbered pages.';dialog.append(note,error);
 add('Close',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
export function downloadJpg(title:string,filename:string,headers:string[],rows:string[][]){
 const width=Math.max(1200,headers.length*180),cell=(width-64)/Math.max(1,headers.length),line=21;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image export is unavailable.');
 canvas.width=width;ctx.font='15px Arial';
 const wrap=(text:string)=>{const result:string[]=[];for(const paragraph of text.split('\n')){let current='';for(const char of paragraph){if(ctx.measureText(current+char).width>cell-20){result.push(current);current=char;}else current+=char;}result.push(current);}return result;};
 const prepared=rows.map(row=>headers.map((_,i)=>wrap(String(row[i]??'')))),head=headers.map(wrap),headHeight=Math.max(...head.map(c=>c.length),1)*line+20;
 const pages:{cells:string[][];height:number}[][]=[[{cells:head,height:headHeight}]];let used=120+headHeight;
 for(const cells of prepared){const length=Math.max(...cells.map(c=>c.length),1);for(let offset=0;offset<length;offset+=200){const chunk=cells.map(c=>c.slice(offset,offset+200)),height=Math.max(...chunk.map(c=>c.length),1)*line+20;if(used+height>6000){pages.push([{cells:head,height:headHeight}]);used=120+headHeight;}pages.at(-1)!.push({cells:chunk,height});used+=height;}}
 pages.forEach((page,index)=>{canvas.height=120+page.reduce((n,r)=>n+r.height,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='#18304a';ctx.font='bold 22px Arial';ctx.fillText(title,32,40,width-64);ctx.font='14px Arial';ctx.fillText(`LCPS report · Page ${index+1} of ${pages.length} · Powered by A & U`,32,70);let y=100;for(const row of page){row.cells.forEach((lines,i)=>{ctx.strokeStyle='#cbd5e1';ctx.strokeRect(32+i*cell,y,cell,row.height);ctx.fillStyle='#18304a';ctx.font='15px Arial';lines.forEach((text,j)=>ctx.fillText(text,42+i*cell,y+24+j*line));});y+=row.height;}const link=document.createElement('a');link.href=canvas.toDataURL('image/jpeg',0.92);link.download=`${filename}-${index+1}.jpg`;link.click();});
}
