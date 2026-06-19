type ScoreRecordLike = {
  date: string;
  title: string;
  score: number | null;
  maxScore?: number | null;
};

type AttendanceRecordLike = {
  date: string;
  status: string;
};

type AssignmentRecordLike = {
  date: string;
  status: string;
};

export type ClassStatsStudent = {
  id: string;
  name: string;
  scoreRecords: ScoreRecordLike[];
  attendanceRecords: AttendanceRecordLike[];
  assignmentRecords: AssignmentRecordLike[];
};

export type ClassStats = {
  studentCount: number;
  averageScore: number | null;
  medianScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  standardDeviation: number | null;
  attendanceRate: number | null;
  assignmentCompletionRate: number | null;
  missingAssignmentCount: number;
  improvedCount: number;
  declinedCount: number;
  scoreTrend: Array<{ label: string; value: number }>;
  studentScores: Array<{ id: string; name: string; score: number | null }>;
  attendanceTrend: Array<{ label: string; value: number }>;
  assignmentTrend: Array<{ label: string; value: number }>;
};

const absentStatuses = new Set(["ABSENT", "SKIP", "LEFT"]);
const doneAssignmentStatuses = new Set(["DONE", "PARTIAL"]);
const missingAssignmentStatuses = new Set(["MISSING"]);

export function buildClassStats(students: ClassStatsStudent[]): ClassStats {
  const latestScores = students
    .map((student) => latestScore(student.scoreRecords)?.score ?? null)
    .filter((score): score is number => typeof score === "number");
  const sortedScores = [...latestScores].sort((a, b) => a - b);
  const attendanceRecords = students.flatMap((student) => student.attendanceRecords);
  const assignmentRecords = students.flatMap((student) => student.assignmentRecords);
  const improvedDeclined = students.reduce(
    (acc, student) => {
      const records = sortedScoreRecords(student.scoreRecords).filter((record) => typeof record.score === "number");
      if (records.length < 2) return acc;
      const latest = records[0].score ?? 0;
      const previous = records[1].score ?? 0;
      if (latest > previous) acc.improved += 1;
      if (latest < previous) acc.declined += 1;
      return acc;
    },
    { improved: 0, declined: 0 }
  );

  return {
    studentCount: students.length,
    averageScore: average(latestScores),
    medianScore: median(sortedScores),
    highestScore: sortedScores.length ? sortedScores[sortedScores.length - 1] : null,
    lowestScore: sortedScores.length ? sortedScores[0] : null,
    standardDeviation: stddev(latestScores),
    attendanceRate: attendanceRecords.length
      ? Math.round((attendanceRecords.filter((record) => !absentStatuses.has(record.status)).length / attendanceRecords.length) * 100)
      : null,
    assignmentCompletionRate: assignmentRecords.length
      ? Math.round((assignmentRecords.filter((record) => doneAssignmentStatuses.has(record.status)).length / assignmentRecords.length) * 100)
      : null,
    missingAssignmentCount: assignmentRecords.filter((record) => missingAssignmentStatuses.has(record.status)).length,
    improvedCount: improvedDeclined.improved,
    declinedCount: improvedDeclined.declined,
    scoreTrend: scoreTrend(students),
    studentScores: students.map((student) => ({
      id: student.id,
      name: student.name,
      score: latestScore(student.scoreRecords)?.score ?? null,
    })),
    attendanceTrend: rateTrend(attendanceRecords, (record) => !absentStatuses.has(record.status)),
    assignmentTrend: rateTrend(assignmentRecords, (record) => doneAssignmentStatuses.has(record.status)),
  };
}

export function latestScore(records: ScoreRecordLike[]) {
  return sortedScoreRecords(records).find((record) => typeof record.score === "number") ?? null;
}

function sortedScoreRecords(records: ScoreRecordLike[]) {
  return [...records].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.title.localeCompare(a.title);
  });
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(sortedValues: number[]) {
  if (sortedValues.length === 0) return null;
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return round1(sortedValues[middle]);
  return round1((sortedValues[middle - 1] + sortedValues[middle]) / 2);
}

function stddev(values: number[]) {
  const avg = average(values);
  if (avg === null || values.length <= 1) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return round1(Math.sqrt(variance));
}

function scoreTrend(students: ClassStatsStudent[]) {
  const byLabel = new Map<string, number[]>();
  for (const student of students) {
    for (const record of student.scoreRecords) {
      if (typeof record.score !== "number") continue;
      const label = record.title ? `${record.date} ${record.title}` : record.date;
      const values = byLabel.get(label) ?? [];
      values.push(record.score);
      byLabel.set(label, values);
    }
  }

  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([label, values]) => ({ label, value: average(values) ?? 0 }));
}

function rateTrend<T extends { date: string }>(records: T[], isPositive: (record: T) => boolean) {
  const byDate = new Map<string, T[]>();
  for (const record of records) {
    const values = byDate.get(record.date) ?? [];
    values.push(record);
    byDate.set(record.date, values);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([label, values]) => ({
      label,
      value: Math.round((values.filter(isPositive).length / values.length) * 100),
    }));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
