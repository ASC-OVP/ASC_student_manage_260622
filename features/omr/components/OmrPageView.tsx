import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { ButtonLink, Notice, PageHeader } from "@/components/ui";
import OmrCloseButton from "@/features/omr/components/OmrCloseButton";
import OmrExamDeleteButton from "@/features/omr/components/OmrExamDeleteButton";
import OmrExamTableRow from "@/features/omr/components/OmrExamTableRow";
import OmrMultiUploadForm from "@/features/omr/components/OmrMultiUploadForm";
import OmrReviewPreview from "@/features/omr/components/OmrReviewPreview";
import OmrUploadDeleteButton from "@/features/omr/components/OmrUploadDeleteButton";
import { requireUser } from "@/lib/auth";
import { ClassTestType, ExamResultStatus, OmrAnswerStatus, OmrTemplateType } from "@/lib/generated/prisma";
import { getOmrTemplate, omrTemplateList, type OmrTemplateQuestion } from "@/features/omr/lib/omrTemplates";
import { OMR_MAX_BATCH_LABEL, OMR_MAX_FILE_LABEL } from "@/features/omr/lib/omrUploadLimits";
import { prisma } from "@/lib/prisma";
import { createExamAction, deleteExamAction, saveAnswerKeyAction } from "@/features/omr/actions/examActions";
import { deleteOmrUploadAction } from "@/features/omr/actions/uploadActions";
import { applyOmrResultsToStudentScoresAction, gradeOmrAction, gradeSelectedOmrUploadsAction } from "@/features/omr/actions/gradingActions";
import { recognizeSelectedOmrUploadsAction } from "@/features/omr/actions/recognizeActions";
import { saveOmrCorrectionsAction } from "@/features/omr/actions/correctionActions";
import { updateOmrUploadMatchAction, updateOmrUploadSetupAction } from "@/features/omr/actions/matchActions";

type Props = {
  searchParams: Promise<{
    examId?: string;
    uploadId?: string;
    mode?: string;
    new?: string;
    q?: string;
    date?: string;
    classGroupId?: string;
    classTestId?: string;
    targetLessonId?: string;
    templateType?: string;
    status?: string;
    pageSize?: string;
    uploadError?: string;
    uploadWarning?: string;
    skipped?: string;
    applyError?: string;
    overwrite?: string;
    applied?: string;
  }>;
};

const answerStatusOptions = [
  [OmrAnswerStatus.MANUAL, "수동 입력"],
  [OmrAnswerStatus.RECOGNIZED, "자동 인식"],
  [OmrAnswerStatus.BLANK, "미응답"],
  [OmrAnswerStatus.MULTIPLE, "중복 마킹"],
  [OmrAnswerStatus.REVIEW_NEEDED, "검수 필요"],
] as const;

type StudentOption = { id: string; name: string; schoolName: string | null; grade: string | null; phone: string | null; parentPhone: string | null };
type StudentBrief = { id: string; name: string; schoolName: string | null; grade: string | null };
type ClassLessonLite = { id: string; position: number; title: string; lessonDate: string | null };
type ClassTestLite = {
  id: string;
  name: string;
  type: ClassTestType;
  subject: string | null;
  totalScore: number | null;
  questionCount: number | null;
  classLessonId: string | null;
  lessonPosition: number | null;
  templateType: OmrTemplateType;
  exams: Array<{ id: string; classLessonId: string | null; lessonPosition: number | null; title: string; examDate: string | null }>;
};
type ClassGroupLite = { id: string; name: string; subject: string | null; grade: string | null; startDate: string | null; endDate: string | null; daysOfWeek: string | null; startTime: string | null; endTime: string | null; schedule: string | null };
type OmrClassGroupOption = ClassGroupLite & { lessons: ClassLessonLite[]; classTests: ClassTestLite[] };
type AnswerKeyLite = { questionNo: number; answer: string; score: number };
type RecognizedAnswerLite = {
  questionNo: number;
  recognizedAnswer: string | null;
  correctedAnswer: string | null;
  finalAnswer?: string | null;
  status: OmrAnswerStatus;
  confidence: number | null;
};
type ResultItemLite = { questionNo: number; status: ExamResultStatus; studentAnswer: string | null; correctAnswer: string | null; score: number };
type ResultSummary = {
  totalScore: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  reviewNeededCount: number;
};
type ResultWithItems = ResultSummary & { items: ResultItemLite[] };
type ExamUploadLite = {
  id: string;
  studentId: string | null;
  examId: string | null;
  templateType: OmrTemplateType;
  phoneLast8: string | null;
  phoneRecognizeStatus: string;
  matchStatus: string;
  recognizeStatus: string;
  gradingStatus: string;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  filePath: string | null;
  previewImagePath: string | null;
  createdAt: Date;
  student: StudentBrief | null;
  recognizedAnswers: Array<{ status: OmrAnswerStatus }>;
  results: ResultWithItems[];
};
type ExamWithUploads = {
  id: string;
  classGroupId: string | null;
  classTestId: string | null;
  classLessonId: string | null;
  lessonPosition: number | null;
  totalScore: number | null;
  title: string;
  subject: string | null;
  classTest: { id: string; name: string; type: ClassTestType; totalScore: number | null; questionCount: number | null } | null;
  classLesson: { id: string; position: number; title: string; lessonDate: string | null } | null;
  examDate: string | null;
  templateType: OmrTemplateType;
  questionCount: number;
  createdAt: Date;
  answerKeys: AnswerKeyLite[];
  uploads: ExamUploadLite[];
  results: ResultSummary[];
  testScores: Array<{ id: string }>;
};
type SelectedUpload = Omit<ExamUploadLite, "student" | "recognizedAnswers" | "results"> & {
  student: StudentOption | null;
  exam: ({ answerKeys: AnswerKeyLite[] } & { id: string; title: string; templateType: OmrTemplateType; questionCount: number }) | null;
  recognizedAnswers: RecognizedAnswerLite[];
  results: ResultWithItems[];
};

export const dynamic = "force-dynamic";

