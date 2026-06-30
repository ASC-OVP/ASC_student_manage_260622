import { ExamResultStatus } from "@/lib/generated/prisma";
import { difficultyLabel } from "@/features/omr/lib/omrQuestionMeta";

type StudentBrief = { id: string; name: string; schoolName: string | null; grade: string | null };
type ResultItemLite = { questionNo: number; status: ExamResultStatus; studentAnswer: string | null; correctAnswer: string | null; score: number };
type ResultWithItems = { totalScore: number; maxScore: number; correctCount: number; wrongCount: number; blankCount: number; reviewNeededCount: number; items: ResultItemLite[] };
type ExamUploadLite = { id: string; studentId: string | null; fileName: string; student: StudentBrief | null; results: ResultWithItems[] };
type QuestionMetaLite = {
  questionNo: number;
  primaryType: string | null;
  secondaryType: string | null;
  answerFormat: string | null;
  difficulty: string | null;
  section: string | null;
  learningGoal: string | null;
  achievementStandard: string | null;
  tags: string | null;
  memo: string | null;
  omrMappingStatus: string;
};

type ExamForInsights = { uploads: ExamUploadLite[]; questionMetas: QuestionMetaLite[] };
export type InsightMetric = { label: string; total: number; correct: number; wrong: number; rate: number };
type MetricAccumulator = { total: number; correct: number; wrong: number };

export type OmrResultInsights = {
  gradedCount: number;
  averageScore: number | null;
  highScore: number | null;
  lowScore: number | null;
  metaAvailable: boolean;
  remedialStudents: Array<{ id: string; name: string; score: number; percent: number | null; reviewNeededCount: number }>;
  topWrongQuestions: Array<{ questionNo: number; total: number; wrong: number; rate: number; primaryType: string | null; secondaryType: string | null; difficulty: string | null; tags: string | null }>;
  primaryTypeMetrics: InsightMetric[];
  secondaryTypeMetrics: InsightMetric[];
  difficultyMetrics: InsightMetric[];
  weakTypeMetrics: InsightMetric[];
  studentRecommendations: Array<{ id: string; name: string; weakTypes: string[]; questionNos: number[] }>;
};

export function buildResultInsights(exam: ExamForInsights): OmrResultInsights {
  const gradedUploads = exam.uploads
    .map((upload) => ({ upload, result: upload.results[0] ?? null }))
    .filter((item): item is { upload: ExamUploadLite; result: ResultWithItems } => Boolean(item.result));
  const scores = gradedUploads.map(({ result }) => result.totalScore);
  const averageScore = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  const highScore = scores.length ? Math.max(...scores) : null;
  const lowScore = scores.length ? Math.min(...scores) : null;
  const metaByNo = new Map(exam.questionMetas.map((meta) => [meta.questionNo, meta]));
  const questionStats = new Map<number, { questionNo: number; total: number; wrong: number }>();
  const primaryStats = new Map<string, MetricAccumulator>();
  const secondaryStats = new Map<string, MetricAccumulator>();
  const difficultyStats = new Map<string, MetricAccumulator>();
  const studentWeakness = new Map<string, { id: string; name: string; typeCounts: Map<string, number>; questionNos: Set<number> }>();

  for (const { upload, result } of gradedUploads) {
    for (const item of result.items) {
      const correct = item.status === ExamResultStatus.CORRECT;
      const current = questionStats.get(item.questionNo) ?? { questionNo: item.questionNo, total: 0, wrong: 0 };
      current.total += 1;
      if (!correct) current.wrong += 1;
      questionStats.set(item.questionNo, current);

      const meta = metaByNo.get(item.questionNo);
      if (!meta) continue;
      addMetric(primaryStats, meta.primaryType, correct);
      addMetric(secondaryStats, meta.secondaryType, correct);
      addMetric(difficultyStats, difficultyLabel(meta.difficulty), correct);

      if (!correct && meta.primaryType) {
        const id = upload.studentId ?? upload.id;
        const weakness = studentWeakness.get(id) ?? { id, name: upload.student?.name ?? upload.fileName, typeCounts: new Map<string, number>(), questionNos: new Set<number>() };
        weakness.typeCounts.set(meta.primaryType, (weakness.typeCounts.get(meta.primaryType) ?? 0) + 1);
        weakness.questionNos.add(item.questionNo);
        studentWeakness.set(id, weakness);
      }
    }
  }

  const remedialStudents = gradedUploads
    .map(({ upload, result }) => {
      const percent = result.maxScore > 0 ? Math.round((result.totalScore / result.maxScore) * 1000) / 10 : null;
      return { id: upload.id, name: upload.student?.name ?? upload.fileName, score: result.totalScore, percent, reviewNeededCount: result.reviewNeededCount };
    })
    .filter((student) => (student.percent !== null && student.percent < 60) || student.reviewNeededCount > 0)
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  const topWrongQuestions = Array.from(questionStats.values())
    .filter((question) => question.total > 0 && question.wrong > 0)
    .map((question) => {
      const meta = metaByNo.get(question.questionNo);
      return { ...question, rate: question.wrong / question.total, primaryType: meta?.primaryType ?? null, secondaryType: meta?.secondaryType ?? null, difficulty: meta?.difficulty ?? null, tags: meta?.tags ?? null };
    })
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong || a.questionNo - b.questionNo)
    .slice(0, 5);

  const primaryTypeMetrics = metricList(primaryStats);
  const weakTypeMetrics = [...primaryTypeMetrics].sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong).slice(0, 5);
  const studentRecommendations = Array.from(studentWeakness.values())
    .map((student) => ({
      id: student.id,
      name: student.name,
      weakTypes: Array.from(student.typeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type]) => type),
      questionNos: Array.from(student.questionNos).sort((a, b) => a - b).slice(0, 10),
    }))
    .filter((student) => student.weakTypes.length > 0)
    .slice(0, 5);

  return {
    gradedCount: gradedUploads.length,
    averageScore,
    highScore,
    lowScore,
    metaAvailable: exam.questionMetas.length > 0,
    remedialStudents,
    topWrongQuestions,
    primaryTypeMetrics,
    secondaryTypeMetrics: metricList(secondaryStats),
    difficultyMetrics: metricList(difficultyStats),
    weakTypeMetrics,
    studentRecommendations,
  };
}

function addMetric(stats: Map<string, MetricAccumulator>, label: string | null | undefined, correct: boolean) {
  const normalized = label?.trim();
  if (!normalized || normalized === "-") return;
  const current = stats.get(normalized) ?? { total: 0, correct: 0, wrong: 0 };
  current.total += 1;
  if (correct) current.correct += 1;
  else current.wrong += 1;
  stats.set(normalized, current);
}

function metricList(stats: Map<string, MetricAccumulator>): InsightMetric[] {
  return Array.from(stats.entries())
    .map(([label, value]) => ({ label, ...value, rate: value.total > 0 ? value.correct / value.total : 0 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
