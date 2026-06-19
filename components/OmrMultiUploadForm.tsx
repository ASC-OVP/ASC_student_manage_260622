"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { uploadOmrAction } from "@/app/omr/actions";
import { formatOmrBytes, OMR_MAX_BATCH_BYTES, OMR_MAX_BATCH_LABEL, OMR_MAX_FILE_BYTES, OMR_MAX_FILE_LABEL } from "@/lib/omrUploadLimits";

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
  const hasOversizedFile = files.some((file) => file.size > OMR_MAX_FILE_BYTES);
  const isBatchTooLarge = totalSize > OMR_MAX_BATCH_BYTES;
  const isUploadBlocked = hasOversizedFile || isBatchTooLarge;

  return (
    <form action={uploadOmrAction} style={stack}>
      {selectedExamId ? (
        <input type="hidden" name="examId" value={selectedExamId} />
      ) : (
        <select name="examId" defaultValue="" required style={input}>
          <option value="" disabled>
            검사 선택
          </option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.title}
            </option>
          ))}
        </select>
      )}

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

      <p style={hintText}>
        파일 1개 최대 {OMR_MAX_FILE_LABEL}, 한 번에 최대 {OMR_MAX_BATCH_LABEL}까지 업로드할 수 있습니다.
      </p>

      {files.length > 0 && (
        <div style={fileList}>
          <div style={fileListHead}>
            <b>{files.length}개 파일</b>
            <span style={isBatchTooLarge ? dangerText : undefined}>{formatOmrBytes(totalSize)}</span>
          </div>
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} style={fileRow}>
              <span style={fileName}>{file.name}</span>
              <small style={file.size > OMR_MAX_FILE_BYTES ? dangerText : undefined}>{formatOmrBytes(file.size)}</small>
            </div>
          ))}
          {hasOversizedFile && <p style={dangerText}>80MB를 넘는 파일이 있습니다. PDF를 흑백/저해상도로 다시 스캔하거나 파일을 나눠서 올려주세요.</p>}
          {isBatchTooLarge && <p style={dangerText}>선택한 파일 총 용량이 너무 큽니다. 여러 번 나눠서 업로드해주세요.</p>}
        </div>
      )}

      <textarea name="memo" placeholder="메모" rows={2} style={{ ...input, resize: "vertical" }} />
      <SubmitButton disabled={exams.length === 0 || isUploadBlocked} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} style={{ ...primaryButton, opacity: disabled || pending ? 0.55 : 1 }}>
      {pending ? "업로드 중..." : "파일 업로드"}
    </button>
  );
}

const stack: CSSProperties = { display: "grid", gap: 9 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 10px", fontSize: 13, minWidth: 0 };
const primaryButton: CSSProperties = { border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "9px 11px", fontWeight: 900, fontSize: 13, cursor: "pointer" };
const fileList: CSSProperties = { display: "grid", gap: 6, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f8fafc" };
const fileListHead: CSSProperties = { display: "flex", justifyContent: "space-between", color: "#374151", fontSize: 12 };
const fileRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 72px", gap: 6, alignItems: "center", fontSize: 12 };
const fileName: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontWeight: 800 };
const hintText: CSSProperties = { margin: 0, color: "#6b7280", fontSize: 12, lineHeight: 1.45 };
const dangerText: CSSProperties = { margin: 0, color: "#dc2626", fontSize: 12, fontWeight: 800 };
