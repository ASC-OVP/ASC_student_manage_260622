import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { bulkStudentMemoAction } from "@/app/memos/actions";
import { requireUser } from "@/lib/auth";
import { MemoType } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams?: Promise<{
    q?: string;
    source?: string;
    type?: string;
    important?: string;
    writerId?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
};

type MemoSource = "student" | "class" | "task" | "calendar-private" | "calendar-event";

type MemoRow = {
  key: string;
  source: MemoSource;
  sourceLabel: string;
  targetLabel: string;
  targetHref: string;
  content: string;
  typeLabel: string;
  typeValue: string | null;
  isImportant: boolean;
  writerId: string | null;
  writerName: string;
  createdAt: Date;
  selectableStudentMemoId: string | null;
};

const sourceOptions = [
  ["all", "전체"],
  ["student", "학생"],
  ["class", "반"],
  ["task", "업무"],
  ["calendar-private", "개인 캘린더"],
  ["calendar-event", "일정"],
] as const;

const memoTypes = Object.values(MemoType);

export const dynamic = "force-dynamic";

export default async function MemosPage({ searchParams }: Props) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const filters = normalizeFilters(params);
  const returnTo = buildReturnTo(filters);

  const [studentMemos, classMemos, taskComments, privateMemos, eventMemos, writers] = await Promise.all([
    prisma.studentMemo.findMany({
      where: { student: { academyId: user.academyId } },
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            schoolName: true,
            studentClasses: {
              where: { status: "ACTIVE" },
              take: 1,
              include: { classGroup: { select: { name: true } } },
            },
          },
        },
        writer: { select: { id: true, name: true } },
      },
    }),
    prisma.classMemo.findMany({
      where: { academyId: user.academyId },
      orderBy: { createdAt: "desc" },
      include: {
        classGroup: { select: { id: true, name: true } },
        writer: { select: { id: true, name: true } },
      },
    }),
    prisma.taskComment.findMany({
      where: { task: { academyId: user.academyId } },
      orderBy: { createdAt: "desc" },
      include: {
        writer: { select: { id: true, name: true } },
        task: {
          select: {
            id: true,
            title: true,
            student: { select: { name: true } },
            classGroup: { select: { name: true } },
          },
        },
      },
    }),
    prisma.calendarPrivateMemo.findMany({
      where: { academyId: user.academyId, userId: user.id },
      orderBy: { date: "desc" },
      select: { id: true, userId: true, date: true, content: true, createdAt: true },
    }),
    prisma.calendarEventMemo.findMany({
      where: { academyId: user.academyId },
      orderBy: { eventDate: "desc" },
      include: { writer: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { academyId: user.academyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: MemoRow[] = [
    ...studentMemos.map((memo): MemoRow => ({
      key: `student:${memo.id}`,
      source: "student",
      sourceLabel: "학생",
      targetLabel: [memo.student.name, memo.student.studentClasses[0]?.classGroup.name, memo.student.schoolName].filter(Boolean).join(" / "),
      targetHref: `/students/${memo.studentId}?tab=memos`,
      content: memo.content,
      typeLabel: memoTypeText(memo.type),
      typeValue: memo.type,
      isImportant: memo.isImportant,
      writerId: memo.writerId,
      writerName: memo.writer.name,
      createdAt: memo.createdAt,
      selectableStudentMemoId: memo.id,
    })),
    ...classMemos.map((memo): MemoRow => ({
      key: `class:${memo.id}`,
      source: "class",
      sourceLabel: "반",
      targetLabel: memo.classGroup.name,
      targetHref: `/classes/${memo.classGroupId}`,
      content: memo.content,
      typeLabel: "반 메모",
      typeValue: null,
      isImportant: false,
      writerId: memo.writerId,
      writerName: memo.writer.name,
      createdAt: memo.createdAt,
      selectableStudentMemoId: null,
    })),
    ...taskComments.map((comment): MemoRow => ({
      key: `task:${comment.id}`,
      source: "task",
      sourceLabel: "업무",
      targetLabel: [comment.task.title, comment.task.student?.name, comment.task.classGroup?.name].filter(Boolean).join(" / "),
      targetHref: `/tasks/${comment.taskId}`,
      content: comment.content,
      typeLabel: "업무 메모",
      typeValue: null,
      isImportant: false,
      writerId: comment.writerId,
      writerName: comment.writer.name,
      createdAt: comment.createdAt,
      selectableStudentMemoId: null,
    })),
    ...privateMemos.map((memo): MemoRow => ({
      key: `calendar-private:${memo.id}`,
      source: "calendar-private",
      sourceLabel: "개인 캘린더",
      targetLabel: memo.date,
      targetHref: "/calendar",
      content: memo.content,
      typeLabel: "개인 메모",
      typeValue: null,
      isImportant: false,
      writerId: memo.userId,
      writerName: user.name,
      createdAt: memo.createdAt,
      selectableStudentMemoId: null,
    })),
    ...eventMemos.map((memo): MemoRow => ({
      key: `calendar-event:${memo.id}`,
      source: "calendar-event",
      sourceLabel: "일정",
      targetLabel: [memo.title, memo.eventDate].filter(Boolean).join(" / "),
      targetHref: "/calendar",
      content: memo.content,
      typeLabel: memo.eventType === "task" ? "업무 일정" : "수업 일정",
      typeValue: null,
      isImportant: false,
      writerId: memo.writerId,
      writerName: memo.writer?.name ?? "-",
      createdAt: memo.createdAt,
      selectableStudentMemoId: null,
    })),
  ];

  const filteredRows = sortRows(filterRows(rows, filters), filters.sort);
  const visibleRows = filteredRows.slice(0, 500);
  const studentMemoCount = rows.filter((row) => row.source === "student").length;
  const classMemoCount = rows.filter((row) => row.source === "class").length;
  const importantCount = rows.filter((row) => row.isImportant).length;
  const otherMemoCount = rows.length - studentMemoCount - classMemoCount;

  return (
    <main style={page}>
      <section style={container}>
        <header style={header}>
          <div>
            <p style={eyebrow}>메모 관리</p>
            <h1 style={title}>통합 메모함</h1>
            <p style={desc}>학생, 반, 업무, 캘린더에 흩어진 메모를 한 화면에서 찾고 정리합니다.</p>
          </div>
          <Link href="/memos/new" style={primaryButton}>+ 메모 추가</Link>
        </header>

        <section style={statsGrid}>
          <Stat label="전체 메모" value={`${rows.length}개`} />
          <Stat label="학생 메모" value={`${studentMemoCount}개`} />
          <Stat label="반 메모" value={`${classMemoCount}개`} />
          <Stat label="그 외 메모" value={`${otherMemoCount}개`} />
          <Stat label="중요 메모" value={`${importantCount}개`} tone={importantCount ? "warn" : "default"} />
        </section>

        <form style={filterBar}>
          <input name="q" defaultValue={filters.q} placeholder="내용, 학생명, 반, 작성자 검색" style={searchInput} />
          <select name="source" defaultValue={filters.source} style={selectInput}>
            {sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select name="type" defaultValue={filters.type} style={selectInput}>
            <option value="all">유형 전체</option>
            {memoTypes.map((type) => <option key={type} value={type}>{memoTypeText(type)}</option>)}
          </select>
          <select name="important" defaultValue={filters.important} style={selectInput}>
            <option value="all">중요 전체</option>
            <option value="important">중요만</option>
            <option value="normal">일반만</option>
          </select>
          <select name="writerId" defaultValue={filters.writerId} style={selectInput}>
            <option value="all">작성자 전체</option>
            {writers.map((writer) => <option key={writer.id} value={writer.id}>{writer.name}</option>)}
          </select>
          <input name="from" type="date" defaultValue={filters.from} style={dateInput} />
          <input name="to" type="date" defaultValue={filters.to} style={dateInput} />
          <select name="sort" defaultValue={filters.sort} style={selectInput}>
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="important">중요 우선</option>
          </select>
          <button style={secondaryButton}>적용</button>
          <Link href="/memos" style={ghostButton}>초기화</Link>
        </form>

        <form action={bulkStudentMemoAction} style={tablePanel}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <div style={bulkBar}>
            <div style={bulkLeft}>
              <b>{filteredRows.length}개</b>
              <span>필터 결과</span>
              <span style={muted}>일괄 변경은 학생 메모에만 적용됩니다.</span>
              {filteredRows.length > visibleRows.length && <span style={muted}>최대 500개 표시 중</span>}
            </div>
            <div style={bulkActions}>
              <button name="bulkAction" value="pin" style={smallButton}>중요 표시</button>
              <button name="bulkAction" value="unpin" style={smallButton}>중요 해제</button>
              <select name="memoType" defaultValue="GENERAL" style={compactSelect}>
                {memoTypes.map((type) => <option key={type} value={type}>{memoTypeText(type)}</option>)}
              </select>
              <button name="bulkAction" value="type" style={smallButton}>유형 변경</button>
            </div>
          </div>

          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <Th>선택</Th>
                  <Th>구분</Th>
                  <Th>대상</Th>
                  <Th>내용</Th>
                  <Th>유형</Th>
                  <Th>작성자</Th>
                  <Th>작성일</Th>
                  <Th>이동</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    <Td>
                      {row.selectableStudentMemoId ? (
                        <input type="checkbox" name="studentMemoIds" value={row.selectableStudentMemoId} aria-label={`${row.targetLabel} 선택`} />
                      ) : (
                        <span style={muted}>-</span>
                      )}
                    </Td>
                    <Td>
                      <span style={sourceBadge(row.source)}>{row.sourceLabel}</span>
                      {row.isImportant && <span style={importantBadge}>중요</span>}
                    </Td>
                    <Td><b>{row.targetLabel || "-"}</b></Td>
                    <Td><p style={memoText}>{row.content}</p></Td>
                    <Td>{row.typeLabel}</Td>
                    <Td>{row.writerName}</Td>
                    <Td>{formatDateTime(row.createdAt)}</Td>
                    <Td><Link href={row.targetHref} style={linkButton}>열기</Link></Td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={emptyCell}>조건에 맞는 메모가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </form>
      </section>
    </main>
  );
}

function normalizeFilters(params: Awaited<NonNullable<Props["searchParams"]>>) {
  return {
    q: (params.q ?? "").trim(),
    source: sourceOptions.some(([value]) => value === params.source) ? params.source ?? "all" : "all",
    type: memoTypes.includes(params.type as MemoType) ? params.type ?? "all" : "all",
    important: ["important", "normal"].includes(params.important ?? "") ? params.important ?? "all" : "all",
    writerId: params.writerId || "all",
    from: /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from ?? "" : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to ?? "" : "",
    sort: ["newest", "oldest", "important"].includes(params.sort ?? "") ? params.sort ?? "newest" : "newest",
  };
}

function filterRows(rows: MemoRow[], filters: ReturnType<typeof normalizeFilters>) {
  const query = filters.q.toLocaleLowerCase("ko-KR");
  return rows.filter((row) => {
    if (filters.source !== "all" && row.source !== filters.source) return false;
    if (filters.type !== "all" && row.typeValue !== filters.type) return false;
    if (filters.important === "important" && !row.isImportant) return false;
    if (filters.important === "normal" && row.isImportant) return false;
    if (filters.writerId !== "all" && row.writerId !== filters.writerId) return false;
    if (filters.from && dateKey(row.createdAt) < filters.from) return false;
    if (filters.to && dateKey(row.createdAt) > filters.to) return false;
    if (!query) return true;
    return [row.sourceLabel, row.targetLabel, row.content, row.typeLabel, row.writerName]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(query);
  });
}

function sortRows(rows: MemoRow[], sort: string) {
  return [...rows].sort((a, b) => {
    if (sort === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
    if (sort === "important" && a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

function buildReturnTo(filters: ReturnType<typeof normalizeFilters>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value || value === "all" || (key === "sort" && value === "newest")) continue;
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `/memos?${query}` : "/memos";
}

function memoTypeText(type: string) {
  const labels: Record<string, string> = {
    GENERAL: "일반",
    STUDY: "학습",
    ATTENDANCE: "출결",
    ATTITUDE: "태도",
    COUNSELING: "상담",
    HOMEWORK: "과제",
    CLINIC: "클리닉",
    ETC: "기타",
  };
  return labels[type] ?? type;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div style={{ ...statCard, ...(tone === "warn" ? warnCard : {}) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th style={th}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={td}>{children}</td>;
}

function sourceBadge(source: MemoSource): CSSProperties {
  const colors: Record<MemoSource, { bg: string; fg: string }> = {
    student: { bg: "#dbeafe", fg: "#1d4ed8" },
    class: { bg: "#dcfce7", fg: "#166534" },
    task: { bg: "#fef3c7", fg: "#92400e" },
    "calendar-private": { bg: "#ede9fe", fg: "#6d28d9" },
    "calendar-event": { bg: "#fee2e2", fg: "#991b1b" },
  };
  const color = colors[source];
  return { ...badge, background: color.bg, color: color.fg };
}

const page: CSSProperties = { padding: 14, color: "#111827", background: "#f3f4f6", minHeight: "100vh" };
const container: CSSProperties = { width: "100%", maxWidth: "none", margin: 0, display: "grid", gap: 12 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, background: "#fff", border: "1px solid #dfe3ea", borderRadius: 10, padding: 16 };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "#2563eb", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 25, fontWeight: 950 };
const desc: CSSProperties = { margin: "6px 0 0", color: "#6b7280", fontSize: 14 };
const primaryButton: CSSProperties = { background: "#111827", color: "#fff", borderRadius: 8, padding: "10px 13px", textDecoration: "none", fontWeight: 950, whiteSpace: "nowrap" };
const statsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 };
const statCard: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, display: "grid", gap: 5 };
const warnCard: CSSProperties = { borderColor: "#fde68a", background: "#fffbeb" };
const filterBar: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1.6fr) repeat(4, minmax(116px, .7fr)) repeat(2, 132px) 110px auto auto", gap: 8, background: "#fff", border: "1px solid #dfe3ea", borderRadius: 10, padding: 10, alignItems: "center" };
const searchInput: CSSProperties = { height: 34, border: "1px solid #d1d5db", borderRadius: 7, padding: "0 10px", minWidth: 0 };
const selectInput: CSSProperties = { ...searchInput, background: "#fff" };
const dateInput: CSSProperties = { ...searchInput, background: "#fff" };
const secondaryButton: CSSProperties = { height: 34, border: "1px solid #111827", borderRadius: 7, background: "#111827", color: "#fff", padding: "0 12px", fontWeight: 950, cursor: "pointer" };
const ghostButton: CSSProperties = { height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", color: "#111827", padding: "0 12px", fontWeight: 950, textDecoration: "none" };
const tablePanel: CSSProperties = { background: "#fff", border: "1px solid #dfe3ea", borderRadius: 10, overflow: "hidden" };
const bulkBar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" };
const bulkLeft: CSSProperties = { display: "flex", alignItems: "center", gap: 8, color: "#4b5563", fontSize: 13, flexWrap: "wrap" };
const bulkActions: CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };
const smallButton: CSSProperties = { height: 30, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", color: "#111827", padding: "0 9px", fontSize: 12, fontWeight: 950, cursor: "pointer" };
const compactSelect: CSSProperties = { height: 30, border: "1px solid #d1d5db", borderRadius: 7, background: "#fff", padding: "0 8px", fontSize: 12, fontWeight: 850 };
const tableWrap: CSSProperties = { overflow: "auto" };
const table: CSSProperties = { width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", padding: "9px 10px", background: "#f8fafc", borderBottom: "1px solid #d1d5db", color: "#374151", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "9px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
const memoText: CSSProperties = { margin: 0, maxWidth: 620, whiteSpace: "pre-wrap", lineHeight: 1.45, color: "#374151" };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "4px 7px", fontSize: 11, fontWeight: 950, whiteSpace: "nowrap", marginRight: 5 };
const importantBadge: CSSProperties = { ...badge, background: "#fef3c7", color: "#92400e" };
const linkButton: CSSProperties = { display: "inline-flex", alignItems: "center", height: 26, border: "1px solid #d1d5db", borderRadius: 7, color: "#111827", textDecoration: "none", padding: "0 8px", fontSize: 12, fontWeight: 950, whiteSpace: "nowrap" };
const muted: CSSProperties = { color: "#9ca3af" };
const emptyCell: CSSProperties = { padding: 28, textAlign: "center", color: "#6b7280", fontWeight: 900 };