export default async function OmrPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  if (sp.uploadId) redirect(`/omr/uploads/${sp.uploadId}`);

  const canManageExam = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "TEACHER";
  const q = sp.q?.trim() ?? "";
  const dateFilter = sp.date ?? "";
  const classGroupFilter = sp.classGroupId ?? "";
  const classTestFilter = sp.classTestId ?? "";
  const targetLessonFilter = sp.targetLessonId ?? "";
  const templateFilter = sp.templateType ?? "";
  const statusFilter = sp.status ?? "";
  const pageSize = Number(sp.pageSize || 20);
  const uploadNotice = uploadNoticeMessage(sp.uploadError, sp.uploadWarning, sp.skipped);
  const selectedMode = sp.mode ?? (sp.examId ? "results" : "");
  const showNewSheet = sp.new === "1";

  const [exams, students, classGroups] = await Promise.all([
    prisma.exam.findMany({
      where: { academyId: user.academyId, ...(classGroupFilter ? { classGroupId: classGroupFilter } : {}) },
      orderBy: [{ createdAt: "desc" }],
      include: {
        answerKeys: true,
        uploads: {
          include: {
            student: { select: { id: true, name: true, schoolName: true, grade: true } },
            recognizedAnswers: { select: { status: true } },
            results: { orderBy: { createdAt: "desc" }, take: 1, include: { items: { orderBy: { questionNo: "asc" } } } },
          },
          orderBy: { createdAt: "desc" },
        },
        results: { orderBy: { createdAt: "desc" } },
        testScores: { select: { id: true } },
        classTest: { select: { id: true, name: true, type: true, totalScore: true, questionCount: true } },
        classLesson: { select: { id: true, position: true, title: true, lessonDate: true } },
      },
    }),
    prisma.student.findMany({
      where: { academyId: user.academyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, schoolName: true, grade: true, phone: true, parentPhone: true },
    }),
    prisma.classGroup.findMany({
      where: { academyId: user.academyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subject: true,
        grade: true,
        startDate: true,
        endDate: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        schedule: true,
        lessons: { orderBy: { position: "asc" }, select: { id: true, position: true, title: true, lessonDate: true } },
        classTests: {
          where: { active: true },
          orderBy: [{ type: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            type: true,
            subject: true,
            totalScore: true,
            questionCount: true,
            classLessonId: true,
            lessonPosition: true,
            templateType: true,
            exams: { orderBy: [{ lessonPosition: "asc" }, { createdAt: "desc" }], select: { id: true, classLessonId: true, lessonPosition: true, title: true, examDate: true } },
          },
        },
      },
    }),
  ]);

  const typedClassGroups = classGroups as OmrClassGroupOption[];
  const classGroupById: Map<string, ClassGroupLite> = new Map(typedClassGroups.map((classGroup) => [classGroup.id, classGroup]));
  const newSheetClassGroup = showNewSheet && classGroupFilter ? typedClassGroups.find((classGroup) => classGroup.id === classGroupFilter) ?? null : null;
  const newSheetClassTest = newSheetClassGroup && classTestFilter ? newSheetClassGroup.classTests.find((test) => test.id === classTestFilter) ?? null : null;
  const newSheetLessonOptions = newSheetClassGroup ? omrLessonsForClassGroup(newSheetClassGroup) : [];
  const newSheetTargetLesson = targetLessonFilter ? newSheetLessonOptions.find((lesson) => omrLessonFormValue(lesson) === targetLessonFilter || lesson.id === targetLessonFilter) ?? null : null;
  const records = exams
    .map((exam) => makeExamRecord(exam, classGroupById))
    .filter((record) =>
      !q ||
      record.title.toLowerCase().includes(q.toLowerCase()) ||
      record.subject.toLowerCase().includes(q.toLowerCase()) ||
      record.classGroupName.toLowerCase().includes(q.toLowerCase())
    )
    .filter((record) => !dateFilter || record.examDate === dateFilter)
    .filter((record) => !templateFilter || record.templateType === templateFilter)
    .filter((record) => !statusFilter || record.status === statusFilter)
    .slice(0, Number.isFinite(pageSize) ? pageSize : 20);

  const selectedExam = sp.examId ? exams.find((exam) => exam.id === sp.examId) ?? null : null;
  const selectedRecord = selectedExam ? makeExamRecord(selectedExam, classGroupById) : null;
  const selectedUpload = sp.uploadId
    ? await prisma.omrUpload.findFirst({
        where: { id: sp.uploadId, academyId: user.academyId },
        include: {
          student: true,
          exam: { include: { answerKeys: true } },
          recognizedAnswers: { orderBy: { questionNo: "asc" } },
          results: { orderBy: { createdAt: "desc" }, take: 1, include: { items: { orderBy: { questionNo: "asc" } } } },
        },
      })
    : null;

  const selectedTemplate = getOmrTemplate(selectedUpload?.templateType ?? selectedExam?.templateType ?? OmrTemplateType.OTHER);
  const selectedAnswerKeys = selectedUpload?.exam?.answerKeys ?? selectedExam?.answerKeys ?? [];
  const keyByNo = new Map(selectedAnswerKeys.map((key) => [key.questionNo, key]));
  const recognizedByNo = new Map(selectedUpload?.recognizedAnswers.map((answer) => [answer.questionNo, answer]) ?? []);
  const latestResult = selectedUpload?.results[0] ?? null;
  const resultItemByNo = new Map(latestResult?.items.map((item) => [item.questionNo, item]) ?? []);
  const closeUploadHref = selectedUpload?.examId ? `/omr?examId=${selectedUpload.examId}&mode=results` : "/omr";

  return (
    <main style={page}>
      <section style={container}>
        <div style={topBar}>
          <PageHeader
            eyebrow="OMR 검사"
            title="OMR 검사 기록"
            description="검사 생성부터 정답 입력, 업로드, 인식, 검수, 채점, 결과 확인까지 단계별로 처리합니다."
            actions={<ButtonLink href={classGroupFilter ? `/omr?new=1&classGroupId=${encodeURIComponent(classGroupFilter)}` : "/omr?new=1"} size="sm">OMR 검사 생성</ButtonLink>}
          />
        </div>

        {uploadNotice && <Notice tone={uploadNotice.tone === "error" ? "danger" : "warning"}>{uploadNotice.message}</Notice>}

        <OmrWorkflow
          exam={selectedExam}
          record={selectedRecord}
          selectedMode={selectedMode}
          showNewSheet={showNewSheet}
          uploadNotice={uploadNotice}
          canManageExam={canManageExam}
        />

        <form className="asc-filter-bar" style={filterBar}>
          <input name="q" defaultValue={q} placeholder="검사명 또는 과목 검색" style={filterInput} />
          <input name="date" type="date" defaultValue={dateFilter} style={filterInput} />
          <select name="classGroupId" defaultValue={classGroupFilter} style={filterSelect}>
            <option value="">전체 반</option>
            {typedClassGroups.map((classGroup) => (
              <option key={classGroup.id} value={classGroup.id}>
                {classGroup.name}{classGroup.grade ? ` / ${classGroup.grade}` : ""}
              </option>
            ))}
          </select>
          <select name="templateType" defaultValue={templateFilter} style={filterSelect}>
            <option value="">전체 템플릿</option>
            {omrTemplateList.map((template) => (
              <option key={template.type} value={template.type}>{template.label}</option>
            ))}
          </select>
          <select name="status" defaultValue={statusFilter} style={filterSelect}>
            <option value="">전체 상태</option>
            <option value="WAITING">대기</option>
            <option value="NEEDS_MATCH">매칭 필요</option>
            <option value="REVIEW_NEEDED">검수 필요</option>
            <option value="GRADED">채점 완료</option>
            <option value="REGISTERED">등록 완료</option>
            <option value="FAILED">실패</option>
          </select>
          <select name="pageSize" defaultValue={String(pageSize || 20)} style={filterSelect}>
            <option value="10">10개</option>
            <option value="20">20개</option>
            <option value="50">50개</option>
          </select>
          <button style={smallButton}>적용</button>
          <Link href="/omr" style={lightButton}>초기화</Link>
        </form>

        <section style={card}>
          <div style={sectionHead}>
            <h2 style={sectionTitle}>검사 목록</h2>
            <span style={muted}>{records.length}건</span>
          </div>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <Th>검사명 / 시험</Th>
                  <Th>반</Th>
                  <Th>과목</Th>
                  <Th>날짜</Th>
                  <Th>상태</Th>
                  <Th>파일</Th>
                  <Th>매칭</Th>
                  <Th>인식</Th>
                  <Th>검수</Th>
                  <Th>평균</Th>
                  <Th>최고</Th>
                  <Th>등록</Th>
                  <Th>관리</Th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <OmrExamTableRow key={record.id} href={`/omr?examId=${record.id}&mode=results`} selected={selectedExam?.id === record.id}>
                    <Td>
                      <b>{record.title}</b>
                      <div style={subText}>{templateLabel(record.templateType)} / {record.questionCount}문항</div>
                    </Td>
                    <Td>{record.classGroupName || "-"}</Td>
                    <Td>{record.subject || "-"}</Td>
                    <Td>
                      {record.examDate ? formatDate(record.examDate) : "-"}
                      <div style={subText}>생성 {formatDate(record.createdAt)}</div>
                    </Td>
                    <Td><StatusBadge tone={recordTone(record.status)}>{recordStatusText(record.status)}</StatusBadge></Td>
                    <Td>{record.totalFiles}</Td>
                    <Td>{record.matchedCount}/{record.totalFiles}</Td>
                    <Td>{record.recognizedCount}/{record.totalFiles}</Td>
                    <Td>{record.reviewNeededCount}</Td>
                    <Td>{record.averageScore === null ? "-" : `${record.averageScore}`}</Td>
                    <Td>{record.highScore === null ? "-" : `${record.highScore}`}</Td>
                    <Td>{record.registeredCount}</Td>
                    <Td>
                      <div style={actionLinks}>
                        <Link href={`/omr?examId=${record.id}&mode=answers`} style={resultButton}>정답</Link>
                        <Link href={`/omr?examId=${record.id}&mode=upload`} style={resultButton}>업로드</Link>
                        <Link href={`/omr?examId=${record.id}&mode=results`} style={resultButton}>학생</Link>
                        {record.firstReviewUploadId && (
                          <Link href={`/omr/uploads/${record.firstReviewUploadId}`} style={resultButton}>답안 확인</Link>
                        )}
                        <form action={deleteExamAction} style={inlineDeleteForm}>
                          <input type="hidden" name="examId" value={record.id} />
                          <OmrExamDeleteButton examTitle={record.title} totalFiles={record.totalFiles} />
                        </form>
                      </div>
                    </Td>
                  </OmrExamTableRow>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={13} style={emptyCell}>아직 OMR 검사 기록이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedExam && selectedRecord && selectedMode === "results" && (
          <ExamDetail
            exam={selectedExam}
            record={selectedRecord}
            students={students}
            applyError={sp.applyError ?? ""}
            overwriteCount={Number(sp.overwrite || 0) || 0}
            appliedCount={Number(sp.applied || 0) || 0}
          />
        )}
      </section>

      {showNewSheet && (
        <NewOmrExamSheet classGroups={typedClassGroups} selectedClassGroup={newSheetClassGroup} selectedClassTest={newSheetClassTest} selectedLesson={newSheetTargetLesson} canManageExam={canManageExam} />
      )}

      {selectedExam && selectedMode === "answers" && (
        <RightSheet title="정답 입력" closeHref="/omr" wide>
          <section style={sheetSection}>
            <div style={sectionHead}>
              <div>
                <h3 style={sheetTitle}>{selectedExam.title}</h3>
                <p style={muted}>{selectedRecord?.classGroupName || "반 미지정"} / {selectedExam.subject || selectedTemplate.subject} / {selectedExam.questionCount}문항</p>
              </div>
              <StatusBadge tone={selectedExam.answerKeys.length > 0 ? "green" : "yellow"}>
                {selectedExam.answerKeys.length > 0 ? "정답 입력됨" : "정답 필요"}
              </StatusBadge>
            </div>
            <form action={saveAnswerKeyAction} style={stack}>
              <input type="hidden" name="examId" value={selectedExam.id} />
              <AnswerKeyGrid questions={selectedTemplate.questions.slice(0, selectedExam.questionCount)} keyByNo={keyByNo} />
              <button style={primaryButton} disabled={!canManageExam}>정답 저장</button>
            </form>
          </section>
        </RightSheet>
      )}

      {selectedExam && selectedMode === "upload" && (
        <RightSheet title="OMR 파일 업로드" closeHref={`/omr?examId=${selectedExam.id}&mode=results`}>
          <section style={sheetSection}>
            <h3 style={sheetTitle}>{selectedExam.title}</h3>
            <p style={muted}>{selectedRecord?.classGroupName || "반 미지정"} / {selectedExam.subject || selectedTemplate.subject} / {selectedExam.questionCount}문항</p>
            <div style={divider} />
            <OmrMultiUploadForm exams={[{ id: selectedExam.id, title: selectedExam.title }]} selectedExamId={selectedExam.id} />
          </section>
        </RightSheet>
      )}

      {selectedUpload && (
        <RightSheet title="OMR 결과 검수" closeHref={closeUploadHref} wide>
          <UploadReview
            upload={selectedUpload}
            reviewUploads={selectedExam?.uploads ?? []}
            template={selectedTemplate}
            keyByNo={keyByNo}
            recognizedByNo={recognizedByNo}
            latestResult={latestResult}
            resultItemByNo={resultItemByNo}
            students={students}
            exams={exams.map((exam) => ({ id: exam.id, title: exam.title }))}
          />
        </RightSheet>
      )}
    </main>
  );
}

