"use client";

import { useFormStatus } from "react-dom";
import type { CSSProperties, MouseEvent } from "react";

type Props = {
  examTitle: string;
  totalFiles: number;
};

export default function OmrExamDeleteButton({ examTitle, totalFiles }: Props) {
  const { pending } = useFormStatus();

  function confirmDelete(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const fileText = totalFiles > 0 ? ` 업로드 ${totalFiles}개와 OMR 결과도 함께 삭제됩니다.` : "";
    if (!window.confirm(`${examTitle} 검사를 삭제할까요?${fileText} 학생 성적 이력은 유지됩니다.`)) {
      event.preventDefault();
    }
  }

  return (
    <button type="submit" onClick={confirmDelete} disabled={pending} style={{ ...button, opacity: pending ? 0.55 : 1 }}>
      {pending ? "삭제 중" : "삭제"}
    </button>
  );
}

const button: CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 7,
  background: "#fff",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
  padding: "5px 7px",
  whiteSpace: "nowrap",
};
