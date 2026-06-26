"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type StudentRow = {
  id: string;
  name: string;
  schoolName: string | null;
  grade: string | null;
  subject: string | null;
  currentLevel: string | null;
  status: string;
  basicMemo: string | null;
  recentMemo: string | null;
};

type LocalProgress = {
  attendance: AttendanceStatus;
  homework: HomeworkStatus;
  latestScore: string;
  boardMemo: string;
};

type AttendanceStatus =
  | "현장"
  | "지각"
  | "영상"
  | "보강"
  | "자료"
  | "조퇴"
  | "출튀"
  | "결석"
  | "부재"
  | "퇴원";

type HomeworkStatus = "미확인" | "완료" | "부분" | "미완료";

type SortMode =
  | "nameAsc"
  | "scoreDesc"
  | "schoolAsc"
  | "gradeAsc"
  | "attendanceAsc"
  | "homeworkAsc";

const ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  "현장",
  "지각",
  "영상",
  "보강",
  "자료",
  "조퇴",
  "출튀",
  "결석",
  "부재",
  "퇴원",
];

const HOMEWORK_OPTIONS: HomeworkStatus[] = ["미확인", "완료", "부분", "미완료"];

const STORAGE_KEY = "asc-student-excel-board-v1";

export default function StudentExcelTable({ students }: { students: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("nameAsc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAttendance, setBulkAttendance] = useState<AttendanceStatus>("현장");
  const [progress, setProgress] = useState<Record<string, LocalProgress>>(loadSavedProgress);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const mergedRows = useMemo(() => {
    return students.map((student) => ({
      ...student,
      progress: progress[student.id] ?? defaultProgress(),
    }));
  }, [students, progress]);

  const filteredRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const school = schoolQuery.trim().toLowerCase();

    const filtered = mergedRows.filter((row) => {
      const searchText = [
        row.name,
        row.schoolName ?? "",
        row.grade ?? "",
        row.subject ?? "",
        row.currentLevel ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const schoolText = (row.schoolName ?? "").toLowerCase();

      return searchText.includes(text) && schoolText.includes(school);
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "scoreDesc") {
        return toNumber(b.progress.latestScore) - toNumber(a.progress.latestScore);
      }

      if (sortMode === "schoolAsc") {
        return (a.schoolName ?? "").localeCompare(b.schoolName ?? "", "ko-KR");
      }

      if (sortMode === "gradeAsc") {
        return (a.grade ?? "").localeCompare(b.grade ?? "", "ko-KR");
      }

      if (sortMode === "attendanceAsc") {
        return a.progress.attendance.localeCompare(b.progress.attendance, "ko-KR");
      }

      if (sortMode === "homeworkAsc") {
        return a.progress.homework.localeCompare(b.progress.homework, "ko-KR");
      }

      return a.name.localeCompare(b.name, "ko-KR");
    });
  }, [mergedRows, query, schoolQuery, sortMode]);

  function updateProgress(studentId: string, patch: Partial<LocalProgress>) {
    setProgress((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? defaultProgress()),
        ...patch,
      },
    }));
  }

  function toggleSelect(studentId: string) {
    setSelectedIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  }

  function toggleAllVisible() {
    const visibleIds = filteredRows.map((row) => row.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function applyBulkAttendance() {
    setProgress((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        next[id] = {
          ...(next[id] ?? defaultProgress()),
          attendance: bulkAttendance,
        };
      });
      return next;
    });
  }

  return (
    <section style={cardStyle}>
      <div style={toolbarStyle}>
        <div style={filterGroupStyle}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 학년, 과목 검색"
            style={searchInputStyle}
          />

          <input
            value={schoolQuery}
            onChange={(event) => setSchoolQuery(event.target.value)}
            placeholder="학교 검색"
            style={searchInputStyle}
          />

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            style={selectStyle}
          >
            <option value="nameAsc">이름 가나다순</option>
            <option value="scoreDesc">성적 좋은순</option>
            <option value="schoolAsc">학교 가나다순</option>
            <option value="gradeAsc">학년순</option>
            <option value="attendanceAsc">출결 상태순</option>
            <option value="homeworkAsc">과제 상태순</option>
          </select>
        </div>

        <div style={bulkBoxStyle}>
          <strong>{selectedIds.length}명 선택</strong>
          <select
            value={bulkAttendance}
            onChange={(event) => setBulkAttendance(event.target.value as AttendanceStatus)}
            style={selectStyle}
          >
            {ATTENDANCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button type="button" onClick={applyBulkAttendance} style={darkButtonStyle}>
            출결 일괄 변경
          </button>
        </div>
      </div>

      <div style={summaryStyle}>
        <span>전체 {students.length}명</span>
        <span>검색 결과 {filteredRows.length}명</span>
        <span>선택 {selectedIds.length}명</span>
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={stickyThStyle}>
                <input
                  type="checkbox"
                  checked={
                    filteredRows.length > 0 &&
                    filteredRows.every((row) => selectedIds.includes(row.id))
                  }
                  onChange={toggleAllVisible}
                />
              </th>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>학교</th>
              <th style={thStyle}>학년</th>
              <th style={thStyle}>과목</th>
              <th style={thStyle}>레벨</th>
              <th style={thStyle}>출결</th>
              <th style={thStyle}>과제</th>
              <th style={thStyle}>성적</th>
              <th style={thStyle}>메모</th>
              <th style={thStyle}>상세</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} style={emptyCellStyle}>
                  조건에 맞는 학생이 없습니다.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} style={selectedIds.includes(row.id) ? selectedRowStyle : rowStyle}>
                  <td style={tdCenterStyle}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelect(row.id)}
                    />
                  </td>
                  <td style={nameCellStyle}>{row.name}</td>
                  <td style={tdStyle}>{row.schoolName ?? "-"}</td>
                  <td style={tdStyle}>{row.grade ?? "-"}</td>
                  <td style={tdStyle}>{row.subject ?? "-"}</td>
                  <td style={tdStyle}>{row.currentLevel ?? "-"}</td>
                  <td style={tdStyle}>
                    <select
                      value={row.progress.attendance}
                      onChange={(event) =>
                        updateProgress(row.id, {
                          attendance: event.target.value as AttendanceStatus,
                        })
                      }
                      style={cellSelectStyle(row.progress.attendance)}
                    >
                      {ATTENDANCE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={row.progress.homework}
                      onChange={(event) =>
                        updateProgress(row.id, {
                          homework: event.target.value as HomeworkStatus,
                        })
                      }
                      style={cellSelectStyle(row.progress.homework)}
                    >
                      {HOMEWORK_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={row.progress.latestScore}
                      onChange={(event) =>
                        updateProgress(row.id, {
                          latestScore: event.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                      placeholder="점수"
                      style={scoreInputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={row.progress.boardMemo}
                      onChange={(event) =>
                        updateProgress(row.id, {
                          boardMemo: event.target.value,
                        })
                      }
                      placeholder={row.recentMemo ?? row.basicMemo ?? "메모"}
                      style={memoInputStyle}
                    />
                  </td>
                  <td style={tdCenterStyle}>
                    <Link href={`/students/${row.id}`} style={linkStyle}>
                      보기
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={noticeStyle}>
        현재 출결·과제·성적 칸은 빠른 MVP용 임시 저장입니다. 브라우저에 저장되며, 다음 단계에서 DB 저장형으로 바꿀 수 있습니다.
      </p>
    </section>
  );
}

function defaultProgress(): LocalProgress {
  return {
    attendance: "현장",
    homework: "미확인",
    latestScore: "",
    boardMemo: "",
  };
}

function loadSavedProgress(): Record<string, LocalProgress> {
  if (typeof window === "undefined") return {};

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return {};

  try {
    return JSON.parse(saved) as Record<string, LocalProgress>;
  } catch {
    return {};
  }
}

function toNumber(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? num : -1;
}

function cellSelectStyle(value: string): CSSProperties {
  const base: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontWeight: 800,
    backgroundColor: "#ffffff",
    color: "#111827",
  };

  if (["현장", "완료"].includes(value)) {
    return { ...base, backgroundColor: "#dcfce7", color: "#166534" };
  }

  if (["지각", "영상", "보강", "부분"].includes(value)) {
    return { ...base, backgroundColor: "#e8f0fe", color: "#083891" };
  }

  if (["결석", "미완료", "퇴원"].includes(value)) {
    return { ...base, backgroundColor: "#fee2e2", color: "#991b1b" };
  }

  return { ...base, backgroundColor: "#f3f4f6", color: "#374151" };
}

const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 8px 20px rgba(15,23,42,.06)",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  marginBottom: 14,
  flexWrap: "wrap",
};

const filterGroupStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const searchInputStyle: CSSProperties = {
  width: 230,
  padding: "11px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  color: "#111827",
  backgroundColor: "#ffffff",
};

const selectStyle: CSSProperties = {
  padding: "11px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  color: "#111827",
  backgroundColor: "#ffffff",
};

const bulkBoxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const darkButtonStyle: CSSProperties = {
  padding: "11px 14px",
  border: "none",
  borderRadius: 10,
  background: "#111827",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const summaryStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  color: "#6b7280",
  fontWeight: 800,
  marginBottom: 12,
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: 1160,
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#f9fafb",
  color: "#374151",
  fontWeight: 900,
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const stickyThStyle: CSSProperties = {
  ...thStyle,
  width: 48,
  textAlign: "center",
};

const rowStyle: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
};

const selectedRowStyle: CSSProperties = {
  ...rowStyle,
  backgroundColor: "#f5f3ff",
};

const tdStyle: CSSProperties = {
  padding: "10px",
  color: "#111827",
  verticalAlign: "middle",
};

const tdCenterStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "center",
};

const nameCellStyle: CSSProperties = {
  ...tdStyle,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const scoreInputStyle: CSSProperties = {
  width: 74,
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  color: "#111827",
  backgroundColor: "#ffffff",
};

const memoInputStyle: CSSProperties = {
  width: 260,
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  color: "#111827",
  backgroundColor: "#ffffff",
};

const emptyCellStyle: CSSProperties = {
  padding: 30,
  textAlign: "center",
  color: "#6b7280",
};

const linkStyle: CSSProperties = {
  color: "#083891",
  fontWeight: 900,
  textDecoration: "none",
};

const noticeStyle: CSSProperties = {
  margin: "14px 0 0",
  color: "#6b7280",
  fontSize: 13,
};