function NewOmrExamSheet({
  classGroups,
  selectedClassGroup,
  selectedClassTest,
  selectedLesson,
  canManageExam,
}: {
  classGroups: OmrClassGroupOption[];
  selectedClassGroup: OmrClassGroupOption | null;
  selectedClassTest: ClassTestLite | null;
  selectedLesson: ClassLessonLite | null;
  canManageExam: boolean;
}) {
  const availableTests = selectedClassGroup?.classTests ?? [];
  const lessonOptions = selectedClassGroup ? omrLessonsForClassGroup(selectedClassGroup) : [];
  const singleLesson = selectedClassGroup && selectedClassTest?.type === ClassTestType.SINGLE ? classLessonForClassTest(selectedClassTest, lessonOptions) : null;

  return (
    <RightSheet title={"\uC0C8 OMR \uAC80\uC0AC"} closeHref="/omr">
      <section style={sheetSection}>
        <h3 style={sheetTitle}>{"1. \uBC18 \uC120\uD0DD"}</h3>
        <form action="/omr" style={twoCols}>
          <input type="hidden" name="new" value="1" />
          <select name="classGroupId" defaultValue={selectedClassGroup?.id ?? ""} style={input} required>
            <option value="">{"\uBC18 \uC120\uD0DD"}</option>
            {classGroups.map((classGroup) => (
              <option key={classGroup.id} value={classGroup.id}>
                {classGroup.name}{classGroup.grade ? " / " + classGroup.grade : ""}
              </option>
            ))}
          </select>
          <button style={secondaryButton}>{"\uBC18 \uC801\uC6A9"}</button>
        </form>
        {selectedClassGroup ? (
          <div style={sheetSubtleBox}>
            <b>{selectedClassGroup.name}</b>
            <span>{selectedClassGroup.subject || "\uACFC\uBAA9 \uBBF8\uC9C0\uC815"}{selectedClassGroup.grade ? " / " + selectedClassGroup.grade : ""}</span>
          </div>
        ) : null}
      </section>

      {selectedClassGroup ? (
        <section style={sheetSection}>
          <div style={sectionHead}>
            <h3 style={sheetTitle}>{"2. \uC2DC\uD5D8 \uC120\uD0DD"}</h3>
            <span style={muted}>{availableTests.length + "\uAC1C"}</span>
          </div>
          {availableTests.length > 0 ? (
            <form action="/omr" style={twoCols}>
              <input type="hidden" name="new" value="1" />
              <input type="hidden" name="classGroupId" value={selectedClassGroup.id} />
              <select name="classTestId" defaultValue={selectedClassTest?.id ?? ""} style={input} required>
                <option value="">{"\uC2DC\uD5D8 \uC120\uD0DD"}</option>
                {availableTests.map((test) => (
                  <option key={test.id} value={test.id}>{omrClassTestOptionLabel(test, lessonOptions)}</option>
                ))}
              </select>
              <button style={secondaryButton}>{"\uC2DC\uD5D8 \uC801\uC6A9"}</button>
            </form>
          ) : (
            <div style={sheetSubtleBox}>
              <span>{"\uC774 \uBC18\uC5D0 \uB4F1\uB85D\uB41C \uC2DC\uD5D8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD559\uC0DD\uD604\uD669\uD310\uC758 \uC2DC\uD5D8 \uAD00\uB9AC\uC5D0\uC11C \uBA3C\uC800 \uB4F1\uB85D\uD558\uC138\uC694."}</span>
              <Link href={"/students?classGroupId=" + encodeURIComponent(selectedClassGroup.id)} style={smallButton}>{"\uC2DC\uD5D8 \uAD00\uB9AC\uB85C \uC774\uB3D9"}</Link>
            </div>
          )}
        </section>
      ) : null}

      {selectedClassGroup && selectedClassTest?.type === ClassTestType.REGULAR ? (
        <section style={sheetSection}>
          <h3 style={sheetTitle}>{"3. \uCC28\uC2DC \uC120\uD0DD"}</h3>
          <form action={createExamAction} style={omrCreateForm}>
            <input type="hidden" name="classGroupId" value={selectedClassGroup.id} />
            <input type="hidden" name="classTestId" value={selectedClassTest.id} />
            <div>
              <b>{selectedClassTest.name}</b>
              <p style={testChoiceMeta}>{classTestTypeText(selectedClassTest.type)}</p>
            </div>
            <select name="targetLessonId" defaultValue={selectedLesson ? omrLessonFormValue(selectedLesson) : ""} style={input} required>
              <option value="">{"\uBA87 \uCC28\uC2DC \uC2DC\uD5D8\uC778\uC9C0 \uC120\uD0DD"}</option>
              {lessonOptions.map((lesson) => (
                <option key={lesson.id} value={omrLessonFormValue(lesson)}>{lessonLabel(lesson)}</option>
              ))}
            </select>
            <OmrCreateSettingsFields />
            <button style={smallButton} disabled={!canManageExam}>{"\uAC80\uC0AC \uC0DD\uC131"}</button>
          </form>
        </section>
      ) : null}

      {selectedClassGroup && selectedClassTest?.type === ClassTestType.SINGLE ? (
        <section style={sheetSection}>
          <h3 style={sheetTitle}>{"3. \uAC80\uC0AC \uC0DD\uC131"}</h3>
          {singleLesson ? (
            <form action={createExamAction} style={omrCreateForm}>
              <input type="hidden" name="classGroupId" value={selectedClassGroup.id} />
              <input type="hidden" name="classTestId" value={selectedClassTest.id} />
              <input type="hidden" name="targetLessonId" value={omrLessonFormValue(singleLesson)} />
              <div>
                <b>{selectedClassTest.name}</b>
                <p style={testChoiceMeta}>{classTestTypeText(selectedClassTest.type)} / {singleClassTestDateLabel(selectedClassTest, lessonOptions)}</p>
              </div>
              <OmrCreateSettingsFields />
              <button style={smallButton} disabled={!canManageExam}>{"\uAC80\uC0AC \uC0DD\uC131"}</button>
            </form>
          ) : (
            <div style={sheetSubtleBox}>
              <span>{"\uB2E8\uC77C \uC2DC\uD5D8\uC5D0 \uC5F0\uACB0\uB41C \uCC28\uC2DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC2DC\uD5D8 \uAD00\uB9AC\uC5D0\uC11C \uC5F0\uACB0\uCC28\uC2DC\uB97C \uB2E4\uC2DC \uC120\uD0DD\uD558\uC138\uC694."}</span>
            </div>
          )}
        </section>
      ) : null}
    </RightSheet>
  );
}

function OmrCreateSettingsFields() {
  return (
    <div style={omrCreateSettingsGrid}>
      <label style={omrCreateFieldLabel}>
        {"OMR \uD15C\uD50C\uB9BF"}
        <select name="templateType" defaultValue={OmrTemplateType.OTHER} style={input}>
          {omrTemplateList.map((template) => (
            <option key={template.type} value={template.type}>{template.label}</option>
          ))}
        </select>
      </label>
      <label style={omrCreateFieldLabel}>
        {"\uBB38\uD56D\uC218"}
        <input name="questionCount" type="number" min={1} max={200} placeholder="20" style={input} />
      </label>
      <label style={omrCreateFieldLabel}>
        {"\uCD1D\uC810"}
        <input name="totalScore" type="number" min={1} max={1000} placeholder="100" style={input} />
      </label>
    </div>
  );
}

const omrFallbackLessonCount = 12;
const omrMaxGeneratedLessons = 80;

type OmrLessonClassGroup = Pick<OmrClassGroupOption, "lessons" | "startDate" | "endDate" | "daysOfWeek" | "startTime" | "endTime" | "schedule">;

function omrLessonsForClassGroup(classGroup: OmrLessonClassGroup) {
  if (classGroup.lessons.length > 0) return classGroup.lessons;
  const scheduled = scheduledOmrLessons(classGroup);
  if (scheduled.length > 0) return scheduled;
  return Array.from({ length: omrFallbackLessonCount }, (_, index) => generatedOmrLesson(index + 1));
}

function generatedOmrLesson(position: number, lessonDate?: string | null): ClassLessonLite {
  return {
    id: "lesson_" + String(position),
    position,
    title: String(position) + "\uCC28\uC2DC",
    lessonDate: lessonDate ?? null,
  };
}

function omrLessonFormValue(lesson: ClassLessonLite) {
  return lesson.id;
}

function classLessonForClassTest(test: ClassTestLite, lessons: ClassLessonLite[]) {
  return (
    (test.classLessonId ? lessons.find((lesson) => lesson.id === test.classLessonId) ?? null : null) ??
    (test.lessonPosition ? lessons.find((lesson) => lesson.position === test.lessonPosition) ?? null : null) ??
    null
  );
}

function singleClassTestDateLabel(test: ClassTestLite, lessons: ClassLessonLite[]) {
  const lesson = classLessonForClassTest(test, lessons);
  const examDate = test.exams.find((exam) => exam.examDate)?.examDate?.slice(0, 10) ?? null;
  return lesson?.lessonDate ?? examDate ?? "\uB0A0\uC9DC \uBBF8\uC815";
}

function omrClassTestOptionLabel(test: ClassTestLite, lessons: ClassLessonLite[]) {
  if (test.type === ClassTestType.SINGLE) return test.name + " / " + classTestTypeText(test.type) + " / " + singleClassTestDateLabel(test, lessons);
  return test.name + " / " + classTestTypeText(test.type);
}

function scheduledOmrLessons(classGroup: OmrLessonClassGroup) {
  const days = parseOmrDaysOfWeek(classGroup.daysOfWeek, classGroup.schedule);
  const start = parseOmrLocalDate(classGroup.startDate) ?? firstUpcomingOmrClassDate(days);
  const end = parseOmrLocalDate(classGroup.endDate) ?? addOmrDays(start, 90);
  if (!start || !end || days.length === 0) return [];

  const daySet = new Set(days);
  const lessons: ClassLessonLite[] = [];
  for (let cursor = start; cursor <= end && lessons.length < omrMaxGeneratedLessons; cursor = addOmrDays(cursor, 1)) {
    if (!daySet.has(cursor.getDay())) continue;
    lessons.push(generatedOmrLesson(lessons.length + 1, formatOmrDateInput(cursor)));
  }
  return lessons;
}

function parseOmrDaysOfWeek(daysOfWeek?: string | null, schedule?: string | null) {
  const source = String(daysOfWeek ?? "") + " " + String(schedule ?? "");
  const days = new Set<number>();
  const koreanDayMap: Record<string, number> = { "\uC77C": 0, "\uC6D4": 1, "\uD654": 2, "\uC218": 3, "\uBAA9": 4, "\uAE08": 5, "\uD1A0": 6 };
  for (const char of source) {
    if (char in koreanDayMap) days.add(koreanDayMap[char]);
  }
  const tokenMap: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };
  for (const token of source.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (token in tokenMap) days.add(tokenMap[token]);
    const numeric = Number(token);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) days.add(numeric);
  }
  return [...days].sort((a, b) => a - b);
}

function parseOmrLocalDate(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addOmrDays(date: Date | null, days: number) {
  const base = date ? new Date(date) : new Date();
  base.setDate(base.getDate() + days);
  return base;
}

function firstUpcomingOmrClassDate(days: number[]) {
  if (days.length === 0) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = addOmrDays(base, offset);
    if (days.includes(candidate.getDay())) return candidate;
  }
  return base;
}

function formatOmrDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}
function classTestTypeText(type: ClassTestType) {
  return type === ClassTestType.REGULAR ? "\uC815\uAE30 \uC2DC\uD5D8" : "\uB2E8\uC77C \uC2DC\uD5D8";
}

function lessonLabel(lesson: ClassLessonLite) {
  return String(lesson.position) + "\uCC28\uC2DC" + (lesson.title ? " / " + lesson.title : "") + (lesson.lessonDate ? " / " + lesson.lessonDate : "");
}

