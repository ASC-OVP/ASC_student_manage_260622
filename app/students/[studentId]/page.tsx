import { requireUser } from "@/lib/auth";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PhoneInput from "@/components/PhoneInput";
import { todayKoreaDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  createClinicRecord,
  createCounselingRecord,
  createQuestionRecord,
  createSchoolScoreRecord,
  createStudentMemo,
  deleteMemo,
  deleteStudent,
  toggleStudentMemoImportant,
  updateStudent,
  updateStudentMemo,
} from "../actions";

type Props = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string; memoQ?: string }>;
};

type ScorePoint = {
  date: string;
  title: string;
  rawScore: number;
  maxScore: number;
  percent: number;
};

type ScoreAnalysis = {
  points: ScorePoint[];
  average: number;
  latest: ScorePoint | null;
  previous: ScorePoint | null;
  best: ScorePoint | null;
  lowest: ScorePoint | null;
  delta: number | null;
  summary: string;
  advice: string;
};

const tabs = [
  { key: "classes", label: "수강 이력" },
  { key: "care", label: "클리닉 및 상담 이력" },
  { key: "questions", label: "질문 이력" },
  { key: "scores", label: "성적 이력" },
  { key: "school", label: "학교 성적" },
] as const;

const memoTypes = [
  ["GENERAL", "일반 메모"],
  ["COUNSELING", "상담 메모"],
  ["STUDY", "학습 메모"],
  ["ATTITUDE", "태도 메모"],
  ["ATTENDANCE", "출결 메모"],
  ["HOMEWORK", "과제 메모"],
  ["CLINIC", "클리닉 메모"],
  ["ETC", "기타"],
] as const;

const statusText: Record<string, string> = {
  ACTIVE: "재원",
  WATCH: "집중관리",
  PAUSED: "휴원",
  LEFT: "퇴원",
};

