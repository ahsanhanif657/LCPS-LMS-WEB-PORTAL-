export type ImportFileData = {
  headers: string[];
  rows: string[][];
};

const aliases: Record<string, string[]> = {
  name: ['name', 'fullname', 'studentname', 'teachername', 'staffname'],
  username: ['username', 'loginusername', 'user_name'],
  role: ['role', 'userrole', 'accounttype', 'type'],
  departmentId: ['department', 'departmentname', 'departmentid', 'dept'],
  programId: ['program', 'programname', 'programid', 'degree'],
  sessionId: ['session', 'academicsession', 'sessionid'],
  batchId: ['batch', 'batchname', 'batchid', 'class', 'classname'],
  identifier: ['identifier', 'rollnumber', 'rollno', 'registrationnumber', 'employeeid', 'staffid'],
  email: ['email', 'emailaddress'],
  phone: ['phone', 'phonenumber', 'mobile'],
  password: ['password', 'temporarypassword'],
  employmentType: ['employmenttype', 'appointment', 'teacherapppointment'],
};

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function guessAccountImportMappings(headers: string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [
      field,
      headers.find((header) => names.includes(normalizedHeader(header))) || '',
    ]),
  );
}

function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  text = text.replace(/^\uFEFF/, '');

  for (let index = 0; index <= text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (character === undefined) {
        throw new Error('Unclosed quoted CSV field.');
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field || closed) throw new Error('Unexpected quote in CSV.');
      quoted = true;
    } else if (character === ',' || character === '\n' || character === '\r' || !character) {
      row.push(field);
      field = '';
      closed = false;
      if (character !== ',') {
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        if (character === '\r' && text[index + 1] === '\n') index++;
      }
    } else if (closed && !/\s/.test(character)) {
      throw new Error('Unexpected text after a quoted CSV field.');
    } else if (!closed) {
      field += character;
    }
  }
  return rows;
}

function normalizeGrid(grid: unknown[][]): ImportFileData {
  const rows = grid
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean));
  const headers = rows.shift();
  if (!headers || headers.length < 2)
    throw new Error('The file must contain a header row and at least one data column.');
  if (new Set(headers.map(normalizedHeader)).size !== headers.length)
    throw new Error('The file contains duplicate column names. Rename them before importing.');
  if (rows.length === 0 || rows.length > 500)
    throw new Error('Choose a file containing 1–500 account rows.');
  for (const [index, row] of rows.entries()) {
    if (row.length !== headers.length)
      throw new Error(`Row ${index + 2} has ${row.length} columns; expected ${headers.length}.`);
  }
  return { headers, rows };
}

type PdfTextItem = { str: string; transform: number[]; width: number };
type PdfTextLine = { y: number; items: PdfTextItem[] };

function textLines(items: unknown[]): PdfTextLine[] {
  const lines: PdfTextLine[] = [];
  for (const item of items) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('str' in item) ||
      !('transform' in item) ||
      typeof item.str !== 'string' ||
      !item.str.trim()
    )
      continue;
    const textItem = item as PdfTextItem;
    const y = Math.round(textItem.transform[5] / 2) * 2;
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(textItem);
  }
  return lines
    .map((line) => ({
      ...line,
      items: line.items.sort((a, b) => a.transform[4] - b.transform[4]),
    }))
    .sort((a, b) => b.y - a.y);
}

function pdfCells(line: PdfTextLine) {
  const cells: Array<{ text: string; x: number; end: number }> = [];
  for (const item of line.items) {
    const x = item.transform[4];
    const last = cells.at(-1);
    if (last && x - last.end < 20) {
      last.text += ` ${item.str}`;
      last.end = x + item.width;
    } else {
      cells.push({ text: item.str, x, end: x + item.width });
    }
  }
  return cells;
}

async function parsePdf(file: File): Promise<ImportFileData> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '../../node_modules/pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const document = await task.promise;
  try {
    if (document.numPages > 600)
      throw new Error('PDF is over 600 pages. Split it into smaller files.');
    const lines: PdfTextLine[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      lines.push(...textLines(content.items));
    }
    const headerIndex = lines.findIndex((line) => {
      const names = pdfCells(line).map((cell) => normalizedHeader(cell.text));
      return names.includes('name') || names.includes('fullname') || names.includes('studentname');
    });
    if (headerIndex < 0)
      throw new Error(
        'No readable table header was found in the PDF. Scanned/image-only PDFs and unstructured forms are not supported.',
      );
    const headerCells = pdfCells(lines[headerIndex]);
    const headers = headerCells.map((cell) => cell.text);
    const dataRows: string[][] = [];
    for (const line of lines.slice(headerIndex + 1)) {
      const cells = Array.from({ length: headerCells.length }, () => '');
      for (const item of line.items) {
        const x = item.transform[4];
        const column = headerCells.findLastIndex((header) => header.x <= x + 1);
        if (column >= 0) cells[column] = [cells[column], item.str].filter(Boolean).join(' ').trim();
      }
      if (cells.some(Boolean)) dataRows.push(cells);
    }
    return normalizeGrid([headers, ...dataRows]);
  } finally {
    await task.destroy();
  }
}

export async function parseAccountImportFile(file: File): Promise<ImportFileData> {
  if (file.size > 10 * 1024 * 1024) throw new Error('The import file must be 10 MB or smaller.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'csv' || file.type === 'text/csv')
    return normalizeGrid(parseCsvGrid(await file.text()));
  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    return normalizeGrid(await readSheet(file));
  }
  if (extension === 'pdf' || file.type === 'application/pdf') return parsePdf(file);
  throw new Error('Choose a CSV, Excel (.xlsx), or readable text-table PDF file.');
}
