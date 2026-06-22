import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import OmrCloseButton from "@/components/OmrCloseButton";
import OmrExamDeleteButton from "@/components/OmrExamDeleteButton";
import OmrMultiUploadForm from "@/components/OmrMultiUploadForm";
import OmrReviewPreview from "@/components/OmrReviewPreview";
import OmrUploadDeleteButton from "@/components/OmrUploadDeleteButton";
import { requireUser } from "@/lib/auth";
import { todayKoreaDate } from "@/lib/date";
import { ExamResultStatus, OmrAnswerStatus, OmrTemplateType } from "@/lib/generated/prisma";
import { getOmrTemplate, omrTemplateList, type OmrTemplateQuestion } from "@/lib/omrTemplates";
import { OMR_MAX_BATCH_LABEL, OMR_MAX_FILE_LABEL } from "@/lib/omrUploadLimits";
import { prisma } from "@/lib/prisma";
import {
  createExamAction,
  deleteExamAction,
  deleteOmrUploadAction,
  gradeOmrAction,
  gradeSelectedOmrUploadsAction,
  recognizeSelectedOmrUploadsAction,
  saveAnswerKeyAction,
  saveOmrCorrectionsAction,
  updateOmrUploadMatchAction,
  updateOmrUploadSetupAction,
} from "./actions";

