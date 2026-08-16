import type { StudentData } from '~/types/plannerData';
import type { StudentRecord } from './types';

// StudentRecord is a Pick<Student, ...> of this app's own Student type (same SchaleDB source),
// so a Student[] is already structurally a StudentRecord[] — this is just Record -> array.
export function toStudentRecords(allStudents: StudentData): StudentRecord[] {
  return Object.values(allStudents);
}