export default async function StudentDetailPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const { studentId } = await params;
  const sp = await searchParams;
  const activeTab = tabs.some((tab) => tab.key === sp.tab) ? sp.tab! : "scores";
  const memoQ = sp.memoQ?.trim() ?? "";

  const [student, staff, classGroups] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, academyId: user.academyId },
      include: {
        teacher: true,
        assistant: true,
        studentClasses: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: { classGroup: { include: { teacher: true } } },
        },
        memos: {
          orderBy: [{ isImportant: "desc" }, { createdAt: "desc" }],
          include: { writer: true },
        },
        attendanceRecords: { orderBy: { date: "desc" }, take: 12 },
        assignmentRecords: { orderBy: { date: "desc" }, take: 12 },
        scoreRecords: { orderBy: [{ title: "asc" }, { date: "asc" }] },
        counselingRecords: { orderBy: { date: "desc" }, include: { owner: true } },
        clinicRecords: { orderBy: { date: "desc" }, include: { owner: true } },
        questionRecords: { orderBy: { date: "desc" }, include: { owner: true } },
        schoolScoreRecords: { orderBy: [{ term: "desc" }, { subject: "asc" }] },
      },
    }),
    prisma.user.findMany({
      where: { academyId: user.academyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.classGroup.findMany({
      where: {
        academyId: user.academyId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: { teacher: true },
      orderBy: [{ teacher: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  if (!student) notFound();

  const teachers = staff.filter((member) => member.role === "TEACHER" || member.role === "MANAGER" || member.role === "ADMIN");
  const assistants = staff.filter((member) => member.role === "ASSISTANT");
  const primaryClass = student.studentClasses[0]?.classGroup;
  const filteredMemos = memoQ
    ? student.memos.filter((memo) =>
        [memo.content, memo.writer.name, memoTypeText(memo.type)].join(" ").toLocaleLowerCase("ko-KR").includes(memoQ.toLocaleLowerCase("ko-KR"))
      )
    : student.memos;
  const scoreAnalysis = buildScoreAnalysis(student.scoreRecords);
  const schoolGroups = groupBy(student.schoolScoreRecords, (record) => record.subject || "학교 성적");
  const careRecords = [
    ...student.counselingRecords.map((record) => ({ kind: "상담", date: record.date, title: record.title, content: record.content, status: record.status, owner: record.owner?.name ?? "-" })),
    ...student.clinicRecords.map((record) => ({ kind: "클리닉", date: record.date, title: record.title, content: record.content ?? "", status: record.status, owner: record.owner?.name ?? "-" })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main style={page}>
      <section style={shell}>
        <header style={topBar}>
          <div>
            <Link href="/students" style={backLink}>학생 현황판</Link>
            <h1 style={pageTitle}>학생 상세 정보</h1>
          </div>
          <div style={topActions}>
            <span style={softBadge}>{primaryClass ? `${primaryClass.teacher?.name ? `${primaryClass.teacher.name} / ` : ""}${primaryClass.name}` : "반 미지정"}</span>
            <Link href="/students" style={closeButton}>닫기</Link>
          </div>
        </header>

        <div style={detailGrid}>
          <aside style={leftColumn}>
            <section style={profileCard}>
              <form action={updateStudent} style={profileForm}>
                <input type="hidden" name="studentId" value={student.id} />
                <div style={profileHead}>
                  <div style={avatar}>인</div>
                  <div>
                    <input name="name" defaultValue={student.name} required style={nameInput} />
                    <div style={tagRow}>
                      <span style={student.status === "WATCH" ? warnBadge : softBadge}>{statusText[student.status] ?? student.status}</span>
                      {student.grade && <span style={softBadge}>{student.grade}</span>}
                      {student.subject && <span style={softBadge}>{student.subject}</span>}
                      {student.currentLevel && <span style={softBadge}>{student.currentLevel}</span>}
                    </div>
                  </div>
                  <button style={smallPrimary}>수정</button>
                </div>

                <div style={infoGrid}>
                  <Field label="학생 연락처"><PhoneInput name="phone" defaultValue={student.phone} style={miniInput} /></Field>
                  <Field label="보호자 연락처"><PhoneInput name="parentPhone" defaultValue={student.parentPhone} style={miniInput} /></Field>
                  <Field label="학교"><input name="schoolName" defaultValue={student.schoolName ?? ""} style={miniInput} /></Field>
                  <Field label="학년"><input name="grade" defaultValue={student.grade ?? ""} style={miniInput} /></Field>
                  <Field label="소속 반">
                    <select name="classGroupId" defaultValue={primaryClass?.id ?? ""} style={miniInput}>
                      <option value="">미지정</option>
                      {classGroups.map((classGroup) => (
                        <option key={classGroup.id} value={classGroup.id}>
                          {classGroup.teacher?.name ? `${classGroup.teacher.name} / ${classGroup.name}` : classGroup.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="담당 강사">
                    <select name="teacherId" defaultValue={student.teacherId ?? ""} style={miniInput}>
                      <option value="">미지정</option>
                      {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                    </select>
                  </Field>
                  <Field label="담당 조교">
                    <select name="assistantId" defaultValue={student.assistantId ?? ""} style={miniInput}>
                      <option value="">미지정</option>
                      {assistants.map((assistant) => <option key={assistant.id} value={assistant.id}>{assistant.name}</option>)}
                    </select>
                  </Field>
                  <Field label="과목/레벨">
                    <div style={twoInline}>
                      <input name="subject" defaultValue={student.subject ?? ""} style={miniInput} />
                      <input name="currentLevel" defaultValue={student.currentLevel ?? ""} style={miniInput} />
                    </div>
                  </Field>
                  <Field label="계정 상태">
                    <select name="status" defaultValue={student.status} style={miniInput}>
                      <option value="ACTIVE">재원</option>
                      <option value="WATCH">집중관리</option>
                      <option value="PAUSED">휴원</option>
                      <option value="LEFT">퇴원</option>
                    </select>
                  </Field>
                </div>

                <label style={memoLabel}>기본 메모<textarea name="memo" rows={3} defaultValue={student.memo ?? ""} style={textarea} /></label>
              </form>

              <div style={focusBox}>
                <span style={student.status === "WATCH" ? focusOn : focusOff}>집중관리</span>
                <span style={softBadge}>태그 {buildTags(student, primaryClass).length}개</span>
                <span style={softBadge}>메모 {student.memos.length}개</span>
              </div>

              <form action={deleteStudent} style={deleteForm}>
                <input type="hidden" name="studentId" value={student.id} />
                <ConfirmSubmitButton message={`${student.name} 학생을 삭제할까요? 학생 기록도 함께 정리됩니다.`} style={dangerButton}>
                  학생 삭제
                </ConfirmSubmitButton>
              </form>
            </section>

            <section style={memoCard}>
              <div style={panelHead}>
                <div style={pillTabs}>
                  <span style={pillActive}>메모</span>
                  <span style={pill}>상담일지</span>
                </div>
              </div>

              <form style={memoSearch}>
                <input type="hidden" name="tab" value={activeTab} />
                <input name="memoQ" defaultValue={memoQ} placeholder="검색" style={searchInput} />
                <button style={lightButton}>검색</button>
              </form>

              <form action={createStudentMemo} style={writeMemoForm}>
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="from" value={`/students/${student.id}?tab=${activeTab}`} />
                <div style={twoInline}>
                  <select name="type" defaultValue="GENERAL" style={miniInput}>
                    {memoTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <label style={checkLabel}><input type="checkbox" name="isImportant" /> 중요</label>
                </div>
                <textarea name="content" required rows={3} placeholder="메모를 입력하세요" style={textarea} />
                <button style={smallPrimary}>작성</button>
              </form>

              <div style={memoList}>
                {filteredMemos.map((memo) => (
                  <article key={memo.id} style={memoItem}>
                    <div style={memoTop}>
                      <div style={memoMeta}>
                        <b>{memo.writer.name}</b>
                        <span>{memoTypeText(memo.type)}</span>
                        <time>{formatDateTime(memo.createdAt)}</time>
                      </div>
                      <div style={memoActions}>
                        <form action={toggleStudentMemoImportant}>
                          <input type="hidden" name="memoId" value={memo.id} />
                          <input type="hidden" name="back" value={`/students/${student.id}?tab=${activeTab}`} />
                          <button style={memoActionButton}>{memo.isImportant ? "고정됨" : "고정"}</button>
                        </form>
                        <form action={deleteMemo}>
                          <input type="hidden" name="memoId" value={memo.id} />
                          <input type="hidden" name="back" value={`/students/${student.id}?tab=${activeTab}`} />
                          <button style={memoDeleteButton}>삭제</button>
                        </form>
                      </div>
                    </div>
                    <p style={memoText}>{memo.content}</p>
                    <details style={editDetails}>
                      <summary>수정</summary>
                      <form action={updateStudentMemo} style={editMemoForm}>
                        <input type="hidden" name="memoId" value={memo.id} />
                        <input type="hidden" name="back" value={`/students/${student.id}?tab=${activeTab}`} />
                        <select name="type" defaultValue={memo.type} style={miniInput}>
                          {memoTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <textarea name="content" required rows={3} defaultValue={memo.content} style={textarea} />
                        <label style={checkLabel}><input type="checkbox" name="isImportant" defaultChecked={memo.isImportant} /> 중요</label>
                        <button style={smallPrimary}>저장</button>
                      </form>
                    </details>
                  </article>
                ))}
                {filteredMemos.length === 0 && <Empty>메모가 없습니다.</Empty>}
              </div>
            </section>
          </aside>

          <section style={rightPanel}>
            <nav style={tabBar}>
              {tabs.map((tab) => (
                <Link key={tab.key} href={`/students/${student.id}?tab=${tab.key}`} style={activeTab === tab.key ? tabActive : tabLink}>
                  {tab.label}
                </Link>
              ))}
            </nav>

            {activeTab === "classes" && (
              <HistoryPanel title="수강 이력">
                {student.studentClasses.map((membership) => (
                  <div key={membership.id} style={recordRow}>
                    <div>
                      <b>{membership.classGroup.name}</b>
                      <p>{membership.classGroup.teacher?.name ?? "담당 미지정"} / {membership.classGroup.subject ?? student.subject ?? "과목 미지정"} / {membership.classGroup.schedule ?? "시간 미입력"}</p>
                    </div>
                    <div style={recordBadges}>
                      <span style={successBadge}>수강중</span>
                      <span style={softBadge}>{formatDate(membership.createdAt)}</span>
                    </div>
                  </div>
                ))}
                {student.studentClasses.length === 0 && <Empty>수강 중인 반이 없습니다.</Empty>}
              </HistoryPanel>
            )}

            {activeTab === "care" && (
              <HistoryPanel title="클리닉 및 상담 이력">
                <div style={formPair}>
                  <CompactRecordForm title="상담 추가" action={createCounselingRecord} studentId={student.id} type="counseling" />
                  <CompactRecordForm title="클리닉 추가" action={createClinicRecord} studentId={student.id} type="clinic" />
                </div>
                {careRecords.map((record, index) => (
                  <div key={`${record.kind}-${record.date}-${index}`} style={recordRow}>
                    <div>
                      <span style={softBadge}>{record.kind}</span>
                      <b style={recordTitle}>{record.title}</b>
                      <p>{record.content || "-"}</p>
                    </div>
                    <div style={recordBadges}>
                      <span style={statusBadge(record.status)}>{recordStatusText(record.status)}</span>
                      <span style={softBadge}>{record.date}</span>
                      <span style={softBadge}>{record.owner}</span>
                    </div>
                  </div>
                ))}
                {careRecords.length === 0 && <Empty>클리닉/상담 이력이 없습니다.</Empty>}
              </HistoryPanel>
            )}

            {activeTab === "questions" && (
              <HistoryPanel title="질문 이력">
                <form action={createQuestionRecord} style={inlineAddForm}>
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="date" name="date" defaultValue={todayKoreaDate()} style={miniInput} />
                  <input name="subject" placeholder="과목" style={miniInput} />
                  <select name="status" defaultValue="OPEN" style={miniInput}>
                    <option value="OPEN">미답변</option>
                    <option value="ANSWERED">답변 완료</option>
                    <option value="NEEDS_CHECK">추가 확인 필요</option>
                  </select>
                  <input name="content" placeholder="질문 내용" required style={wideInput} />
                  <input name="answer" placeholder="답변" style={wideInput} />
                  <button style={smallPrimary}>추가</button>
                </form>
                {student.questionRecords.map((record) => (
                  <div key={record.id} style={recordRow}>
                    <div>
                      <b>{record.subject ?? "과목 미입력"}</b>
                      <p>{record.content}</p>
                      {record.answer && <p style={answerText}>답변: {record.answer}</p>}
                    </div>
                    <div style={recordBadges}>
                      <span style={statusBadge(record.status)}>{recordStatusText(record.status)}</span>
                      <span style={softBadge}>{record.date}</span>
                      <span style={softBadge}>{record.owner?.name ?? "-"}</span>
                    </div>
                  </div>
                ))}
                {student.questionRecords.length === 0 && <Empty>질문 이력이 없습니다.</Empty>}
              </HistoryPanel>
            )}

            {activeTab === "scores" && (
              <HistoryPanel title="성적 이력">
                <ScoreAnalysisPanel analysis={scoreAnalysis} />
              </HistoryPanel>
            )}

            {activeTab === "school" && (
              <HistoryPanel title="학교 성적">
                <form action={createSchoolScoreRecord} style={inlineAddForm}>
                  <input type="hidden" name="studentId" value={student.id} />
                  <input name="term" placeholder="학기 예: 2026 1학기" required style={wideInput} />
                  <input name="examType" placeholder="중간/기말/수행" required style={miniInput} />
                  <input name="subject" placeholder="과목" required style={miniInput} />
                  <input name="score" type="number" step="0.1" placeholder="점수" style={miniInput} />
                  <input name="grade" placeholder="등급" style={miniInput} />
                  <input name="memo" placeholder="메모" style={wideInput} />
                  <button style={smallPrimary}>추가</button>
                </form>
                {Object.entries(schoolGroups).map(([subject, records]) => (
                  <SchoolScoreGroup key={subject} subject={subject} records={records} />
                ))}
                {student.schoolScoreRecords.length === 0 && <Empty>학교 성적 기록이 없습니다.</Empty>}
              </HistoryPanel>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={fieldRow}><span>{label}</span>{children}</label>;
}

function HistoryPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={historyPanel}>
      <h2 style={historyTitle}>{title}</h2>
      <div style={historyBody}>{children}</div>
    </div>
  );
}

function CompactRecordForm({ title, action, studentId, type }: { title: string; action: (formData: FormData) => void | Promise<void>; studentId: string; type: "counseling" | "clinic" }) {
  return (
    <form action={action} style={compactForm}>
      <b>{title}</b>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="date" name="date" defaultValue={todayKoreaDate()} style={miniInput} />
      <input name="title" placeholder={type === "clinic" ? "클리닉명" : "상담 제목"} required style={miniInput} />
      <select name="status" defaultValue={type === "clinic" ? "TODO" : "DONE"} style={miniInput}>
        <option value="TODO">예정</option>
        <option value="IN_PROGRESS">진행</option>
        <option value="DONE">완료</option>
        <option value="HOLD">보류</option>
      </select>
      <textarea name="content" placeholder="내용" required={type === "counseling"} rows={3} style={textarea} />
      <button style={smallPrimary}>추가</button>
    </form>
  );
}

function ScoreAnalysisPanel({ analysis }: { analysis: ScoreAnalysis }) {
  if (analysis.points.length === 0) {
    return (
      <section style={scoreAnalysisCard}>
        <div>
          <h3 style={analysisTitle}>테스트 성적 그래프</h3>
          <p style={analysisLead}>테스트 점수를 입력하면 날짜 순서대로 그래프와 분석이 자동으로 표시됩니다.</p>
        </div>
        <div style={emptyChartLarge}>분석할 테스트 성적이 없습니다.</div>
      </section>
    );
  }

  return (
    <section style={scoreAnalysisCard}>
      <div style={analysisHeader}>
        <div>
          <h3 style={analysisTitle}>테스트 성적 그래프</h3>
          <p style={analysisLead}>성적 이력의 테스트 점수를 만점 대비 100점 환산으로 분석합니다.</p>
        </div>
        <span style={softBadge}>{analysis.points.length}회 기록</span>
      </div>

      <div style={scoreMetricGrid}>
        <ScoreMetric label="평균" value={`${formatScoreValue(analysis.average)}점`} />
        <ScoreMetric label="최근" value={analysis.latest ? `${formatScoreValue(analysis.latest.percent)}점` : "-"} sub={analysis.latest?.title} />
        <ScoreMetric label="최고" value={analysis.best ? `${formatScoreValue(analysis.best.percent)}점` : "-"} sub={analysis.best?.title} />
        <ScoreMetric label="최근 변화" value={analysis.delta === null ? "-" : `${analysis.delta > 0 ? "+" : ""}${formatScoreValue(analysis.delta)}점`} tone={analysis.delta !== null && analysis.delta < -5 ? "danger" : analysis.delta !== null && analysis.delta > 5 ? "good" : "default"} />
      </div>

      <div style={analysisLayout}>
        <ScoreTrendChart points={analysis.points} />
        <div style={analysisCopy}>
          <b>{analysis.summary}</b>
          <p>{analysis.advice}</p>
          {analysis.lowest && <span style={softBadge}>보완 필요: {analysis.lowest.title} {formatScoreValue(analysis.lowest.percent)}점</span>}
        </div>
      </div>
    </section>
  );
}

function ScoreMetric({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "danger" }) {
  return (
    <div style={{ ...scoreMetric, ...(tone === "good" ? scoreMetricGood : {}), ...(tone === "danger" ? scoreMetricDanger : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function ScoreTrendChart({ points }: { points: ScorePoint[] }) {
  if (points.length === 0) return <div style={emptyChartLarge}>차트 없음</div>;

  const width = 760;
  const height = 250;
  const pad = { top: 22, right: 28, bottom: 44, left: 44 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const xFor = (index: number) => pad.left + (points.length === 1 ? graphWidth / 2 : (index * graphWidth) / (points.length - 1));
  const yFor = (value: number) => pad.top + ((100 - clamp(value, 0, 100)) / 100) * graphHeight;
  const coords = points.map((point, index) => ({ point, x: xFor(index), y: yFor(point.percent) }));
  const line = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(points.length / 7));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="테스트 성적 추이 그래프" style={scoreTrendChart}>
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = yFor(tick);
        return (
          <g key={tick}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e5e7eb" />
            <text x={pad.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{tick}</text>
          </g>
        );
      })}
      <polyline points={line} fill="none" stroke="#0b50d0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(({ point, x, y }, index) => (
        <g key={`${point.date}-${point.title}-${index}`}>
          <circle cx={x} cy={y} r="5" fill="#fff" stroke="#0b50d0" strokeWidth="3">
            <title>{`${point.title} / ${point.date} / ${point.rawScore}/${point.maxScore}점 (${formatScoreValue(point.percent)}점 환산)`}</title>
          </circle>
          <text x={x} y={y - 10} textAnchor="middle" fontSize="11" fill="#111827" fontWeight="800">{formatScoreValue(point.percent)}</text>
          {(index % labelStep === 0 || index === points.length - 1) && (
            <text x={x} y={height - 16} textAnchor="middle" fontSize="11" fill="#64748b">{point.date.slice(5)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function SchoolScoreGroup({ subject, records }: { subject: string; records: Array<{ id: string; term: string; examType: string; subject: string; score: number | null; grade: string | null; memo: string | null }> }) {
  return (
    <section style={scoreGroup}>
      <div style={scoreList}>
        <h3 style={groupTitle}>{subject}</h3>
        {records.map((record) => (
          <div key={record.id} style={scoreRow}>
            <span>{record.term}</span>
            <b>{record.examType}</b>
            <span style={scorePill}>{record.score === null ? "-" : `${record.score}점`}</span>
            <span style={softBadge}>{record.grade ?? "-"}</span>
            {record.memo && <span style={softBadge}>{record.memo}</span>}
          </div>
        ))}
      </div>
      <MiniLineChart values={records.map((record) => record.score)} />
    </section>
  );
}

function MiniLineChart({ values }: { values: Array<number | null> }) {
  const clean = values.filter((value): value is number => typeof value === "number");
  if (clean.length === 0) {
    return <div style={emptyChart}>차트 없음</div>;
  }

  const width = 220;
  const height = 82;
  const pad = 14;
  const max = Math.max(100, ...clean);
  const min = 0;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(1, values.length - 1);
    const y = value === null ? height - pad : height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={chart}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#e5e7eb" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#e5e7eb" />
      <polyline points={points.join(" ")} fill="none" stroke="#26b6b0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const [x, y] = point.split(",").map(Number);
        return <circle key={index} cx={x} cy={y} r="3.5" fill="#26b6b0" />;
      })}
    </svg>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={emptyBox}>{children}</div>;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] ? [...acc[key], item] : [item];
    return acc;
  }, {});
}

function buildScoreAnalysis(records: Array<{ date: string; title: string; score: number | null; maxScore: number }>): ScoreAnalysis {
  const points = records
    .filter((record) => typeof record.score === "number" && record.maxScore > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ko-KR"))
    .map((record) => ({
      date: record.date,
      title: record.title || "테스트",
      rawScore: record.score ?? 0,
      maxScore: record.maxScore || 100,
      percent: roundScore(((record.score ?? 0) / (record.maxScore || 100)) * 100),
    }));

  const average = points.length ? roundScore(points.reduce((sum, point) => sum + point.percent, 0) / points.length) : 0;
  const latest = points.at(-1) ?? null;
  const previous = points.at(-2) ?? null;
  const best = points.reduce<ScorePoint | null>((top, point) => (!top || point.percent > top.percent ? point : top), null);
  const lowest = points.reduce<ScorePoint | null>((low, point) => (!low || point.percent < low.percent ? point : low), null);
  const delta = latest && previous ? roundScore(latest.percent - previous.percent) : null;

  return {
    points,
    average,
    latest,
    previous,
    best,
    lowest,
    delta,
    summary: scoreSummary(points, average, latest, previous, delta),
    advice: scoreAdvice(points, average, latest, lowest, delta),
  };
}

function scoreSummary(points: ScorePoint[], average: number, latest: ScorePoint | null, previous: ScorePoint | null, delta: number | null) {
  if (points.length === 0) return "아직 분석할 테스트 성적이 없습니다.";
  if (!latest || !previous || delta === null) return `첫 테스트는 ${formatScoreValue(average)}점 환산입니다. 다음 성적부터 추세를 볼 수 있습니다.`;
  if (delta >= 5) return `최근 ${latest.title}에서 직전보다 ${formatScoreValue(delta)}점 상승했습니다.`;
  if (delta <= -5) return `최근 ${latest.title}에서 직전보다 ${formatScoreValue(Math.abs(delta))}점 하락했습니다.`;
  return `최근 점수는 직전과 큰 차이 없이 안정적으로 유지되고 있습니다.`;
}

function scoreAdvice(points: ScorePoint[], average: number, latest: ScorePoint | null, lowest: ScorePoint | null, delta: number | null) {
  if (points.length === 0) return "테스트 점수를 입력하면 평균, 최근 변화, 취약 구간을 자동으로 계산합니다.";
  if (!latest) return "최근 테스트 성적을 추가하면 더 정확한 분석을 볼 수 있습니다.";
  if (latest.percent < average - 5) return `최근 점수가 평균보다 낮습니다. ${lowest?.title ?? "낮은 점수 시험"} 범위의 오답 원인을 먼저 확인하는 편이 좋습니다.`;
  if (delta !== null && delta >= 5) return "상승세가 보입니다. 같은 풀이 루틴을 유지하면서 다음 테스트에서 실수 유형만 별도로 체크하면 좋습니다.";
  if (delta !== null && delta <= -5) return "하락세가 보여서 최근 단원 복습과 시간 배분 점검이 필요합니다.";
  if (average >= 85) return "전체 평균이 높습니다. 고난도 문항과 실수 방지 위주로 관리하면 좋습니다.";
  if (average < 60) return "기초 개념과 필수 유형을 우선 보강해야 합니다. 짧은 단위 테스트를 자주 넣는 편이 좋습니다.";
  return "평균 흐름은 중간권입니다. 점수가 낮았던 시험의 단원별 오답을 묶어서 보완하면 상승 여지가 있습니다.";
}

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

function formatScoreValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTags(student: { grade: string | null; subject: string | null; currentLevel: string | null; status: string }, classGroup?: { name: string } | null) {
  return [student.grade, student.subject, student.currentLevel, classGroup?.name, statusText[student.status]].filter(Boolean);
}

function memoTypeText(type: string) {
  return memoTypes.find(([value]) => value === type)?.[1] ?? type;
}

function recordStatusText(status: string) {
  if (status === "DONE" || status === "ANSWERED") return "완료";
  if (status === "OPEN") return "미답변";
  if (status === "NEEDS_CHECK") return "추가 확인";
  if (status === "IN_PROGRESS") return "진행";
  if (status === "HOLD") return "보류";
  if (status === "TODO") return "예정";
  return status;
}

function statusBadge(status: string): CSSProperties {
  if (status === "DONE" || status === "ANSWERED") return successBadge;
  if (status === "OPEN" || status === "NEEDS_CHECK") return warnBadge;
  return softBadge;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const page: CSSProperties = { minHeight: "100vh", padding: 18, background: "#eef1f5", color: "#111827" };
const shell: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, background: "#fff", border: "1px solid #d6dbe2", borderRadius: 18, boxShadow: "0 18px 44px rgba(15,23,42,.12)", overflow: "hidden" };
const topBar: CSSProperties = { height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "8px 18px", borderBottom: "1px solid #e5e7eb", background: "#fbfcfe" };
const backLink: CSSProperties = { color: "#6b7280", textDecoration: "none", fontSize: 12, fontWeight: 900 };
const pageTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const topActions: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const closeButton: CSSProperties = { height: 32, padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#374151", display: "inline-flex", alignItems: "center", textDecoration: "none", fontWeight: 900, fontSize: 12 };
const detailGrid: CSSProperties = { display: "grid", gridTemplateColumns: "460px minmax(0, 1fr)", gap: 12, padding: 12, minHeight: "calc(100vh - 116px)" };
const leftColumn: CSSProperties = { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 12, minHeight: 0 };
const profileCard: CSSProperties = { border: "1px solid #d6dbe2", borderRadius: 12, padding: 16, background: "#fff" };
const profileForm: CSSProperties = { display: "grid", gap: 12 };
const profileHead: CSSProperties = { display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center", gap: 10 };
const avatar: CSSProperties = { width: 42, height: 42, borderRadius: 999, background: "#eef2f7", color: "#6b7280", display: "grid", placeItems: "center", fontWeight: 950 };
const nameInput: CSSProperties = { width: "100%", border: 0, borderBottom: "1px solid transparent", fontSize: 22, fontWeight: 950, outline: "none", background: "transparent" };
const tagRow: CSSProperties = { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 4 };
const softBadge: CSSProperties = { display: "inline-flex", alignItems: "center", height: 24, padding: "0 9px", borderRadius: 999, background: "#f1f5f9", color: "#475569", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const warnBadge: CSSProperties = { ...softBadge, background: "#fef3c7", color: "#92400e" };
const successBadge: CSSProperties = { ...softBadge, background: "#21b7b6", color: "#fff" };
const infoGrid: CSSProperties = { display: "grid", gap: 2 };
const fieldRow: CSSProperties = { display: "grid", gridTemplateColumns: "112px 1fr", alignItems: "center", gap: 8, minHeight: 38, borderBottom: "1px solid #f1f5f9", color: "#6b7280", fontSize: 13, fontWeight: 900 };
const miniInput: CSSProperties = { width: "100%", height: 32, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", color: "#111827", padding: "0 8px", fontWeight: 850 };
const twoInline: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 };
const textarea: CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: 9, resize: "vertical", background: "#fff", color: "#111827", fontWeight: 850 };
const memoLabel: CSSProperties = { display: "grid", gap: 6, color: "#6b7280", fontSize: 13, fontWeight: 900 };
const smallPrimary: CSSProperties = { height: 32, border: "1px solid #111827", borderRadius: 8, background: "#111827", color: "#fff", padding: "0 12px", fontWeight: 950 };
const lightButton: CSSProperties = { height: 34, border: "1px solid #d1d5db", borderRadius: 8, background: "#f8fafc", color: "#111827", padding: "0 12px", fontWeight: 900 };
const focusBox: CSSProperties = { display: "flex", justifyContent: "center", gap: 8, padding: 10, marginTop: 12, borderRadius: 12, background: "#f8fafc" };
const focusOn: CSSProperties = { ...warnBadge, background: "#fde68a", color: "#78350f" };
const focusOff: CSSProperties = { ...softBadge };
const deleteForm: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 10 };
const dangerButton: CSSProperties = { height: 30, border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", background: "#fff", padding: "0 10px", fontWeight: 900 };
const memoCard: CSSProperties = { minHeight: 0, border: "1px solid #d6dbe2", borderRadius: 12, background: "#fff", display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", overflow: "hidden" };
const panelHead: CSSProperties = { padding: 14, borderBottom: "1px solid #e5e7eb" };
const pillTabs: CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center" };
const pill: CSSProperties = { ...softBadge, borderRadius: 8 };
const pillActive: CSSProperties = { ...softBadge, borderRadius: 8, background: "#111827", color: "#fff" };
const memoSearch: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: 12, borderBottom: "1px solid #eef2f7" };
const searchInput: CSSProperties = { ...miniInput, height: 34 };
const writeMemoForm: CSSProperties = { display: "grid", gap: 8, padding: 12, borderBottom: "1px solid #eef2f7" };
const checkLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", fontWeight: 900 };
const memoList: CSSProperties = { overflow: "auto", padding: 12, display: "grid", gap: 10 };
const memoItem: CSSProperties = { borderBottom: "1px solid #e5e7eb", paddingBottom: 10 };
const memoTop: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 };
const memoMeta: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "#6b7280" };
const memoActions: CSSProperties = { display: "flex", alignItems: "center", gap: 4 };
const memoActionButton: CSSProperties = { height: 26, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, color: "#374151", padding: "0 7px", fontSize: 11, fontWeight: 900 };
const memoDeleteButton: CSSProperties = { ...memoActionButton, borderColor: "#fecaca", color: "#991b1b" };
const memoText: CSSProperties = { whiteSpace: "pre-wrap", margin: "8px 0", lineHeight: 1.55, color: "#374151" };
const editDetails: CSSProperties = { fontSize: 12, color: "#6b7280", fontWeight: 900 };
const editMemoForm: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const rightPanel: CSSProperties = { border: "1px solid #d6dbe2", borderRadius: 12, background: "#fff", minWidth: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" };
const tabBar: CSSProperties = { display: "flex", alignItems: "center", gap: 20, padding: "0 18px", height: 58, borderBottom: "1px solid #e5e7eb", overflowX: "auto" };
const tabLink: CSSProperties = { height: 58, display: "inline-flex", alignItems: "center", color: "#6b7280", textDecoration: "none", fontSize: 16, fontWeight: 950, whiteSpace: "nowrap", borderBottom: "3px solid transparent" };
const tabActive: CSSProperties = { ...tabLink, color: "#111827", borderBottom: "3px solid #111827" };
const historyPanel: CSSProperties = { minHeight: 0, overflow: "auto", padding: "20px 22px" };
const historyTitle: CSSProperties = { margin: "0 0 18px", fontSize: 18, fontWeight: 950 };
const historyBody: CSSProperties = { display: "grid", gap: 12 };
const recordRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", borderBottom: "1px solid #e5e7eb", padding: "12px 0" };
const recordTitle: CSSProperties = { display: "block", marginTop: 5 };
const recordBadges: CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const formPair: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const compactForm: CSSProperties = { display: "grid", gap: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fbfcfe" };
const inlineAddForm: CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fbfcfe" };
const scoreAnalysisCard: CSSProperties = { border: "1px solid #dbe3ef", borderRadius: 10, padding: 14, background: "#fbfdff", display: "grid", gap: 12 };
const analysisHeader: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" };
const analysisTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const analysisLead: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13, fontWeight: 850 };
const scoreMetricGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8 };
const scoreMetric: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: "10px 11px", display: "grid", gap: 3, minHeight: 76 };
const scoreMetricGood: CSSProperties = { border: "1px solid var(--asc-primary)", background: "var(--asc-primary-soft)" };
const scoreMetricDanger: CSSProperties = { border: "1px solid #fecaca", background: "#fef2f2" };
const analysisLayout: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 300px)", gap: 12, alignItems: "center" };
const scoreTrendChart: CSSProperties = { width: "100%", minHeight: 220, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" };
const analysisCopy: CSSProperties = { display: "grid", gap: 9, color: "#374151", fontSize: 14, lineHeight: 1.55 };
const emptyChartLarge: CSSProperties = { minHeight: 180, display: "grid", placeItems: "center", color: "#9ca3af", fontSize: 13, fontWeight: 900, border: "1px dashed #d1d5db", borderRadius: 10, background: "#fff" };
const wideInput: CSSProperties = { ...miniInput, width: 180 };
const answerText: CSSProperties = { marginTop: 4, color: "#083891" };
const scoreGroup: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 240px", gap: 16, alignItems: "center", borderBottom: "1px solid #e5e7eb", padding: "16px 0" };
const scoreList: CSSProperties = { display: "grid", gap: 8 };
const groupTitle: CSSProperties = { margin: "0 0 6px", fontSize: 17, fontWeight: 950 };
const scoreRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14 };
const scorePill: CSSProperties = { ...softBadge, background: "#fff", border: "1px solid #d1d5db", color: "#111827" };
const chart: CSSProperties = { width: "100%", maxWidth: 230, background: "#fff" };
const emptyChart: CSSProperties = { height: 82, display: "grid", placeItems: "center", color: "#9ca3af", fontSize: 12, fontWeight: 900, border: "1px dashed #d1d5db", borderRadius: 10 };
const emptyBox: CSSProperties = { padding: 18, color: "#6b7280", fontWeight: 900, textAlign: "center", border: "1px dashed #d1d5db", borderRadius: 10, background: "#fbfcfe" };
