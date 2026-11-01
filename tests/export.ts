import assert from 'node:assert/strict';
import { createZip, reportCsv, reportHtml } from '../lib/lms/export';

const headers = ['Name', 'Notes'];
const rows = [
  ['Ada', '<script>alert(1)</script>'],
  ['=1+1', 'Quoted "text"'],
];
const html = reportHtml('Report <today>', headers, rows);
assert.ok(html.includes('Report &lt;today&gt;'));
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.ok(html.includes('not a fillable form'));

const csv = reportCsv(headers, rows);
assert.ok(csv.startsWith('\ufeff'));
assert.ok(csv.includes('"\'=1+1"'));
assert.ok(csv.includes('"Quoted ""text"""'));

const zip = createZip([
  { name: 'report.html', contents: html },
  { name: 'report.csv', contents: csv },
]);
const bytes = new Uint8Array(zip),
  view = new DataView(zip);
assert.equal(view.getUint32(0, true), 0x04034b50);
const endOffset = bytes.length - 22;
assert.equal(view.getUint32(endOffset, true), 0x06054b50);
const directoryOffset = view.getUint32(endOffset + 16, true);
assert.equal(view.getUint32(directoryOffset, true), 0x02014b50);
assert.equal(view.getUint16(endOffset + 10, true), 2);
assert.ok(Buffer.from(bytes).includes(Buffer.from('report.html')));
assert.ok(Buffer.from(bytes).includes(Buffer.from('report.csv')));
console.log('PASS fixed HTML, safe CSV and ZIP export output');

const { timetableGrids } = await import('../lib/lms/timetable-view');
const { timetableHtml } = await import('../lib/lms/timetable-export');
const { seedData } = await import('../lib/lms/seed');
const timetableData = seedData();
timetableData.subjects[0].name = '<script>unsafe</script>';
const grids = timetableGrids(timetableData),
  gridHtml = timetableHtml(grids);
assert(gridHtml.includes('Day / Time'));
assert(gridHtml.includes('scope="row"'));
assert(!gridHtml.includes('<script>unsafe</script>'));
for (const grid of grids)
  for (const day of grid.days) assert.equal(day.cells.length, grid.slots.length);
assert(grids.some((g) => g.days.length > 0));
assert(gridHtml.includes('@page{size:A4 landscape'));
console.log('PASS shared timetable grid, day/time columns, landscape export and HTML escaping');