function OmrWorkflow({
  exam,
  record,
  selectedMode,
  showNewSheet,
  uploadNotice,
  canManageExam,
}: {
  exam: ExamWithUploads | null;
  record: ExamRecord | null;
  selectedMode: string;
  showNewSheet: boolean;
  uploadNotice: ReturnType<typeof uploadNoticeMessage>;
  canManageExam: boolean;
}) {
  const workflow = getWorkflowState(exam, record, selectedMode, showNewSheet);
  const insights = exam ? buildResultInsights(exam) : null;
  const template = exam ? getOmrTemplate(exam.templateType) : null;
  const answerCount = exam?.answerKeys.length ?? 0;
  const uploads = exam?.uploads ?? [];
  const hasAnswers = answerCount > 0;
  const canRecognizeAll = uploads.length > 0;
  const canGradeAll = Boolean(exam && uploads.length > 0 && hasAnswers);
  const gradeableCount = uploads.filter((upload) =>
    upload.studentId &&
    (upload.recognizeStatus === "RECOGNIZED" || upload.recognizeStatus === "REVIEW_NEEDED" || upload.results.length > 0)
  ).length;

  return (
    <section style={workflowPanel}>
      <WorkflowStepper activeStep={workflow.currentStep} completedSteps={workflow.completedSteps} />

      {exam && record ? (
        <SelectedExamSummary exam={exam} record={record} />
      ) : (
        <div style={workflowEmptyState}>
          <div>
            <h2 style={sectionTitle}>시험을 먼저 선택하세요</h2>
            <p style={muted}>아래 검사 목록에서 시험을 선택하거나 새 OMR 검사를 만든 뒤 정답, 업로드, 채점 순서로 진행합니다.</p>
          </div>
          <Link href="/omr?new=1" style={smallButton}>+ OMR 검사</Link>
        </div>
      )}

      <div style={workflowGrid}>
        <WorkflowStageCard
          stepNo={1}
          title="시험/반 선택"
          active={workflow.currentStep === 1}
          complete={workflow.completedSteps.has(1)}
        >
          {exam && record ? (
            <>
              <p style={stageMainText}>{exam.title}</p>
              <p style={muted}>
                {record.classGroupName || "반 미지정"} / {exam.subject || template?.subject || "-"} / {exam.examDate ? formatDate(exam.examDate) : "날짜 미지정"}
              </p>
            </>
          ) : (
            <p style={muted}>검사 목록에서 시험을 누르면 선택한 시험 기준으로 다음 단계가 열립니다.</p>
          )}
        </WorkflowStageCard>

        <WorkflowStageCard
          stepNo={2}
          title="정답 확인"
          active={workflow.currentStep === 2}
          complete={workflow.completedSteps.has(2)}
        >
          {exam ? (
            <>
              <p style={stageMainText}>정답 {answerCount}/{exam.questionCount}문항</p>
              <p style={hasAnswers ? muted : warningText}>
                {hasAnswers ? "저장된 기준 답안으로 자동 채점할 수 있습니다." : "정답이 없으면 채점할 수 없습니다. 먼저 기준 답안을 저장하세요."}
              </p>
              <Link href={`/omr?examId=${exam.id}&mode=answers`} style={resultButton}>정답 입력/수정</Link>
            </>
          ) : (
            <p style={muted}>시험 선택 후 정답 입력 단계가 활성화됩니다.</p>
          )}
        </WorkflowStageCard>

        <WorkflowStageCard
          stepNo={3}
          title="답안 업로드"
          active={workflow.currentStep === 3}
          complete={workflow.completedSteps.has(3)}
        >
          {exam ? (
            <>
              <p style={stageMainText}>업로드 {uploads.length}개</p>
              <p style={muted}>파일 업로드 후 전화번호 뒤 8자리 인식과 학생 자동 매칭을 시도합니다.</p>
              {uploadNotice && (
                <p style={uploadNotice.tone === "error" ? dangerText : warningText}>{uploadNotice.message}</p>
              )}
              <Link href={`/omr?examId=${exam.id}&mode=upload`} style={resultButton}>PDF/이미지 업로드</Link>
            </>
          ) : (
            <p style={muted}>시험 선택 후 여러 OMR 파일을 한 번에 업로드할 수 있습니다.</p>
          )}
        </WorkflowStageCard>

        <WorkflowStageCard
          stepNo={4}
          title="자동 채점 실행"
          active={workflow.currentStep === 4}
          complete={workflow.completedSteps.has(4)}
        >
          {exam ? (
            <>
              <p style={stageMainText}>처리 가능 {gradeableCount}/{uploads.length}건</p>
              <p style={!canGradeAll ? warningText : muted}>
                {!hasAnswers
                  ? "정답 저장이 필요합니다."
                  : uploads.length === 0
                    ? "채점할 업로드 파일이 없습니다."
                    : "전체 인식 또는 전체 채점을 한 번에 실행할 수 있습니다."}
              </p>
              <div style={workflowActionRow}>
                <form action={recognizeSelectedOmrUploadsAction} style={inlineForm}>
                  <input type="hidden" name="examId" value={exam.id} />
                  <input type="hidden" name="scope" value="all" />
                  <button style={secondaryButton} disabled={!canRecognizeAll}>전체 인식</button>
                </form>
                <form action={gradeSelectedOmrUploadsAction} style={inlineForm}>
                  <input type="hidden" name="examId" value={exam.id} />
                  <input type="hidden" name="scope" value="all" />
                  <button style={smallButton} disabled={!canManageExam || !canGradeAll}>전체 채점</button>
                </form>
              </div>
            </>
          ) : (
            <p style={muted}>시험, 정답, 업로드가 준비되면 자동 채점을 실행합니다.</p>
          )}
        </WorkflowStageCard>

        <WorkflowStageCard
          stepNo={5}
          title="결과 확인"
          active={workflow.currentStep === 5}
          complete={workflow.completedSteps.has(5)}
        >
          {exam && record && insights ? (
            <>
              <div style={resultMetricGrid}>
                <MiniStat label="반 평균" value={formatScoreMetric(insights.averageScore)} />
                <MiniStat label="최고/최저" value={`${formatScoreMetric(insights.highScore)} / ${formatScoreMetric(insights.lowScore)}`} />
                <MiniStat label="보충 필요" value={`${insights.remedialStudents.length}명`} />
              </div>
              {insights.topWrongQuestions.length > 0 ? (
                <div style={wrongQuestionList}>
                  {insights.topWrongQuestions.map((question) => (
                    <span key={question.questionNo} style={wrongQuestionPill}>
                      {question.questionNo}번 {formatPercent(question.rate)}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={muted}>채점된 문항이 있으면 오답률 높은 문항이 표시됩니다.</p>
              )}
              {insights.remedialStudents.length > 0 && (
                <div style={remedialList}>
                  {insights.remedialStudents.slice(0, 4).map((student) => (
                    <span key={student.id} style={remedialPill}>
                      {student.name} {formatScoreMetric(student.score)}
                    </span>
                  ))}
                  {insights.remedialStudents.length > 4 && (
                    <span style={remedialPill}>외 {insights.remedialStudents.length - 4}명</span>
                  )}
                </div>
              )}
              <Link href={`/omr?examId=${exam.id}&mode=results`} style={resultButton}>학생별 결과 보기</Link>
            </>
          ) : (
            <p style={muted}>채점 가능한 데이터가 아직 없습니다. 앞 단계를 완료하면 결과 요약이 표시됩니다.</p>
          )}
        </WorkflowStageCard>
      </div>
    </section>
  );
}

function WorkflowStepper({ activeStep, completedSteps }: { activeStep: number; completedSteps: Set<number> }) {
  return (
    <div style={stepper}>
      {workflowSteps.map((step) => {
        const isActive = activeStep === step.no;
        const isComplete = completedSteps.has(step.no);
        return (
          <div key={step.no} style={{ ...stepItem, ...(isActive ? stepItemActive : {}), ...(isComplete ? stepItemComplete : {}) }}>
            <span style={{ ...stepNoPill, ...(isActive ? stepNoActive : {}), ...(isComplete ? stepNoComplete : {}) }}>{step.no}</span>
            <span style={stepLabel}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function WorkflowStageCard({
  stepNo,
  title,
  active,
  complete,
  children,
}: {
  stepNo: number;
  title: string;
  active: boolean;
  complete: boolean;
  children: ReactNode;
}) {
  return (
    <section style={{ ...stageCard, ...(active ? stageCardActive : {}), ...(complete ? stageCardComplete : {}) }}>
      <div style={stageHeader}>
        <span style={stageNo}>{stepNo}단계</span>
        <StatusBadge tone={complete ? "green" : active ? "blue" : "gray"}>{complete ? "완료" : active ? "진행 중" : "대기"}</StatusBadge>
      </div>
      <h3 style={stageTitle}>{title}</h3>
      <div style={stageBody}>{children}</div>
    </section>
  );
}

function SelectedExamSummary({ exam, record }: { exam: ExamWithUploads; record: ExamRecord }) {
  const template = getOmrTemplate(exam.templateType);
  const lessonText = exam.classLesson ? lessonLabel(exam.classLesson) : exam.lessonPosition ? `${exam.lessonPosition}차시` : "차시 미지정";
  const testTypeText = exam.classTest ? classTestTypeText(exam.classTest.type) : "시험 미연결";
  const totalScore = exam.totalScore ?? exam.classTest?.totalScore ?? null;

  return (
    <div style={summaryCard}>
      <div>
        <p style={eyebrow}>선택된 검사</p>
        <h2 style={summaryTitle}>{exam.title}</h2>
        <p style={muted}>{record.classGroupName || "반 미지정"} / {exam.subject || template.subject} / {lessonText} / {testTypeText}</p>
      </div>
      <div style={summaryMetaGrid}>
        <SummaryItem label="검사명" value={exam.title} />
        <SummaryItem label="시험" value={exam.classTest?.name ?? "시험 미연결"} />
        <SummaryItem label="문항/총점" value={`${exam.questionCount}문항 / ${totalScore ?? "-"}점`} />
        <SummaryItem label="업로드" value={`${record.totalFiles}개`} />
        <SummaryItem label="매칭/인식" value={`${record.matchedCount}/${record.totalFiles} / ${record.recognizedCount}/${record.totalFiles}`} />
        <SummaryItem label="상태" value={recordStatusText(record.status)} />
      </div>
    </div>
  );
}
function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryItem}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

const workflowSteps = [
  { no: 1, label: "시험/반 선택" },
  { no: 2, label: "정답 확인" },
  { no: 3, label: "답안 업로드" },
  { no: 4, label: "자동 채점" },
  { no: 5, label: "결과 확인" },
] as const;

type OmrResultInsights = {
  gradedCount: number;
  averageScore: number | null;
  highScore: number | null;
  lowScore: number | null;
  remedialStudents: Array<{ id: string; name: string; score: number; percent: number | null; reviewNeededCount: number }>;
  topWrongQuestions: Array<{ questionNo: number; total: number; wrong: number; rate: number }>;
};

function getWorkflowState(exam: ExamWithUploads | null, record: ExamRecord | null, selectedMode: string, showNewSheet: boolean) {
  const completedSteps = new Set<number>();
  if (exam) completedSteps.add(1);
  if (exam && exam.answerKeys.length > 0) completedSteps.add(2);
  if (exam && exam.uploads.length > 0) completedSteps.add(3);
  if (record && record.gradedCount > 0) completedSteps.add(4);

  let currentStep = 1;
  if (showNewSheet || !exam) {
    currentStep = 1;
  } else if (selectedMode === "answers" || exam.answerKeys.length === 0) {
    currentStep = 2;
  } else if (selectedMode === "upload" || exam.uploads.length === 0) {
    currentStep = 3;
  } else if (record && record.gradedCount === 0) {
    currentStep = 4;
  } else {
    currentStep = 5;
  }

  return { currentStep, completedSteps };
}

function buildResultInsights(exam: ExamWithUploads): OmrResultInsights {
  const gradedUploads = exam.uploads
    .map((upload) => ({ upload, result: upload.results[0] ?? null }))
    .filter((item): item is { upload: ExamUploadLite; result: ResultWithItems } => Boolean(item.result));
  const scores = gradedUploads.map(({ result }) => result.totalScore);
  const averageScore = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  const highScore = scores.length ? Math.max(...scores) : null;
  const lowScore = scores.length ? Math.min(...scores) : null;
  const questionStats = new Map<number, { questionNo: number; total: number; wrong: number }>();

  for (const { result } of gradedUploads) {
    for (const item of result.items) {
      const current = questionStats.get(item.questionNo) ?? { questionNo: item.questionNo, total: 0, wrong: 0 };
      current.total += 1;
      if (item.status !== ExamResultStatus.CORRECT) current.wrong += 1;
      questionStats.set(item.questionNo, current);
    }
  }

  const remedialStudents = gradedUploads
    .map(({ upload, result }) => {
      const percent = result.maxScore > 0 ? Math.round((result.totalScore / result.maxScore) * 1000) / 10 : null;
      return {
        id: upload.id,
        name: upload.student?.name ?? upload.fileName,
        score: result.totalScore,
        percent,
        reviewNeededCount: result.reviewNeededCount,
      };
    })
    .filter((student) => (student.percent !== null && student.percent < 60) || student.reviewNeededCount > 0)
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  const topWrongQuestions = Array.from(questionStats.values())
    .filter((question) => question.total > 0 && question.wrong > 0)
    .map((question) => ({ ...question, rate: question.wrong / question.total }))
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong || a.questionNo - b.questionNo)
    .slice(0, 5);

  return { gradedCount: gradedUploads.length, averageScore, highScore, lowScore, remedialStudents, topWrongQuestions };
}

function ExamDetail({
  exam,
  record,
  students,
  applyError,
  overwriteCount,
  appliedCount,
}: {
  exam: ExamWithUploads;
  record: ExamRecord;
  students: StudentOption[];
  applyError: string;
  overwriteCount: number;
  appliedCount: number;
}) {
  const template = getOmrTemplate(exam.templateType);
  const bulkFormId = `omr-bulk-${exam.id}`;
  const canBulkRegister = exam.uploads.length > 0 && exam.answerKeys.length > 0;
  const unmatchedUploadCount = exam.uploads.filter((upload) => !upload.studentId).length;
  const missingResultCount = exam.uploads.filter((upload) => upload.studentId && upload.results.length === 0).length;
  const matchedStudentCounts = new Map<string, number>();
  for (const upload of exam.uploads) {
    if (upload.studentId) matchedStudentCounts.set(upload.studentId, (matchedStudentCounts.get(upload.studentId) ?? 0) + 1);
  }
  const duplicateStudentCount = [...matchedStudentCounts.values()].filter((count) => count > 1).length;
  const canApplyScores = Boolean(exam.classGroupId && exam.classTestId && exam.uploads.length > 0 && unmatchedUploadCount === 0 && missingResultCount === 0 && duplicateStudentCount === 0);
  const applyErrorText = applyError ? omrApplyErrorMessage(applyError, { unmatchedUploadCount, missingResultCount, duplicateStudentCount }) : "";

  async function bulkOmrAction(formData: FormData) {
    "use server";
    const intent = String(formData.get("intent") ?? "");
    const [action, scope = "selected"] = intent.split(":");

    formData.set("scope", scope === "all" ? "all" : "selected");

    if (action === "recognize") {
      return recognizeSelectedOmrUploadsAction(formData);
    }

    return gradeSelectedOmrUploadsAction(formData);
  }

  return (
    <section style={detailGrid}>
      <section style={card}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>{exam.title}</h2>
            <p style={muted}>{exam.subject || template.subject} / {template.label} / {formatDate(exam.createdAt)}</p>
          </div>
          <div style={inlineForm}>
            <Link href={`/omr?examId=${exam.id}&mode=answers`} style={lightButton}>정답</Link>
            <Link href={`/omr?examId=${exam.id}&mode=upload`} style={smallButton}>파일 업로드</Link>
            <StatusBadge tone={recordTone(record.status)}>{recordStatusText(record.status)}</StatusBadge>
          </div>
        </div>
        <div style={miniStats}>
          <MiniStat label="파일" value={`${record.totalFiles}`} />
          <MiniStat label="매칭" value={`${record.matchedCount}/${record.totalFiles}`} />
          <MiniStat label="인식" value={`${record.recognizedCount}/${record.totalFiles}`} />
          <MiniStat label="검수 필요" value={`${record.reviewNeededCount}`} />
          <MiniStat label="등록" value={`${record.registeredCount}`} />
        </div>
      </section>
        <div style={applyPanel}>
          <div style={applyPanelSummary}>
            <b>최종 확인 및 일괄 적용</b>
            <span>{record.classGroupName || "반 미지정"} / {exam.title}</span>
            <span>응시 {exam.uploads.length}명 / 매칭 {record.matchedCount}명 / 미매칭 {unmatchedUploadCount}명 / 미채점 {missingResultCount}명</span>
            {duplicateStudentCount > 0 ? <span style={dangerText}>중복 매칭 {duplicateStudentCount}건을 해결해주세요.</span> : null}
            {overwriteCount > 0 ? <span style={warningText}>기존 점수가 있는 학생 {overwriteCount}명이 있습니다. 덮어쓰려면 확인을 체크하세요.</span> : null}
            {appliedCount > 0 ? <span style={successText}>{appliedCount}명 점수를 학생현황판에 적용했습니다.</span> : null}
            {applyErrorText ? <span style={dangerText}>{applyErrorText}</span> : null}
          </div>
          <form action={applyOmrResultsToStudentScoresAction} style={applyForm}>
            <input type="hidden" name="examId" value={exam.id} />
            <label style={overwriteCheck}>
              <input type="checkbox" name="confirmOverwrite" value="1" defaultChecked={overwriteCount > 0} />
              기존 점수 덮어쓰기
            </label>
            <button style={primaryButton} disabled={!canApplyScores}>최종 확인 및 일괄 적용</button>
          </form>
        </div>

      <section style={card}>
        <form id={bulkFormId} action={bulkOmrAction}>
          <input type="hidden" name="examId" value={exam.id} />
        </form>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>학생별 결과 요약</h2>
          <div style={inlineForm}>
            <button type="submit" form={bulkFormId} name="intent" value="recognize:all" style={smallButton} disabled={exam.uploads.length === 0}>전체 인식</button>
            <button type="submit" form={bulkFormId} name="intent" value="grade:all" style={secondaryButton} disabled={!canBulkRegister}>전체 채점</button>
          </div>
        </div>
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <Th>파일명</Th>
                <Th>인식 전화번호</Th>
                <Th>매칭된 학생</Th>
                <Th>매칭 상태</Th>
                <Th>답안 인식 상태</Th>
                <Th>점수</Th>
                <Th>정답 수</Th>
                <Th>오답 수</Th>
                <Th>미응답 수</Th>
                <Th>검수 필요 수</Th>
                <Th>성적 등록 상태</Th>
                <Th>답안 확인</Th>
                <Th>관리</Th>
              </tr>
            </thead>
            <tbody>
              {exam.uploads.map((upload) => {
                const result = upload.results[0];
                const reviewNeeded = (upload.recognizedAnswers as Array<{ status: OmrAnswerStatus }>).some(
                  (answer) => answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE
                );
                const reviewNeededCount = result?.reviewNeededCount ?? (reviewNeeded ? 1 : 0);
                const canRegister = Boolean(
                  exam.answerKeys.length > 0 &&
                  upload.studentId &&
                    (upload.recognizeStatus === "RECOGNIZED" || upload.recognizeStatus === "REVIEW_NEEDED")
                );
                return (
                  <tr key={upload.id}>
                    <Td>
                      <b>{upload.fileName}</b>
                      <div style={subText}>{formatBytes(upload.fileSize)} / {formatDate(upload.createdAt)}</div>
                    </Td>
                    <Td>
                      {formatPhoneLast8(upload.phoneLast8)}
                      <div style={subText}>{phoneRecognizeStatusText(upload.phoneRecognizeStatus)}</div>
                    </Td>
                    <Td>
                      {upload.student ? (
                        <Link href={`/omr/uploads/${upload.id}`} style={resultButton}>
                          {studentLabel(upload.student)}
                        </Link>
                      ) : (
                        <span style={dangerText}>매칭 필요</span>
                      )}
                      <MatchMiniForm upload={upload} students={students} />
                    </Td>
                    <Td><StatusBadge tone={matchTone(upload.matchStatus)}>{matchStatusText(upload.matchStatus)}</StatusBadge></Td>
                    <Td><StatusBadge tone={recognizeTone(upload.recognizeStatus)}>{recognizeStatusText(upload.recognizeStatus)}</StatusBadge></Td>
                    <Td>{result ? `${result.totalScore}/${result.maxScore || exam.questionCount}` : "-"}</Td>
                    <Td>{result?.correctCount ?? "-"}</Td>
                    <Td>{result?.wrongCount ?? "-"}</Td>
                    <Td>{result?.blankCount ?? "-"}</Td>
                    <Td>{reviewNeededCount}</Td>
                    <Td><StatusBadge tone={result ? "green" : canRegister ? "yellow" : "gray"}>{result ? "채점 완료" : canRegister ? "채점 가능" : "대기"}</StatusBadge></Td>
                    <Td><Link href={`/omr/uploads/${upload.id}`} style={resultButton}>답안 확인</Link></Td>
                    <Td>
                      <form action={deleteOmrUploadAction}>
                        <input type="hidden" name="uploadId" value={upload.id} />
                        <input type="hidden" name="examId" value={exam.id} />
                        <OmrUploadDeleteButton fileName={upload.fileName} />
                      </form>
                    </Td>
                  </tr>
                );
              })}
              {exam.uploads.length === 0 && (
                <tr>
                  <td colSpan={13} style={emptyCell}>아직 업로드된 파일이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function UploadReview({
  upload,
  reviewUploads,
  template,
  keyByNo,
  recognizedByNo,
  latestResult,
  resultItemByNo,
  students,
  exams,
}: {
  upload: SelectedUpload;
  reviewUploads: ExamUploadLite[];
  template: ReturnType<typeof getOmrTemplate>;
  keyByNo: Map<number, { answer: string; score: number }>;
  recognizedByNo: Map<number, RecognizedAnswerLite>;
  latestResult: ResultWithItems | null;
  resultItemByNo: Map<number, ResultItemLite>;
  students: StudentOption[];
  exams: Array<{ id: string; title: string }>;
}) {
  const questions = template.questions.slice(0, upload.exam?.questionCount ?? template.questionCount);
  const lowConfidenceQuestions = questions
    .map((question) => ({ question, recognized: recognizedByNo.get(question.no) }))
    .filter(({ recognized }) =>
      (recognized?.confidence ?? 1) <= 0.5 ||
      recognized?.status === OmrAnswerStatus.REVIEW_NEEDED ||
      recognized?.status === OmrAnswerStatus.MULTIPLE
    );
  const currentIndex = reviewUploads.findIndex((item) => item.id === upload.id);
  const previousUpload = currentIndex > 0 ? reviewUploads[currentIndex - 1] : null;
  const nextUpload = currentIndex >= 0 && currentIndex < reviewUploads.length - 1 ? reviewUploads[currentIndex + 1] : null;

  return (
    <div style={studentReviewGrid}>
      <aside style={reviewStudentPane}>
        <div style={sectionHead}>
          <h3 style={smallTitle}>학생 리스트</h3>
          <span style={muted}>{reviewUploads.length}명</span>
        </div>
        <div style={studentNavButtons}>
          {previousUpload ? (
            <Link href={reviewUploadHref(previousUpload.id)} style={secondaryButton}>이전</Link>
          ) : (
            <span style={disabledNav}>이전</span>
          )}
          {nextUpload ? (
            <Link href={reviewUploadHref(nextUpload.id)} style={secondaryButton}>다음</Link>
          ) : (
            <span style={disabledNav}>다음</span>
          )}
        </div>
        <div style={reviewStudentList}>
          {reviewUploads.map((item) => (
            <ReviewStudentItem key={item.id} upload={item} selected={item.id === upload.id} />
          ))}
        </div>
      </aside>

      <section style={reviewPreviewPane}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>{upload.student?.name ?? "매칭된 학생 없음"}</h2>
            <p style={muted}>{formatPhoneLast8(upload.phoneLast8)} / {upload.fileName}</p>
          </div>
          <StatusBadge tone={recognizeTone(upload.recognizeStatus)}>{recognizeStatusText(upload.recognizeStatus)}</StatusBadge>
        </div>
        <OmrReviewPreview
          filePath={upload.previewImagePath ?? upload.filePath}
          fileType={upload.previewImagePath ? "image/png" : upload.fileType}
          fileName={upload.fileName}
        />
      </section>

      <section style={reviewAnswerPane}>
        <section style={compactPanel}>
          <div style={sectionHead}>
            <h3 style={smallTitle}>신뢰도 낮은 문항</h3>
            {latestResult && <StatusBadge tone="green">{latestResult.totalScore}/{latestResult.maxScore || upload.exam?.questionCount || template.questionCount}</StatusBadge>}
          </div>
          {lowConfidenceQuestions.length > 0 ? (
            <div style={lowQuestionList}>
              {lowConfidenceQuestions.map(({ question, recognized }) => (
                <a key={question.no} href={`#omr-question-${question.no}`} style={lowQuestionItem}>
                  <b>{question.no}번</b>
                  <span>자동 {recognized?.recognizedAnswer || "-"}</span>
                  <span>{formatConfidence(recognized?.confidence)}</span>
                  <StatusBadge tone="yellow">{answerStatusText(recognized?.status)}</StatusBadge>
                </a>
              ))}
            </div>
          ) : (
            <div style={emptyBox}>확인 필요 문항 없음</div>
          )}
        </section>

        <section style={compactPanel}>
          <h3 style={smallTitle}>학생 매칭 / 검사 설정</h3>
          <p style={muted}>
            인식 전화번호: <b>{formatPhoneLast8(upload.phoneLast8)}</b> / {phoneRecognizeStatusText(upload.phoneRecognizeStatus)} / {matchStatusText(upload.matchStatus)}
          </p>
          <div style={reviewInlineForms}>
            <form action={updateOmrUploadMatchAction} style={reviewInlineForm}>
              <input type="hidden" name="uploadId" value={upload.id} />
              <input name="phoneLast8" defaultValue={upload.phoneLast8 ?? ""} placeholder="전화번호 뒤 8자리" style={miniInput} />
              <select name="studentId" defaultValue={upload.student?.id ?? ""} style={miniInput}>
                <option value="">학생 선택</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{studentLabel(student)}</option>
                ))}
              </select>
              <button style={secondaryButton}>매칭 저장</button>
            </form>
            <form action={updateOmrUploadSetupAction} style={reviewInlineForm}>
              <input type="hidden" name="uploadId" value={upload.id} />
              <select name="examId" defaultValue={upload.examId ?? ""} style={miniInput}>
                {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
              </select>
              <select name="templateType" defaultValue={upload.templateType} style={miniInput}>
                {omrTemplateList.map((templateOption) => (
                  <option key={templateOption.type} value={templateOption.type}>{templateOption.label}</option>
                ))}
              </select>
              <button style={secondaryButton}>설정 저장</button>
            </form>
          </div>
        </section>

        <form action={gradeOmrAction} style={answerReviewForm}>
          <input type="hidden" name="uploadId" value={upload.id} />
          <div style={sectionHead}>
            <div>
              <h3 style={smallTitle}>답안 / 정답 비교표</h3>
              <p style={muted}>수정 답을 바꾼 뒤 재채점하면 최종 답과 정오 여부가 갱신됩니다.</p>
            </div>
          </div>
          <div style={reviewTableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <Th>번호</Th>
                  <Th>학생 답</Th>
                  <Th>자동</Th>
                  <Th>수정 답</Th>
                  <Th>최종 답</Th>
                  <Th>정답</Th>
                  <Th>O/X</Th>
                  <Th>신뢰도</Th>
                  <Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => (
                  <QuestionRow
                    key={question.no}
                    question={question}
                    recognized={recognizedByNo.get(question.no)}
                    answerKey={keyByNo.get(question.no)}
                    resultItem={resultItemByNo.get(question.no)}
                    compact
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div style={reviewFooter}>
            <button formAction={saveOmrCorrectionsAction} style={secondaryButton} disabled={!upload.exam}>수정 저장</button>
            <button style={primaryButton} disabled={!upload.student}>재채점</button>
            <button style={primaryButton} disabled={!upload.student || !latestResult}>학생 성적에 등록</button>
            <Link href={closeUploadHrefFor(upload)} style={lightButton}>닫기</Link>
          </div>
          {!upload.student && <p style={dangerText}>성적을 저장하려면 학생 매칭이 필요합니다.</p>}
        </form>
      </section>
    </div>
  );
}

function ReviewStudentItem({ upload, selected }: { upload: ExamUploadLite; selected: boolean }) {
  const result = upload.results[0];
  const needsReview =
    upload.recognizeStatus === "REVIEW_NEEDED" ||
    upload.recognizeStatus === "FAILED" ||
    upload.recognizedAnswers.some((answer) => answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE);

  return (
    <Link
      href={reviewUploadHref(upload.id)}
      style={{ ...reviewStudentItem, ...(selected ? reviewStudentSelected : {}), ...(needsReview ? reviewStudentNeedsReview : {}) }}
    >
      <div style={reviewStudentName}>{upload.student?.name ?? "학생 매칭 필요"}</div>
      <div style={reviewStudentMeta}>{formatPhoneLast8(upload.phoneLast8)} / {result ? `${result.totalScore}점` : "미채점"}</div>
      <div style={reviewStudentMeta}>{needsReview ? "검수 필요" : recognizeStatusText(upload.recognizeStatus)}</div>
    </Link>
  );
}

function reviewUploadHref(uploadId: string) {
  return `/omr/uploads/${uploadId}`;
}

function closeUploadHrefFor(upload: Pick<SelectedUpload, "examId">) {
  return upload.examId ? `/omr?examId=${upload.examId}&mode=results` : "/omr";
}

function answerStatusText(status?: OmrAnswerStatus | null) {
  return answerStatusOptions.find(([value]) => value === status)?.[1] ?? "확인 필요";
}

function MatchMiniForm({ upload, students }: { upload: Pick<ExamUploadLite, "id" | "phoneLast8" | "student">; students: StudentOption[] }) {
  return (
    <details style={miniDetails}>
      <summary>수정</summary>
      <form action={updateOmrUploadMatchAction} style={miniStack}>
        <input type="hidden" name="uploadId" value={upload.id} />
        <input name="phoneLast8" defaultValue={upload.phoneLast8 ?? ""} placeholder="0000-0000" style={miniInput} />
        <select name="studentId" defaultValue={upload.student?.id ?? ""} style={miniInput}>
          <option value="">학생</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>{studentLabel(student)}</option>
          ))}
        </select>
        <button style={tinyButton}>저장</button>
      </form>
    </details>
  );
}

function AnswerKeyGrid({ questions, keyByNo }: { questions: OmrTemplateQuestion[]; keyByNo: Map<number, { answer: string; score: number }> }) {
  return (
    <div style={answerGrid}>
      {questions.map((question) => {
        const saved = keyByNo.get(question.no);
        return (
          <label key={question.no} style={answerCell}>
            <span>{question.no}</span>
            <AnswerInput name={`correct-${question.no}`} question={question} defaultValue={saved?.answer ?? ""} />
            <input name={`score-${question.no}`} type="number" min={0} defaultValue={saved?.score ?? 1} style={scoreInput} />
          </label>
        );
      })}
    </div>
  );
}

function QuestionRow({
  question,
  recognized,
  answerKey,
  resultItem,
  compact = false,
}: {
  question: OmrTemplateQuestion;
  recognized?: { recognizedAnswer: string | null; correctedAnswer: string | null; finalAnswer?: string | null; status: OmrAnswerStatus; confidence: number | null };
  answerKey?: { answer: string; score: number };
  resultItem?: { status: ExamResultStatus; studentAnswer: string | null; correctAnswer: string | null; score: number };
  compact?: boolean;
}) {
  const studentAnswer = resultItem?.studentAnswer ?? recognized?.finalAnswer ?? recognized?.correctedAnswer ?? recognized?.recognizedAnswer ?? "";
  const finalAnswer = recognized?.finalAnswer ?? recognized?.correctedAnswer ?? recognized?.recognizedAnswer ?? "";
  const correctAnswer = resultItem?.correctAnswer ?? answerKey?.answer ?? "";
  const status = recognized?.status ?? (studentAnswer ? OmrAnswerStatus.MANUAL : OmrAnswerStatus.BLANK);
  const ox = resultItem
    ? resultItem.status === ExamResultStatus.CORRECT
      ? "O"
      : resultItem.status === ExamResultStatus.WRONG
        ? "X"
        : resultStatusText(resultItem.status)
    : studentAnswer && correctAnswer
      ? studentAnswer === correctAnswer
        ? "O"
        : "X"
      : "-";
  const rowStyle = resultItem ? resultRowStyle(resultItem.status) : status === OmrAnswerStatus.REVIEW_NEEDED || status === OmrAnswerStatus.MULTIPLE ? reviewRow : undefined;

  if (compact) {
    return (
      <tr id={`omr-question-${question.no}`} style={rowStyle}>
        <Td>{question.no}</Td>
        <Td>{studentAnswer || "-"}</Td>
        <Td>{recognized?.recognizedAnswer || "-"}</Td>
        <Td><AnswerInput name={`student-${question.no}`} question={question} defaultValue={studentAnswer} /></Td>
        <Td>{finalAnswer || studentAnswer || "-"}</Td>
        <Td><AnswerInput name={`correct-${question.no}`} question={question} defaultValue={correctAnswer} /></Td>
        <Td><span style={ox === "O" ? correctPill : ox === "X" ? wrongPill : badge}>{ox}</span></Td>
        <Td>{formatConfidence(recognized?.confidence)}</Td>
        <Td>
          <select name={`status-${question.no}`} defaultValue={status} style={miniInput}>
            {answerStatusOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input name={`score-${question.no}`} type="hidden" value={answerKey?.score ?? 1} />
        </Td>
      </tr>
    );
  }

  return (
    <tr id={`omr-question-${question.no}`} style={rowStyle}>
      <Td>{question.no}</Td>
      <Td>{question.section}</Td>
      <Td>{recognized?.recognizedAnswer || "-"}</Td>
      <Td><AnswerInput name={`student-${question.no}`} question={question} defaultValue={studentAnswer} /></Td>
      <Td>{finalAnswer || "-"}</Td>
      <Td><AnswerInput name={`correct-${question.no}`} question={question} defaultValue={correctAnswer} /></Td>
      <Td>{formatConfidence(recognized?.confidence)}</Td>
      <Td>
        <select name={`status-${question.no}`} defaultValue={status} style={miniInput}>
          {answerStatusOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Td>
      <Td>{resultItem ? resultStatusText(resultItem.status) : "-"}</Td>
      <Td><input name={`score-${question.no}`} type="number" min={0} defaultValue={answerKey?.score ?? 1} style={scoreInput} /></Td>
    </tr>
  );
}

function AnswerInput({ name, question, defaultValue }: { name: string; question: OmrTemplateQuestion; defaultValue: string }) {
  if (question.kind === "SHORT") return <input name={name} defaultValue={defaultValue} placeholder="숫자" style={miniInput} />;
  return (
    <select name={name} defaultValue={defaultValue} style={miniInput}>
      <option value="">-</option>
      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={String(value)}>{value}</option>)}
    </select>
  );
}

function RightSheet({ title, closeHref, wide = false, children }: { title: string; closeHref: string; wide?: boolean; children: ReactNode }) {
  return (
    <div style={sheetBackdrop}>
      <aside role="dialog" aria-modal="true" aria-label={title} style={{ ...sheet, ...(wide ? wideSheet : {}) }}>
        <div style={sheetHeader}>
          <h2 style={sectionTitle}>{title}</h2>
          <OmrCloseButton href={closeHref} />
        </div>
        <div style={sheetBody}>{children}</div>
      </aside>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniStat}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function StatusBadge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return <span style={{ ...badge, ...toneStyles[tone] }}>{children}</span>;
}

function uploadNoticeMessage(error?: string, warning?: string, skipped?: string) {
  const skippedCount = Number(skipped || 0);
  if (error === "batch-too-large") {
    return {
      tone: "error" as const,
      message: `선택한 OMR 파일 총 용량이 너무 큽니다. 한 번에 최대 ${OMR_MAX_BATCH_LABEL}까지 가능하니 여러 번 나눠서 업로드해주세요.`,
    };
  }
  if (error === "file-too-large") {
    return {
      tone: "error" as const,
      message: `업로드 가능한 파일이 없습니다. 파일 1개 최대 용량은 ${OMR_MAX_FILE_LABEL}입니다.`,
    };
  }
  if (warning === "file-too-large") {
    return {
      tone: "warning" as const,
      message: `${skippedCount || "일부"}개 파일은 ${OMR_MAX_FILE_LABEL}를 초과해서 건너뛰었습니다. 업로드된 파일만 먼저 처리할 수 있습니다.`,
    };
  }
  return null;
}

function Th({ children }: { children: ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={td}>{children}</td>;
}

type Tone = "gray" | "blue" | "green" | "yellow" | "red";
type ExamRecord = ReturnType<typeof makeExamRecord>;

function makeExamRecord(exam: ExamWithUploads, classGroupById: Map<string, ClassGroupLite>) {
  const classGroup = exam.classGroupId ? classGroupById.get(exam.classGroupId) : null;
  const uploads = exam.uploads;
  const totalFiles = uploads.length;
  const matchedCount = uploads.filter((upload) => Boolean(upload.studentId)).length;
  const recognizedCount = uploads.filter((upload) => upload.recognizeStatus === "RECOGNIZED" || upload.recognizeStatus === "REVIEW_NEEDED").length;
  const reviewNeededCount = uploads.filter((upload) =>
    upload.recognizeStatus === "REVIEW_NEEDED" ||
    upload.recognizeStatus === "FAILED" ||
    (upload.recognizedAnswers as Array<{ status: OmrAnswerStatus }>).some((answer) => answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE)
  ).length;
  const gradedUploads = uploads.filter((upload) => upload.results.length > 0 || upload.gradingStatus === "GRADED" || upload.gradingStatus === "GRADED_REVIEW_NEEDED");
  const scores = gradedUploads.map((upload) => upload.results[0]?.totalScore).filter((score): score is number => typeof score === "number");
  const averageScore = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  const highScore = scores.length ? Math.max(...scores) : null;
  const lowScore = scores.length ? Math.min(...scores) : null;
  const failedCount = uploads.filter((upload) => upload.recognizeStatus === "FAILED").length;
  const status = batchStatus({ totalFiles, matchedCount, reviewNeededCount, gradedCount: gradedUploads.length, failedCount, registeredCount: exam.testScores.length });
  const firstReviewUpload =
    uploads.find((upload) => uploadNeedsReview(upload)) ??
    uploads.find((upload) => !upload.studentId) ??
    uploads.find((upload) => upload.results.length > 0) ??
    uploads[0] ??
    null;

  return {
    id: exam.id,
    title: exam.title,
    subject: exam.subject ?? "",
    classGroupId: exam.classGroupId ?? "",
    classGroupName: classGroup ? [classGroup.name, classGroup.grade].filter(Boolean).join(" / ") : "",
    examDate: exam.examDate ?? "",
    createdAt: exam.createdAt,
    templateType: exam.templateType,
    questionCount: exam.questionCount,
    totalFiles,
    matchedCount,
    recognizedCount,
    reviewNeededCount,
    gradedCount: gradedUploads.length,
    registeredCount: exam.testScores.length,
    averageScore,
    highScore,
    lowScore,
    status,
    firstReviewUploadId: firstReviewUpload?.id ?? "",
  };
}

function omrApplyErrorMessage(error: string, stats: { unmatchedUploadCount: number; missingResultCount: number; duplicateStudentCount: number }) {
  if (error === "missing-test") return "반별 시험에 연결된 OMR 검사만 학생 점수로 적용할 수 있습니다.";
  if (error === "not-ready") return `적용할 수 없습니다. 미매칭 ${stats.unmatchedUploadCount}건, 미채점 ${stats.missingResultCount}건, 중복 ${stats.duplicateStudentCount}건을 확인해주세요.`;
  return "점수 적용 중 확인이 필요합니다.";
}

function uploadNeedsReview(upload: ExamUploadLite) {
  return (
    upload.recognizeStatus === "REVIEW_NEEDED" ||
    upload.recognizeStatus === "FAILED" ||
    (upload.recognizedAnswers as Array<{ status: OmrAnswerStatus }>).some(
      (answer) => answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE
    )
  );
}

function batchStatus(stats: { totalFiles: number; matchedCount: number; reviewNeededCount: number; gradedCount: number; failedCount: number; registeredCount: number }) {
  if (stats.totalFiles === 0) return "WAITING";
  if (stats.failedCount > 0) return "FAILED";
  if (stats.matchedCount < stats.totalFiles) return "NEEDS_MATCH";
  if (stats.reviewNeededCount > 0) return "REVIEW_NEEDED";
  if (stats.registeredCount >= stats.totalFiles) return "REGISTERED";
  if (stats.gradedCount > 0) return "GRADED";
  return "WAITING";
}

function templateLabel(type: OmrTemplateType | string) {
  return getOmrTemplate(type).label;
}

function recordStatusText(status: string) {
  const labels: Record<string, string> = {
    WAITING: "대기",
    NEEDS_MATCH: "매칭 필요",
    REVIEW_NEEDED: "검수 필요",
    GRADED: "일부 채점",
    REGISTERED: "등록 완료",
    FAILED: "실패",
  };
  return labels[status] ?? status;
}

function recordTone(status: string): Tone {
  if (status === "REGISTERED") return "green";
  if (status === "GRADED") return "blue";
  if (status === "REVIEW_NEEDED" || status === "NEEDS_MATCH") return "yellow";
  if (status === "FAILED") return "red";
  return "gray";
}

function matchStatusText(status: string | null | undefined) {
  const labels: Record<string, string> = {
    MATCHED: "매칭 완료",
    MULTIPLE_MATCHES: "중복 매칭",
    NOT_FOUND: "학생 없음",
    NEEDS_PHONE: "전화번호 확인 필요",
    MANUAL: "수동 매칭 완료",
    MANUAL_MATCHED: "수동 매칭 완료",
  };
  return labels[status ?? ""] ?? "확인 필요";
}

function matchTone(status: string | null | undefined): Tone {
  if (status === "MATCHED" || status === "MANUAL" || status === "MANUAL_MATCHED") return "green";
  if (status === "MULTIPLE_MATCHES" || status === "NEEDS_PHONE") return "yellow";
  if (status === "NOT_FOUND") return "red";
  return "gray";
}

function phoneRecognizeStatusText(status: string | null | undefined) {
  const labels: Record<string, string> = {
    WAITING: "전화번호 인식 대기",
    OK: "수험번호란 자동 인식",
    LOW_CONFIDENCE: "전화번호 검수 필요",
    FAILED: "전화번호 인식 실패",
    MANUAL: "수동 입력",
  };
  return labels[status ?? ""] ?? "전화번호 확인 필요";
}

function recognizeStatusText(status: string) {
  const labels: Record<string, string> = {
    WAITING: "대기",
    RECOGNIZING: "인식 중",
    RECOGNIZED: "인식 완료",
    REVIEW_NEEDED: "검수 필요",
    FAILED: "실패",
  };
  return labels[status] ?? status;
}

function recognizeTone(status: string): Tone {
  if (status === "RECOGNIZED") return "green";
  if (status === "RECOGNIZING") return "blue";
  if (status === "REVIEW_NEEDED" || status === "WAITING") return "yellow";
  if (status === "FAILED") return "red";
  return "gray";
}

function resultStatusText(status: ExamResultStatus) {
  if (status === ExamResultStatus.CORRECT) return "정답";
  if (status === ExamResultStatus.WRONG) return "오답";
  if (status === ExamResultStatus.BLANK) return "미응답";
  if (status === ExamResultStatus.MULTIPLE) return "중복 마킹";
  return "검수 필요";
}

function resultRowStyle(status: ExamResultStatus): CSSProperties | undefined {
  if (status === ExamResultStatus.CORRECT) return { background: "#f0fdf4" };
  if (status === ExamResultStatus.WRONG) return { background: "#fef2f2" };
  if (status === ExamResultStatus.REVIEW_NEEDED || status === ExamResultStatus.MULTIPLE) return { background: "#fffbeb" };
  return undefined;
}

function formatPhoneLast8(value: string | null | undefined) {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "").slice(-8);
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function formatDate(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function formatConfidence(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatScoreMetric(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function studentLabel(student: StudentOption | StudentBrief) {
  return [student.name, student.schoolName, student.grade].filter(Boolean).join(" / ");
}

const page: CSSProperties = { minHeight: "100vh", background: "var(--asc-bg-subtle)", color: "var(--asc-text)" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const topBar: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12 };
const workflowPanel: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10, display: "grid", gap: 8 };
const stepper: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 6 };
const stepItem: CSSProperties = { display: "flex", alignItems: "center", gap: 8, minHeight: 38, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg-subtle)", padding: "7px 9px", color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 950 };
const stepItemActive: CSSProperties = { borderColor: "var(--asc-primary)", background: "var(--asc-primary-soft)", color: "var(--asc-primary-hover)" };
const stepItemComplete: CSSProperties = { borderColor: "var(--asc-success)", background: "var(--asc-success-soft)", color: "var(--asc-success)" };
const stepNoPill: CSSProperties = { width: 23, height: 23, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--asc-border)", color: "var(--asc-text-subtle)", flex: "0 0 auto" };
const stepNoActive: CSSProperties = { background: "var(--asc-primary)", color: "#fff" };
const stepNoComplete: CSSProperties = { background: "var(--asc-success)", color: "#fff" };
const stepLabel: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const workflowEmptyState: CSSProperties = { border: "1px dashed var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 12, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "var(--asc-bg-subtle)" };
const summaryCard: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary-soft)", padding: 10, display: "grid", gridTemplateColumns: "minmax(220px, .8fr) minmax(420px, 1.2fr)", gap: 8, alignItems: "center" };
const summaryTitle: CSSProperties = { margin: "2px 0 5px", fontSize: 18, fontWeight: 950 };
const summaryMetaGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 6 };
const summaryItem: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", padding: "7px 8px", display: "grid", gap: 2, fontSize: 12 };
const workflowGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(160px, 1fr))", gap: 8 };
const stageCard: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", padding: 8, display: "grid", gridTemplateRows: "auto auto 1fr", gap: 5, minHeight: 132 };
const stageCardActive: CSSProperties = { borderColor: "var(--asc-primary)", boxShadow: "inset 0 3px 0 var(--asc-primary)" };
const stageCardComplete: CSSProperties = { borderColor: "var(--asc-success)" };
const stageHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" };
const stageNo: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 950 };
const stageTitle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 950 };
const stageBody: CSSProperties = { display: "grid", alignContent: "start", gap: 6, minWidth: 0 };
const stageMainText: CSSProperties = { margin: 0, color: "var(--asc-text)", fontSize: 14, fontWeight: 950 };
const warningText: CSSProperties = { margin: 0, color: "var(--asc-warning-text)", fontSize: 13, fontWeight: 800 };
const workflowActionRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" };
const resultMetricGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 5 };
const wrongQuestionList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 5 };
const wrongQuestionPill: CSSProperties = { border: "1px solid var(--asc-danger)", borderRadius: 999, background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: "4px 7px", fontSize: 12, fontWeight: 900 };
const remedialList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 5 };
const remedialPill: CSSProperties = { border: "1px solid var(--asc-warning)", borderRadius: 999, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", padding: "4px 7px", fontSize: 12, fontWeight: 900 };
const eyebrow: CSSProperties = { margin: 0, color: "var(--asc-primary)", fontSize: 12, fontWeight: 950 };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 150px 150px 150px 150px 100px auto auto", gap: 6, background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 8 };
const filterInput: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", padding: "7px 8px", minWidth: 0, color: "var(--asc-text)" };
const filterSelect: CSSProperties = { ...filterInput };
const card: CSSProperties = { background: "var(--asc-surface)", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", padding: 10 };
const sectionHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const muted: CSSProperties = { margin: 0, color: "var(--asc-text-muted)", fontSize: 13 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", background: "var(--asc-bg-subtle)", borderBottom: "1px solid var(--asc-border)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--asc-border)", verticalAlign: "top", whiteSpace: "nowrap" };
const subText: CSSProperties = { color: "var(--asc-text-muted)", fontSize: 12, marginTop: 3 };
const emptyCell: CSSProperties = { padding: 20, textAlign: "center", color: "var(--asc-text-muted)" };
const resultButton: CSSProperties = { color: "var(--asc-primary-hover)", fontWeight: 950, textDecoration: "none" };
const actionLinks: CSSProperties = { display: "inline-flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" };
const inlineDeleteForm: CSSProperties = { margin: 0 };
const smallButton: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-primary)", color: "#fff", padding: "8px 10px", fontWeight: 900, cursor: "pointer", textDecoration: "none" };
const lightButton: CSSProperties = { ...smallButton, borderColor: "var(--asc-border-strong)", background: "var(--asc-bg)", color: "var(--asc-text)", textAlign: "center" };
const primaryButton: CSSProperties = { border: "1px solid var(--asc-primary)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-primary)", color: "#fff", padding: "10px 12px", fontWeight: 950, cursor: "pointer" };
const secondaryButton: CSSProperties = { border: "1px solid var(--asc-border-strong)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg)", color: "var(--asc-text)", padding: "9px 11px", fontWeight: 900, cursor: "pointer" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 8px", background: "var(--asc-bg-subtle)", color: "var(--asc-text-subtle)", fontWeight: 900, fontSize: 12 };
const toneStyles: Record<Tone, CSSProperties> = {
  gray: { background: "#f3f4f6", color: "#374151" },
  blue: { background: "#e8f0fe", color: "#083891" },
  green: { background: "#dcfce7", color: "#047857" },
  yellow: { background: "#fef3c7", color: "#92400e" },
  red: { background: "#fee2e2", color: "#b91c1c" },
};
const detailGrid: CSSProperties = { display: "grid", gap: 12 };
const miniStats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 };
const applyPanel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-lg)", background: "var(--asc-bg-subtle)", padding: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" };
const applyPanelSummary: CSSProperties = { display: "grid", gap: 4, color: "var(--asc-text)", fontSize: 13 };
const applyForm: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const overwriteCheck: CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center", color: "var(--asc-text)", fontSize: 13, fontWeight: 800 };
const successText: CSSProperties = { margin: 0, color: "var(--asc-success)", fontSize: 13, fontWeight: 800 };
const miniStat: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 4 };
const inlineForm: CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center" };
const miniDetails: CSSProperties = { marginTop: 5, color: "#6b7280" };
const miniStack: CSSProperties = { display: "grid", gridTemplateColumns: "110px minmax(130px, 1fr) auto", gap: 5, marginTop: 6 };
const miniInput: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 7px", minWidth: 0, fontSize: 12 };
const tinyButton: CSSProperties = { ...smallButton, padding: "6px 8px", fontSize: 12 };
const dangerText: CSSProperties = { color: "#b91c1c", fontWeight: 800 };
const sheetBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  background: "rgba(15,23,42,.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  overflow: "auto",
};
const sheet: CSSProperties = {
  width: "min(760px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 32px)",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 24px 70px rgba(15,23,42,.28)",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
};
const wideSheet: CSSProperties = { width: "min(1500px, calc(100vw - 40px))" };
const sheetHeader: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", padding: "12px 14px", borderBottom: "1px solid #e5e7eb" };
const sheetBody: CSSProperties = { padding: 12, overflow: "auto", minHeight: 0 };
const sheetSection: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 };
const sheetTitle: CSSProperties = { margin: "0 0 10px", fontSize: 16, fontWeight: 950 };
const stack: CSSProperties = { display: "grid", gap: 9 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 10px", minWidth: 0 };
const twoCols: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const sheetSubtleBox: CSSProperties = { display: "grid", gap: 3, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg-subtle)", padding: 9, color: "var(--asc-text)", fontSize: 13 };
const testChoiceList: CSSProperties = { display: "grid", gap: 8 };
const testChoiceCard: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr) auto", alignItems: "center", gap: 8, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", padding: 8 };
const testChoiceMeta: CSSProperties = { margin: "3px 0 0", color: "var(--asc-text-muted)", fontSize: 12 };
const omrCreateForm: CSSProperties = { display: "grid", gap: 10, border: "1px solid var(--asc-border)", borderRadius: "var(--asc-radius-md)", background: "var(--asc-bg)", padding: 10 };
const omrCreateSettingsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 };
const omrCreateFieldLabel: CSSProperties = { display: "grid", gap: 4, color: "var(--asc-text-muted)", fontSize: 12 };
const studentReviewGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(320px, .9fr) minmax(360px, 1.1fr)",
  gap: 10,
  alignItems: "stretch",
  height: "min(700px, calc(100vh - 176px))",
  minHeight: 380,
};
const reviewStudentPane: CSSProperties = { ...card, display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0 };
const reviewPreviewPane: CSSProperties = { ...card, minWidth: 0, minHeight: 0 };
const reviewAnswerPane: CSSProperties = { display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10, minWidth: 0, minHeight: 0 };
const studentNavButtons: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 };
const disabledNav: CSSProperties = { ...secondaryButton, opacity: .45, textAlign: "center", cursor: "default" };
const reviewStudentList: CSSProperties = { display: "grid", gap: 6, overflow: "auto", paddingRight: 2 };
const reviewStudentItem: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 9, textDecoration: "none", color: "#111827", background: "#fff", display: "grid", gap: 3 };
const reviewStudentSelected: CSSProperties = { borderColor: "#0b50d0", boxShadow: "inset 3px 0 0 #0b50d0", background: "#e8f0fe" };
const reviewStudentNeedsReview: CSSProperties = { background: "#fffbeb" };
const reviewStudentName: CSSProperties = { fontSize: 13, fontWeight: 950 };
const reviewStudentMeta: CSSProperties = { fontSize: 12, color: "#6b7280", fontWeight: 800 };
const compactPanel: CSSProperties = { ...card, padding: 10 };
const lowQuestionList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 96, overflow: "auto" };
const lowQuestionItem: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #fde68a", borderRadius: 999, background: "#fffbeb", color: "#92400e", padding: "5px 8px", textDecoration: "none", fontSize: 12, fontWeight: 900 };
const reviewInlineForms: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const reviewInlineForm: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1.2fr auto", gap: 6, alignItems: "center" };
const answerReviewForm: CSSProperties = { ...card, display: "grid", gap: 8, minHeight: 0 };
const reviewTableWrap: CSSProperties = { ...tableWrap, maxHeight: "calc(100vh - 400px)", minHeight: 240 };
const reviewFooter: CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, alignItems: "center" };
const correctPill: CSSProperties = { ...badge, background: "#dcfce7", color: "#047857" };
const wrongPill: CSSProperties = { ...badge, background: "#fee2e2", color: "#b91c1c" };
const emptyBox: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 16, textAlign: "center", color: "#6b7280" };
const divider: CSSProperties = { height: 1, background: "#e5e7eb", margin: "10px 0" };
const smallTitle: CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 950 };
const answerGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 6, maxHeight: 260, overflow: "auto", padding: 4 };
const answerCell: CSSProperties = { display: "grid", gridTemplateColumns: "28px 1fr 54px", gap: 5, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 7, padding: 6, fontSize: 12 };
const scoreInput: CSSProperties = { ...miniInput, width: 52 };
const reviewRow: CSSProperties = { background: "#fffbeb" };
