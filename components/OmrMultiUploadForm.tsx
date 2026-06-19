"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { uploadOmrAction } from "@/app/omr/actions";

type ExamOption = {
  id: string;
  title: string;
};

type Props = {
  exams: ExamOption[];
  selectedExamId?: string;
};

export default function OmrMultiUploadForm({ exams, selectedExamId }: Props) {
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([]);
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  return (
    <form action={uploadOmrAction} style={stack}>
      <select name="examId" defaultValue={selectedExamId ?? ""} required style={input}>
        <option value="" disabled>
          검사 선택
        </option>
        {exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.title}
          </option>
        ))}
      </select>

      <input
        name="files"
        type="file"
        accept="application/pdf,image/*,.pdf"
        multiple
        required
        style={input}
        onChange={(event) => {
          const selectedFiles = Array.from(event.currentTarget.files ?? []).map((file) => ({ name: file.name, size: file.size }));
          setFiles(selectedFiles);
        }}
      />

      {files.length > 0 && (
        <div style={fileList}>
          <div style={fileListHead}>
            <b>{files.length}개 파일</b>
            <span>{formatBytes(totalSize)}</span>
          </div>
          {files.map((file, index) => (
            <label key={`${file.name}-${index}`} style={fileRow}>
              <span style={fileName}>{file.name}</span>
              <input name={`phoneLast8-${index}`} placeholder="전화번호 뒤 8자리" style={phoneInput} inputMode="numeric" />
              <small>{formatBytes(file.size)}</small>
            </label>
          ))}
        </div>
      )}

      <textarea name="memo" placeholder="메모" rows={2} style={{ ...input, resize: "vertical" }} />
      <SubmitButton disabled={exams.length === 0} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} style={{ ...primaryButton, opacity: disabled || pending ? 0.55 : 1 }}>
      {pending ? "업로드 중" : "선택 파일 업로드"}
    </button>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

const stack: CSSProperties = { display: "grid", gap: 9 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 10px", fontSize: 13, minWidth: 0 };
const primaryButton: CSSProperties = { border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "9px 11px", fontWeight: 900, fontSize: 13, cursor: "pointer" };
const fileList: CSSProperties = { display: "grid", gap: 6, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f8fafc" };
const fileListHead: CSSProperties = { display: "flex", justifyContent: "space-between", color: "#374151", fontSize: 12 };
const fileRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px 64px", gap: 6, alignItems: "center", fontSize: 12 };
const fileName: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontWeight: 800 };
const phoneInput: CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 7px", fontSize: 12, minWidth: 0 };
