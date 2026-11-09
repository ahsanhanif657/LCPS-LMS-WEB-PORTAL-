import { TimetableGrid } from './timetable-view';
import { createZip, downloadJpg } from './export';
const escape = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function timetableHtml(grids: TimetableGrid[]) {
  const cells = (items: TimetableGrid['days'][number]['cells'][number]) =>
    items.length
      ? items
          .map(
            (item) =>
              `<div><strong>${escape(item.subject)}</strong><span>${escape(
                item.record.startTime + ' – ' + item.record.endTime,
              )}</span><span>${escape(item.teacher)}</span><span>${escape(item.room)}</span></div>`,
          )
          .join('')
      : '—';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LCPS · Timetable</title><style>@page{size:A4 landscape;margin:10mm}body{font:14px Arial,sans-serif;color:#18334b;margin:24px}h1{color:#007eaf;font-size:24px}h2{font-size:17px;margin:24px 0 14px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:24px}th,td{border:1px solid #a9bfd0;padding:12px 8px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}thead th{background:#dceffc;color:#123c59;font-weight:bold}th:first-child{width:100px}tbody th{background:#edf6fc}td div+div{border-top:1px dashed #a9bfd0;margin-top:8px;padding-top:8px}strong,span{display:block;line-height:1.5}span{font-size:12px;color:#40596d}thead{display:table-header-group}tr{break-inside:avoid}section+section{break-before:page}@media print{body{margin:0}table{font-size:10pt}th,td{padding:9px 6px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>LCPS · Academic timetable</h1>${grids.map((grid) => `<section><h2>${escape(grid.title)}</h2>${grid.days.length ? `<table><thead><tr><th>Day / Time</th>${grid.slots.map((slot) => `<th>${escape(slot.replace('|', ' – '))}</th>`).join('')}</tr></thead><tbody>${grid.days.map((day) => `<tr><th scope="row">${escape(day.day)}</th>${day.cells.map((cell) => `<td>${cells(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>No scheduled classes for this batch.</p>'}</section>`).join('')}<footer style="font-size:11px;color:#52677a;margin-top:20px">Powered by A &amp; U</footer></body></html>`;
}
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function timetableExportOptions(grids: TimetableGrid[]) {
  const html = timetableHtml(grids),
    dialog = document.createElement('dialog');
  dialog.className = 'export-dialog';
  const h = document.createElement('h2');
  h.textContent = 'Download timetable';
  dialog.append(h);
  const note = document.createElement('p');
  note.textContent =
    'All formats preserve the day-by-time grid. For PDF, choose Save as PDF in the print window. Each class has its own grid.';
  dialog.append(note);
  const actions = document.createElement('div');
  actions.className = 'export-actions';
  dialog.append(actions);
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  dialog.append(error);
  const add = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.onclick = () => {
      try {
        action();
      } catch (e) {
        error.textContent = (e as Error).message;
      }
    };
    actions.append(b);
  };
  const view = (print = false) => {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Allow pop-ups to open the timetable.');
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (print)
      setTimeout(() => {
        w.focus();
        w.print();
      }, 300);
  };
  add('View online', () => view());
  add('Download PDF', () => view(true));
  add('Download Word', () =>
    save(
      new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' }),
      'LCPS-timetable.doc',
    ),
  );
  add('Download JPG', () =>
    grids.forEach((g, i) =>
      downloadJpg(
        g.title,
        `LCPS-timetable-${i + 1}`,
        ['Day / Time', ...g.slots.map((s) => s.replace('|', ' – '))],
        g.days.map((d) => [
          d.day,
          ...d.cells.map(
            (c) =>
              c
                .map(
                  (x) =>
                    `${x.record.startTime}–${x.record.endTime}\n${x.subject}\n${x.teacher}\n${x.room}`,
                )
                .join('\n\n') || '—',
          ),
        ]),
      ),
    ),
  );
  add('Download ZIP', () =>
    save(
      new Blob([createZip([{ name: 'timetable.html', contents: html }])], {
        type: 'application/zip',
      }),
      'LCPS-timetable.zip',
    ),
  );
  add('Close', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