type Props = {
  searchParams: Promise<{
    examId?: string;
    uploadId?: string;
    mode?: string;
    new?: string;
    q?: string;
    date?: string;
    classGroupId?: string;
    templateType?: string;
    status?: string;
    pageSize?: string;
    uploadError?: string;
    uploadWarning?: string;
    skipped?: string;
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
type ClassGroupLite = { id: string; name: string; subject: string | null; grade: string | null };
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
  results: ResultSummary[];
};
type ExamWithUploads = {
  id: string;
  classGroupId: string | null;
  title: string;
  subject: string | null;
  examDate: string | null;
  templateType: OmrTemplateType;
  questionCount: number;
  createdAt: Date;
  answerKeys: AnswerKeyLite[];
  uploads: ExamUploadLite[];
  results: ResultSummary[];
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
  const canManageExam = user.role === "ADMIN" || user.role === "MANAGER" || user.role === "TEACHER";
  const q = sp.q?.trim() ?? "";
  const dateFilter = sp.date ?? "";
  const classGroupFilter = sp.classGroupId ?? "";
  const templateFilter = sp.templateType ?? "";
  const statusFilter = sp.status ?? "";
  const pageSize = Number(sp.pageSize || 20);
  const uploadNotice = uploadNoticeMessage(sp.uploadError, sp.uploadWarning, sp.skipped);
  const selectedMode = sp.mode ?? (sp.examId ? "results" : "");

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
            results: { orderBy: { createdAt: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
        },
        results: { orderBy: { createdAt: "desc" } },
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
      select: { id: true, name: true, subject: true, grade: true },
    }),
  ]);

  const classGroupById = new Map(classGroups.map((classGroup) => [classGroup.id, classGroup]));
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
  const showNewSheet = sp.new === "1";

  return (
    <main style={page}>
      <section style={container}>
        <header style={topBar}>
          <div>
            <p style={eyebrow}>OMR 검사</p>
            <h1 style={title}>OMR 검사 기록</h1>
            <p style={desc}>기존 검사 기록을 먼저 확인하고, 새 파일을 올릴 때만 OMR 검사를 시작합니다.</p>
          </div>
          <Link href="/omr?new=1" style={newButton}>+ OMR 검사</Link>
        </header>

        {uploadNotice && <div style={uploadNotice.tone === "error" ? errorNotice : warningNotice}>{uploadNotice.message}</div>}

        <form style={filterBar}>
          <input name="q" defaultValue={q} placeholder="검사명 또는 과목 검색" style={filterInput} />
          <input name="date" type="date" defaultValue={dateFilter} style={filterInput} />
          <select name="classGroupId" defaultValue={classGroupFilter} style={filterSelect}>
            <option value="">전체 반</option>
            {classGroups.map((classGroup) => (
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
                  <tr key={record.id} style={selectedExam?.id === record.id ? selectedRow : undefined}>
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
                        <form action={deleteExamAction} style={inlineDeleteForm}>
                          <input type="hidden" name="examId" value={record.id} />
                          <OmrExamDeleteButton examTitle={record.title} totalFiles={record.totalFiles} />
                        </form>
                      </div>
                    </Td>
                  </tr>
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
          />
        )}
      </section>

      {showNewSheet && (
        <RightSheet title="새 OMR 검사" closeHref="/omr">
          <section style={sheetSection}>
            <h3 style={sheetTitle}>검사 만들기</h3>
            <form action={createExamAction} style={stack}>
              <div style={twoCols}>
                <input name="title" placeholder="검사명" required style={input} />
                <input name="examName" placeholder="시험명" style={input} />
              </div>
              <div style={twoCols}>
                <input name="subject" placeholder="과목" style={input} />
                <select name="classGroupId" defaultValue="" style={input}>
                  <option value="">반 선택</option>
                  {classGroups.map((classGroup) => (
                    <option key={classGroup.id} value={classGroup.id}>
                      {classGroup.name}{classGroup.grade ? ` / ${classGroup.grade}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div style={twoCols}>
                <input name="examDate" type="date" defaultValue={todayKoreaDate()} style={input} />
                <select name="templateType" defaultValue={OmrTemplateType.OTHER} style={input}>
                  {omrTemplateList.map((template) => (
                    <option key={template.type} value={template.type}>{template.label}</option>
                  ))}
                </select>
              </div>
              <input name="questionCount" type="number" min={1} max={45} placeholder="문항 수" style={input} />
              <button style={primaryButton} disabled={!canManageExam}>검사 만들기</button>
            </form>
          </section>
        </RightSheet>
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

function ExamDetail({
  exam,
  record,
  students,
}: {
  exam: ExamWithUploads;
  record: ExamRecord;
  students: StudentOption[];
}) {
  const template = getOmrTemplate(exam.templateType);
  const bulkFormId = `omr-bulk-${exam.id}`;
  const canBulkRegister = exam.uploads.length > 0 && exam.answerKeys.length > 0;

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

      <section style={card}>
        <form id={bulkFormId} action={bulkOmrAction}>
          <input type="hidden" name="examId" value={exam.id} />
        </form>
        <div style={sectionHead}>
          <h2 style={sectionTitle}>학생별 결과 요약</h2>
          <div style={inlineForm}>
            <button type="submit" form={bulkFormId} name="intent" value="recognize:all" style={smallButton} disabled={exam.uploads.length === 0}>전체 인식</button>
            <button type="submit" form={bulkFormId} name="intent" value="grade:all" style={secondaryButton} disabled={!canBulkRegister}>성적 일괄 등록</button>
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
                        <Link href={`/omr?examId=${exam.id}&mode=results&uploadId=${upload.id}`} style={resultButton}>
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
                    <Td><StatusBadge tone={result ? "green" : canRegister ? "yellow" : "gray"}>{result ? "등록 완료" : canRegister ? "등록 가능" : "대기"}</StatusBadge></Td>
                    <Td><Link href={`/omr?examId=${exam.id}&mode=results&uploadId=${upload.id}`} style={resultButton}>답안 확인</Link></Td>
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
  const examId = upload.examId ?? upload.exam?.id ?? "";
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
            <Link href={reviewUploadHref(examId, previousUpload.id)} style={secondaryButton}>이전</Link>
          ) : (
            <span style={disabledNav}>이전</span>
          )}
          {nextUpload ? (
            <Link href={reviewUploadHref(examId, nextUpload.id)} style={secondaryButton}>다음</Link>
          ) : (
            <span style={disabledNav}>다음</span>
          )}
        </div>
        <div style={reviewStudentList}>
          {reviewUploads.map((item) => (
            <ReviewStudentItem key={item.id} upload={item} selected={item.id === upload.id} examId={examId} />
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

function ReviewStudentItem({ upload, selected, examId }: { upload: ExamUploadLite; selected: boolean; examId: string }) {
  const result = upload.results[0];
  const needsReview =
    upload.recognizeStatus === "REVIEW_NEEDED" ||
    upload.recognizeStatus === "FAILED" ||
    upload.recognizedAnswers.some((answer) => answer.status === OmrAnswerStatus.REVIEW_NEEDED || answer.status === OmrAnswerStatus.MULTIPLE);

  return (
    <Link
      href={reviewUploadHref(examId, upload.id)}
      style={{ ...reviewStudentItem, ...(selected ? reviewStudentSelected : {}), ...(needsReview ? reviewStudentNeedsReview : {}) }}
    >
      <div style={reviewStudentName}>{upload.student?.name ?? "학생 매칭 필요"}</div>
      <div style={reviewStudentMeta}>{formatPhoneLast8(upload.phoneLast8)} / {result ? `${result.totalScore}점` : "미채점"}</div>
      <div style={reviewStudentMeta}>{needsReview ? "검수 필요" : recognizeStatusText(upload.recognizeStatus)}</div>
    </Link>
  );
}

function reviewUploadHref(examId: string, uploadId: string) {
  return `/omr?examId=${examId}&mode=results&uploadId=${uploadId}`;
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
          <input name={`score-${question.no}`} type="hidden" value={answerKey?.score ?? resultItem?.score ?? 1} />
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
      <aside style={{ ...sheet, ...(wide ? wideSheet : {}) }}>
        <div style={sheetHeader}>
          <h2 style={sectionTitle}>{title}</h2>
          <OmrCloseButton href={closeHref} />
        </div>
        {children}
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
  const status = batchStatus({ totalFiles, matchedCount, reviewNeededCount, gradedCount: gradedUploads.length, failedCount });

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
    registeredCount: exam.results.length,
    averageScore,
    highScore,
    lowScore,
    status,
  };
}

function batchStatus(stats: { totalFiles: number; matchedCount: number; reviewNeededCount: number; gradedCount: number; failedCount: number }) {
  if (stats.totalFiles === 0) return "WAITING";
  if (stats.failedCount > 0) return "FAILED";
  if (stats.matchedCount < stats.totalFiles) return "NEEDS_MATCH";
  if (stats.reviewNeededCount > 0) return "REVIEW_NEEDED";
  if (stats.gradedCount >= stats.totalFiles) return "REGISTERED";
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

function studentLabel(student: StudentOption | StudentBrief) {
  return [student.name, student.schoolName, student.grade].filter(Boolean).join(" / ");
}

const page: CSSProperties = { minHeight: "100vh", background: "#f3f4f6", color: "#111827" };
const container: CSSProperties = { maxWidth: 1480, margin: "0 auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const topBar: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 };
const errorNotice: CSSProperties = { border: "1px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#991b1b", padding: "10px 12px", fontSize: 13, fontWeight: 800 };
const warningNotice: CSSProperties = { border: "1px solid #fde68a", borderRadius: 10, background: "#fffbeb", color: "#92400e", padding: "10px 12px", fontSize: 13, fontWeight: 800 };
const eyebrow: CSSProperties = { margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950 };
const title: CSSProperties = { margin: "3px 0", fontSize: 28, fontWeight: 950 };
const desc: CSSProperties = { margin: 0, color: "#6b7280" };
const newButton: CSSProperties = { background: "#111827", color: "#fff", borderRadius: 8, padding: "10px 14px", textDecoration: "none", fontWeight: 950, whiteSpace: "nowrap" };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 150px 150px 150px 150px 100px auto auto", gap: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 };
const filterInput: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 7, padding: "8px 9px", minWidth: 0 };
const filterSelect: CSSProperties = { ...filterInput };
const card: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 };
const sectionHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const muted: CSSProperties = { margin: 0, color: "#6b7280", fontSize: 13 };
const tableWrap: CSSProperties = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", whiteSpace: "nowrap" };
const subText: CSSProperties = { color: "#6b7280", fontSize: 12, marginTop: 3 };
const selectedRow: CSSProperties = { background: "#eff6ff" };
const emptyCell: CSSProperties = { padding: 34, textAlign: "center", color: "#6b7280" };
const resultButton: CSSProperties = { color: "#1d4ed8", fontWeight: 950, textDecoration: "none" };
const actionLinks: CSSProperties = { display: "inline-flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" };
const inlineDeleteForm: CSSProperties = { margin: 0 };
const smallButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 7, background: "#111827", color: "#fff", padding: "8px 10px", fontWeight: 900, cursor: "pointer", textDecoration: "none" };
const lightButton: CSSProperties = { ...smallButton, background: "#fff", color: "#111827", textAlign: "center" };
const primaryButton: CSSProperties = { border: 0, borderRadius: 8, background: "#111827", color: "#fff", padding: "10px 12px", fontWeight: 950, cursor: "pointer" };
const secondaryButton: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#111827", padding: "9px 11px", fontWeight: 900, cursor: "pointer" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 8px", background: "#f3f4f6", color: "#374151", fontWeight: 900, fontSize: 12 };
const toneStyles: Record<Tone, CSSProperties> = {
  gray: { background: "#f3f4f6", color: "#374151" },
  blue: { background: "#dbeafe", color: "#1d4ed8" },
  green: { background: "#dcfce7", color: "#047857" },
  yellow: { background: "#fef3c7", color: "#92400e" },
  red: { background: "#fee2e2", color: "#b91c1c" },
};
const detailGrid: CSSProperties = { display: "grid", gap: 12 };
const miniStats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 };
const miniStat: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 4 };
const inlineForm: CSSProperties = { display: "inline-flex", gap: 6, alignItems: "center" };
const miniDetails: CSSProperties = { marginTop: 5, color: "#6b7280" };
const miniStack: CSSProperties = { display: "grid", gridTemplateColumns: "110px minmax(130px, 1fr) auto", gap: 5, marginTop: 6 };
const miniInput: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 7px", minWidth: 0, fontSize: 12 };
const tinyButton: CSSProperties = { ...smallButton, padding: "6px 8px", fontSize: 12 };
const dangerText: CSSProperties = { color: "#b91c1c", fontWeight: 800 };
const sheetBackdrop: CSSProperties = { position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,23,42,.28)", display: "flex", justifyContent: "flex-end" };
const sheet: CSSProperties = { width: 440, maxWidth: "94vw", height: "100vh", background: "#fff", boxShadow: "-18px 0 40px rgba(15,23,42,.18)", padding: 16, overflow: "auto" };
const wideSheet: CSSProperties = { width: "min(1500px, 96vw)" };
const sheetHeader: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, position: "sticky", top: 0, zIndex: 2, background: "#fff", paddingBottom: 12, borderBottom: "1px solid #e5e7eb", marginBottom: 14 };
const sheetSection: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 };
const sheetTitle: CSSProperties = { margin: "0 0 10px", fontSize: 16, fontWeight: 950 };
const stack: CSSProperties = { display: "grid", gap: 9 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 10px", minWidth: 0 };
const twoCols: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const studentReviewGrid: CSSProperties = { display: "grid", gridTemplateColumns: "250px minmax(420px, 1fr) minmax(540px, 1fr)", gap: 12, alignItems: "stretch", minHeight: "calc(100vh - 100px)" };
const reviewStudentPane: CSSProperties = { ...card, display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0 };
const reviewPreviewPane: CSSProperties = { ...card, minWidth: 0, minHeight: 0 };
const reviewAnswerPane: CSSProperties = { display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10, minWidth: 0, minHeight: 0 };
const studentNavButtons: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 };
const disabledNav: CSSProperties = { ...secondaryButton, opacity: .45, textAlign: "center", cursor: "default" };
const reviewStudentList: CSSProperties = { display: "grid", gap: 6, overflow: "auto", paddingRight: 2 };
const reviewStudentItem: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 9, textDecoration: "none", color: "#111827", background: "#fff", display: "grid", gap: 3 };
const reviewStudentSelected: CSSProperties = { borderColor: "#2563eb", boxShadow: "inset 3px 0 0 #2563eb", background: "#eff6ff" };
const reviewStudentNeedsReview: CSSProperties = { background: "#fffbeb" };
const reviewStudentName: CSSProperties = { fontSize: 13, fontWeight: 950 };
const reviewStudentMeta: CSSProperties = { fontSize: 12, color: "#6b7280", fontWeight: 800 };
const compactPanel: CSSProperties = { ...card, padding: 10 };
const lowQuestionList: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 96, overflow: "auto" };
const lowQuestionItem: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #fde68a", borderRadius: 999, background: "#fffbeb", color: "#92400e", padding: "5px 8px", textDecoration: "none", fontSize: 12, fontWeight: 900 };
const reviewInlineForms: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const reviewInlineForm: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1.2fr auto", gap: 6, alignItems: "center" };
const answerReviewForm: CSSProperties = { ...card, display: "grid", gap: 8, minHeight: 0 };
const reviewTableWrap: CSSProperties = { ...tableWrap, maxHeight: "calc(100vh - 420px)", minHeight: 300 };
const reviewFooter: CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, alignItems: "center" };
const correctPill: CSSProperties = { ...badge, background: "#dcfce7", color: "#047857" };
const wrongPill: CSSProperties = { ...badge, background: "#fee2e2", color: "#b91c1c" };
const emptyBox: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 28, textAlign: "center", color: "#6b7280" };
const divider: CSSProperties = { height: 1, background: "#e5e7eb", margin: "10px 0" };
const smallTitle: CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 950 };
const answerGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 6, maxHeight: 260, overflow: "auto", padding: 4 };
const answerCell: CSSProperties = { display: "grid", gridTemplateColumns: "28px 1fr 54px", gap: 5, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 7, padding: 6, fontSize: 12 };
const scoreInput: CSSProperties = { ...miniInput, width: 52 };
const reviewRow: CSSProperties = { background: "#fffbeb" };
