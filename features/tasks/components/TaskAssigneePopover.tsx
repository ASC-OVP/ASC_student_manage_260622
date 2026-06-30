"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type StaffMember = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  taskId: string;
  currentLabel: string;
  selectedAssigneeIds: string[];
  staff: StaffMember[];
  action: (formData: FormData) => void | Promise<void>;
};

const panelWidth = 280;
const panelHeight = 360;
const viewportGap = 8;

export default function TaskAssigneePopover({ taskId, currentLabel, selectedAssigneeIds, staff, action }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedIds = new Set(selectedAssigneeIds);
  const candidates = staff.filter((member) => ["ADMIN", "MANAGER", "TEACHER", "ASSISTANT"].includes(member.role));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    let left = rect.right - panelWidth;
    let top = rect.bottom + 6;

    if (left < viewportGap) left = viewportGap;
    if (left + panelWidth > window.innerWidth - viewportGap) left = window.innerWidth - panelWidth - viewportGap;
    if (top + panelHeight > window.innerHeight - viewportGap) top = rect.top - panelHeight - 6;
    if (top < viewportGap) top = viewportGap;

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleViewportChange = () => updatePosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        style={triggerButton}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        담당 변경
      </button>
      {open &&
        createPortal(
          <div ref={panelRef} style={{ ...panel, top: position.top, left: position.left }}>
            <div style={panelHead}>
              <div>
                <b>담당자 변경</b>
                <p style={currentText}>현재 {currentLabel}</p>
              </div>
              <button type="button" style={closeButton} onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <form action={action} style={form} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="taskId" value={taskId} />
              <div style={list}>
                {candidates.map((member) => (
                  <label key={member.id} style={option}>
                    <input type="checkbox" name="assigneeIds" value={member.id} defaultChecked={selectedIds.has(member.id)} />
                    <span>
                      <b>{member.name}</b>
                      <em>{roleLabel(member.role)}</em>
                    </span>
                  </label>
                ))}
              </div>
              <div style={actions}>
                <button type="button" style={ghostButton} onClick={() => setOpen(false)}>
                  취소
                </button>
                <button style={primaryButton}>저장</button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </>
  );
}

function roleLabel(role: string) {
  if (role === "ADMIN") return "관리자";
  if (role === "MANAGER") return "실장";
  if (role === "TEACHER") return "강사";
  if (role === "ASSISTANT") return "조교";
  return role;
}

const triggerButton: CSSProperties = {
  height: 28,
  border: "1px solid var(--asc-border-strong)",
  borderRadius: "var(--asc-radius-md)",
  background: "var(--asc-bg)",
  color: "var(--asc-text)",
  padding: "0 9px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
};
const panel: CSSProperties = {
  position: "fixed",
  zIndex: 79,
  width: panelWidth,
  maxWidth: "calc(100vw - 16px)",
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-lg)",
  background: "var(--asc-bg)",
  boxShadow: "0 18px 42px rgba(15,23,42,.22)",
  padding: 10,
};
const panelHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 8 };
const currentText: CSSProperties = { margin: "2px 0 0", color: "var(--asc-text-muted)", fontSize: 12, fontWeight: 850 };
const closeButton: CSSProperties = {
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-md)",
  background: "var(--asc-bg)",
  color: "var(--asc-text)",
  padding: "5px 7px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
};
const form: CSSProperties = { display: "grid", gap: 8 };
const list: CSSProperties = { display: "grid", gap: 5, maxHeight: 220, overflow: "auto" };
const option: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px 1fr",
  gap: 6,
  alignItems: "center",
  border: "1px solid var(--asc-border)",
  borderRadius: "var(--asc-radius-md)",
  padding: "6px 7px",
  fontSize: 12,
};
const actions: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 6 };
const primaryButton: CSSProperties = {
  height: 28,
  border: "1px solid var(--asc-primary)",
  borderRadius: "var(--asc-radius-md)",
  background: "var(--asc-primary)",
  color: "#fff",
  padding: "0 9px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
};
const ghostButton: CSSProperties = {
  ...primaryButton,
  background: "var(--asc-bg)",
  color: "var(--asc-text)",
  border: "1px solid var(--asc-border-strong)",
};
