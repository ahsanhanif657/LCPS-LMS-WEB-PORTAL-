import { Data } from './types';
export function resourceScope(data: Data, offeringId: string): Data {
  const assignments = data.assignments.filter((r) => r.offeringId === offeringId),
    quizzes = data.quizzes.filter((r) => r.offeringId === offeringId),
    materials = data.materials.filter((r) => r.offeringId === offeringId);
  return {
    ...data,
    assignments,
    quizzes,
    materials,
    submissions: data.submissions.filter((r) => assignments.some((a) => a.id === r.assignmentId)),
    attempts: data.attempts.filter((r) => quizzes.some((q) => q.id === r.quizId)),
    progress: data.progress.filter((r) => materials.some((m) => m.id === r.materialId)),
  };
}
