import type { Data, Row } from './types';

const rolePrefixes: Record<string, string> = {
  TEACHER: 'LCPS-T',
  HOD: 'LCPS-H',
  PRINCIPAL: 'LCPS-P',
  DIRECTOR: 'LCPS-D',
  ADMIN: 'LCPS-A',
  SUPER_ADMIN: 'LCPS-SA',
  TREASURER: 'LCPS-TR',
  EXAMINATION_CONTROLLER: 'LCPS-EC',
  REGISTRAR: 'LCPS-R',
};

function nextSequence(prefix: string, users: Row[]) {
  const expression = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
  const maximum = users.reduce((value, user) => {
    const match = String(user.identifier || '').trim().match(expression);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `${prefix}-${String(maximum + 1).padStart(3, '0')}`;
}

function programToken(program?: Row) {
  const explicit = String(program?.code || program?.shortName || '').trim();
  if (explicit) return explicit.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12);
  const words = String(program?.name || program?.id || 'STUDENT')
    .toUpperCase()
    .match(/[A-Z0-9]+/g) || ['STUDENT'];
  const acronym = words.filter((word) => !['AND', 'OF', 'THE', 'FOR'].includes(word)).map((word) => word[0]).join('');
  return (acronym || words[0]).slice(0, 12);
}

function sessionToken(session?: Row) {
  const name = String(session?.name || session?.id || '').trim();
  const seasonYear = name.match(/\b(FALL|SPRING|SUMMER|WINTER)\s*[-']?\s*(\d{2,4})\b/i);
  if (seasonYear) {
    const season = seasonYear[1].toUpperCase();
    const shortSeason = season === 'SUMMER' ? 'SU' : season[0];
    return `${shortSeason}${seasonYear[2].slice(-2)}`;
  }
  const yearSeason = name.match(/\b(\d{2,4})\s*(FALL|SPRING|SUMMER|WINTER)\b/i);
  if (yearSeason) {
    const season = yearSeason[2].toUpperCase();
    const shortSeason = season === 'SUMMER' ? 'SU' : season[0];
    return `${shortSeason}${yearSeason[1].slice(-2)}`;
  }
  const year = name.match(/\b(19|20)\d{2}\b/);
  if (year) return year[0];
  const token = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12);
  return token || 'SESSION';
}

export function suggestUserIdentifier(record: Row, data: Data): string {
  const role = String(record.role || '').toUpperCase();
  const users = data.users || [];
  if (!role) return '';

  if (role === 'STUDENT') {
    const batches = data.batches || [];
    const batch = batches.find((item) => item.id === record.batchId);
    const programId = record.programId || batch?.programId;
    const sessionId = record.sessionId || batch?.sessionId;
    if (!programId || !sessionId) return '';

    const studentsInCohort = users.filter((user) => {
      if (user.role !== 'STUDENT') return false;
      const userBatch = batches.find((item) => item.id === user.batchId);
      return (
        (user.programId || userBatch?.programId) === programId &&
        (user.sessionId || userBatch?.sessionId) === sessionId
      );
    });
    const existing = studentsInCohort
      .map((user) => {
        const match = String(user.identifier || '').trim().match(/^(LCPS-.+)-(\d+)$/i);
        return match ? { prefix: match[1], sequence: Number(match[2]) } : null;
      })
      .filter((item): item is { prefix: string; sequence: number } => !!item)
      .sort((left, right) => right.sequence - left.sequence)[0];
    if (existing) return nextSequence(existing.prefix, users);

    const program = (data.programs || []).find((item) => item.id === programId);
    const session = (data.sessions || []).find((item) => item.id === sessionId);
    const prefix = `LCPS-${programToken(program)}-${sessionToken(session)}`;
    return nextSequence(prefix, users);
  }

  const prefix = rolePrefixes[role];
  if (!prefix) return '';
  return nextSequence(prefix, users.filter((user) => user.role === role));
}
