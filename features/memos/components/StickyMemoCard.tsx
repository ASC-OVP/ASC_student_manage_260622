"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { deleteStickyMemoAction, updateStickyMemoAction } from "@/features/memos/actions/memoActions";
import { getStickyMemoColorTheme, normalizeStickyMemoColor, stickyMemoColors } from "@/features/memos/components/stickyMemoColors";

export type StickyMemoCardView = {
  id: string;
  content: string;
  color: string;
  updatedAtText: string;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "empty";

type Props = {
  memo: StickyMemoCardView;
  compact?: boolean;
};

const SAVE_DELAY_MS = 650;

export default function StickyMemoCard({ memo, compact = false }: Props) {
  const normalizedInitialColor = normalizeStickyMemoColor(memo.color);
  const [content, setContent] = useState(memo.content);
  const [color, setColor] = useState(normalizedInitialColor);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  const lastSavedRef = useRef({ content: memo.content, color: normalizedInitialColor });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const theme = getStickyMemoColorTheme(color);

  function queueSave(nextContent: string, nextColor: string) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    const trimmed = nextContent.trim();
    if (!trimmed) {
      setSaveState("empty");
      return;
    }

    if (lastSavedRef.current.content === nextContent && lastSavedRef.current.color === nextColor) {
      setSaveState("idle");
      return;
    }

    setSaveState("dirty");
    saveTimerRef.current = window.setTimeout(() => {
      void saveMemo(nextContent, nextColor);
    }, SAVE_DELAY_MS);
  }

  async function saveMemo(nextContent = content, nextColor = color) {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const trimmed = nextContent.trim();
    if (!trimmed) {
      setSaveState("empty");
      return;
    }

    if (lastSavedRef.current.content === nextContent && lastSavedRef.current.color === nextColor) {
      setSaveState("idle");
      return;
    }

    const saveSeq = saveSeqRef.current + 1;
    saveSeqRef.current = saveSeq;
    setSaveState("saving");

    try {
      const formData = new FormData();
      formData.set("stickyMemoId", memo.id);
      formData.set("content", nextContent);
      formData.set("color", nextColor);
      await updateStickyMemoAction(formData);

      if (saveSeqRef.current === saveSeq) {
        lastSavedRef.current = { content: nextContent, color: nextColor };
        setSaveState("saved");
      }
    } catch {
      if (saveSeqRef.current === saveSeq) setSaveState("error");
    }
  }

  function handleContentChange(nextContent: string) {
    setContent(nextContent);
    queueSave(nextContent, color);
  }

  function handleColorChange(nextColor: string) {
    const normalized = normalizeStickyMemoColor(nextColor);
    setColor(normalized);
    queueSave(content, normalized);
  }

  function statusText() {
    if (saveState === "dirty") return "수정 중";
    if (saveState === "saving") return "저장 중...";
    if (saveState === "saved") return "저장됨";
    if (saveState === "error") return "저장 실패";
    if (saveState === "empty") return "내용을 입력하세요";
    return memo.updatedAtText;
  }

  return (
    <article style={{ ...sticky, ...(compact ? stickyCompact : {}), background: theme.surface, borderColor: theme.border }}>
      <textarea
        value={content}
        required
        rows={compact ? 3 : 4}
        onChange={(event) => handleContentChange(event.target.value)}
        onBlur={() => void saveMemo()}
        style={stickyText}
        aria-label="포스트잇 내용"
      />
      <div style={cardFoot}>
        <ColorPalette current={color} onChange={handleColorChange} />
        <form
          action={deleteStickyMemoAction}
          onSubmit={(event) => {
            if (!window.confirm("이 포스트잇을 삭제할까요?")) event.preventDefault();
          }}
        >
          <input type="hidden" name="stickyMemoId" value={memo.id} />
          <button type="submit" style={deleteButton}>
            삭제
          </button>
        </form>
      </div>
      <small style={{ ...statusLine, ...(saveState === "error" || saveState === "empty" ? statusError : {}) }}>{statusText()}</small>
    </article>
  );
}

function ColorPalette({ current, onChange }: { current: string; onChange: (color: string) => void }) {
  const currentColor = normalizeStickyMemoColor(current);

  return (
    <div style={colorRow} aria-label="포스트잇 색상">
      {stickyMemoColors.map((color) => {
        const selected = currentColor === color.value;

        return (
          <button
            key={color.value}
            type="button"
            title={color.label}
            aria-label={`${color.label} 색상`}
            aria-pressed={selected}
            onClick={() => onChange(color.value)}
            style={{
              ...swatch,
              background: color.value,
              borderColor: selected ? color.accent : "rgba(17,24,39,.2)",
              boxShadow: selected ? `0 0 0 2px ${color.shadow}` : "inset 0 0 0 1px rgba(255,255,255,.72)",
            }}
          >
            {selected && <span style={{ ...swatchCheck, color: color.accent }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

const sticky: CSSProperties = {
  border: "1px solid rgba(146,64,14,.16)",
  borderRadius: 8,
  padding: 10,
  display: "grid",
  gap: 7,
  minHeight: 116,
};
const stickyCompact: CSSProperties = { padding: 9, minHeight: 108 };
const stickyText: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: 0,
  outline: "none",
  resize: "vertical",
  background: "transparent",
  lineHeight: 1.42,
  color: "#111827",
  fontWeight: 800,
  padding: 0,
};
const cardFoot: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
const colorRow: CSSProperties = { display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" };
const swatch: CSSProperties = {
  width: 17,
  height: 17,
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,.2)",
  display: "grid",
  placeItems: "center",
  padding: 0,
  cursor: "pointer",
};
const swatchCheck: CSSProperties = { fontSize: 11, fontWeight: 950, lineHeight: 1 };
const deleteButton: CSSProperties = {
  height: 28,
  border: "1px solid rgba(153,27,27,.28)",
  borderRadius: 7,
  background: "rgba(255,255,255,.62)",
  color: "#991b1b",
  padding: "0 8px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
};
const statusLine: CSSProperties = { color: "#6b7280", fontSize: 11, fontWeight: 850 };
const statusError: CSSProperties = { color: "#b91c1c" };

