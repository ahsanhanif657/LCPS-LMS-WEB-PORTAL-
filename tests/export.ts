import assert from 'node:assert/strict';
import {createZip,reportCsv,reportHtml} from '../lib/lms/export';

const headers=['Name','Notes'];
const rows=[['Ada','<script>alert(1)</script>'],['=1+1','Quoted "text"']];
const html=reportHtml('Report <today>',headers,rows);
assert.ok(html.includes('Report &lt;today&gt;'));
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.ok(html.includes('not a fillable form'));

const csv=reportCsv(headers,rows);
assert.ok(csv.startsWith('\ufeff'));
assert.ok(csv.includes('"\'=1+1"'));
assert.ok(csv.includes('"Quoted ""text"""'));

const zip=createZip([{name:'report.html',contents:html},{name:'report.csv',contents:csv}]);
const bytes=new Uint8Array(zip),view=new DataView(zip);
assert.equal(view.getUint32(0,true),0x04034b50);
const endOffset=bytes.length-22;
assert.equal(view.getUint32(endOffset,true),0x06054b50);
const directoryOffset=view.getUint32(endOffset+16,true);
assert.equal(view.getUint32(directoryOffset,true),0x02014b50);
assert.equal(view.getUint16(endOffset+10,true),2);
assert.ok(Buffer.from(bytes).includes(Buffer.from('report.html')));
assert.ok(Buffer.from(bytes).includes(Buffer.from('report.csv')));
console.log('PASS fixed HTML, safe CSV and ZIP export output');
