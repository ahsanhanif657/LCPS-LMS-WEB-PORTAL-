import { Data, Row } from './types';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function timetableGrids(data: Data) {
  const name = (table: string, id: string) =>
    data[table]?.find((r) => r.id === id)?.name || 'Not specified';
  const minutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  return data.batches.map((batch) => {
    const offers = data.offerings.filter((o) => o.batchId === batch.id),
      records: Row[] = [
        ...data.timetable.filter((t) => offers.some((o) => o.id === t.offeringId)),
        ...(data.scheduleEvents || [])
          .filter((e) => e.batchId === batch.id)
          .map((e) => ({ ...e, isActivity: true })),
      ],
      ordered = [...records].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      groups: Row[][] = [];
    for (const record of ordered) {
      const current = groups.at(-1);
      if (current && minutes(record.startTime) - minutes(current[0].startTime) <= 5)
        current.push(record);
      else groups.push([record]);
    }
    const slots = groups.map((group) => {
      const latestEnd = group.reduce(
        (latest, record) => (record.endTime > latest ? record.endTime : latest),
        group[0].endTime,
      );
      return `${group[0].startTime}|${latestEnd}`;
    });
    return {
      id: batch.id,
      title: `${name('programs', batch.programId)} · ${batch.name} · Semester ${batch.semester}`,
      slots,
      days: DAYS.filter((day) => records.some((t) => t.day === day)).map((day) => ({
        day,
        cells: groups.map((group) =>
          group
            .filter((t) => t.day === day)
            .map((record) => {
              const o = offers.find((o) => o.id === record.offeringId);
              return {
                record,
                subject: record.isActivity ? record.title : name('subjects', o?.subjectId),
                teacher: record.isActivity
                  ? record.kind
                  : [o?.teacherId, o?.coTeacherId]
                      .filter(Boolean)
                      .map((id) => name('users', id))
                      .join(' / '),
                room: record.room || (record.isActivity ? '' : 'Room not assigned'),
              };
            }),
        ),
      })),
    };
  });
}
export type TimetableGrid = ReturnType<typeof timetableGrids>[number];
