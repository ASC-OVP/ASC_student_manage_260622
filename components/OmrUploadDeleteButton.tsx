"use client";

import { useFormStatus } from "react-dom";
import type { CSSProperties, MouseEvent } from "react";

type Props = {
  fileName: string;
};

export default function OmrUploadDeleteButton({ fileName }: Props) {
  const { pending } = useFormStatus();

  function confirmDelete(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(`${fileName} OMR 업로드 기록을 삭제할까요? 저장된 채점 결과도 함께 삭제됩니다.`)) {
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
  padding: "6px 8px",
  whiteSpace: "nowrap",
};
