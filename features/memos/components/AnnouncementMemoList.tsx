import type { CSSProperties } from "react";
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
  markAnnouncementReadAction,
  updateAnnouncementAction,
} from "@/features/memos/actions/memoActions";

export type AnnouncementMemoView = {
  id: string;
  title: string;
  content: string;
  priority: "NORMAL" | "IMPORTANT" | "URGENT" | string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
  readAt: Date | null;
  readCount: number;
};

type Props = {
  announcements: AnnouncementMemoView[];
  canManage: boolean;
  error?: string;
};

export default function AnnouncementMemoList({ announcements, canManage, error }: Props) {
  const pinned = announcements.filter((memo) => memo.isPinned);
  const normal = announcements.filter((memo) => !memo.isPinned);
  const unreadCount = announcements.filter((memo) => !memo.readAt).length;

  return (
    <section style={panel}>
      <div style={head}>
        <div>
          <p style={eyebrow}>운영 공지 센터</p>
          <h2 style={title}>공유 공지</h2>
          <p style={desc}>조교와 직원이 먼저 확인해야 하는 운영 공지입니다.</p>
        </div>
        <div style={headRight}>
          <div style={summary}>
            <span>전체 <b>{announcements.length}</b></span>
            <span>미확인 <b>{unreadCount}</b></span>
          </div>
          {canManage && (
            <details style={composeDetails}>
              <summary style={writeButton}>+ 공지 작성</summary>
              <form action={createAnnouncementAction} style={composeBox}>
                <input name="title" placeholder="공지 제목" required style={input} />
                <textarea name="content" placeholder="조교/직원에게 전달할 내용을 입력하세요." required rows={3} style={textarea} />
                <div style={composeBottom}>
                  <select name="priority" defaultValue="NORMAL" style={select}>
                    <option value="NORMAL">일반</option>
                    <option value="IMPORTANT">중요</option>
                    <option value="URGENT">긴급</option>
                  </select>
                  <label style={checkLabel}><input type="checkbox" name="isPinned" /> 고정</label>
                  <button style={primaryButton}>등록</button>
                </div>
              </form>
            </details>
          )}
        </div>
      </div>

      {error && <p style={errorBox}>{errorText(error)}</p>}

      <div style={list}>
        {pinned.length > 0 && (
          <div style={pinnedGroup}>
            <div style={groupHead}>
              <b style={groupLabel}>고정 공지</b>
              <span style={groupCount}>{pinned.length}개</span>
            </div>
            {pinned.map((memo) => <AnnouncementCard key={memo.id} memo={memo} canManage={canManage} />)}
          </div>
        )}

        {normal.length > 0 && (
          <div style={normalGroup}>
            <div style={groupHead}>
              <b style={normalGroupLabel}>최근 공지</b>
              <span style={groupCount}>{normal.length}개</span>
            </div>
            {normal.map((memo) => <AnnouncementCard key={memo.id} memo={memo} canManage={canManage} />)}
          </div>
        )}

        {announcements.length === 0 && (
          <Empty
            title="아직 공유된 운영 공지가 없습니다."
            desc={canManage ? "+ 공지 작성으로 첫 운영 공지를 등록해보세요." : "새 공지가 올라오면 이곳에서 먼저 확인할 수 있습니다."}
          />
        )}
      </div>
    </section>
  );
}

function AnnouncementCard({ memo, canManage }: { memo: AnnouncementMemoView; canManage: boolean }) {
  return (
    <article style={{ ...card, ...priorityCard(memo.priority), ...(memo.isPinned ? pinnedCard : {}) }}>
      <div style={cardHead}>
        <div style={cardTitleWrap}>
          <div style={badgeLine}>
            {memo.isPinned && <span style={pinBadge}>고정</span>}
            <span style={priorityBadge(memo.priority)}>{priorityText(memo.priority)}</span>
            {memo.readAt ? <span style={readBadge}>확인함</span> : <span style={unreadBadge}>미확인</span>}
          </div>
          <h3 style={cardTitle}>{memo.title}</h3>
          <p style={content}>{memo.content}</p>
        </div>
        {!memo.readAt && (
          <form action={markAnnouncementReadAction}>
            <input type="hidden" name="announcementId" value={memo.id} />
            <button style={confirmButton}>확인함</button>
          </form>
        )}
      </div>

      <div style={cardFoot}>
        <span>{memo.authorName}</span>
        <span>{formatDateTime(memo.createdAt)}</span>
        <span>확인 {memo.readCount}명</span>
      </div>

      {canManage && (
        <details style={details}>
          <summary style={summaryButton}>관리</summary>
          <div style={editGrid}>
            <form action={updateAnnouncementAction} style={editForm}>
              <input type="hidden" name="announcementId" value={memo.id} />
              <input name="title" defaultValue={memo.title} required style={input} />
              <textarea name="content" defaultValue={memo.content} required rows={3} style={textarea} />
              <div style={composeBottom}>
                <select name="priority" defaultValue={memo.priority} style={select}>
                  <option value="NORMAL">일반</option>
                  <option value="IMPORTANT">중요</option>
                  <option value="URGENT">긴급</option>
                </select>
                <label style={checkLabel}><input type="checkbox" name="isPinned" defaultChecked={memo.isPinned} /> 고정</label>
                <button style={smallButton}>저장</button>
              </div>
            </form>
            <form action={deleteAnnouncementAction}>
              <input type="hidden" name="announcementId" value={memo.id} />
              <button style={dangerButton}>삭제</button>
            </form>
          </div>
        </details>
      )}
    </article>
  );
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={empty}>
      <b>{title}</b>
      <span>{desc}</span>
    </div>
  );
}

function priorityText(priority: string) {
  if (priority === "URGENT") return "긴급";
  if (priority === "IMPORTANT") return "중요";
  return "일반";
}

function priorityBadge(priority: string): CSSProperties {
  if (priority === "URGENT") return { ...badge, background: "#fee2e2", color: "#991b1b" };
  if (priority === "IMPORTANT") return { ...badge, background: "#fef3c7", color: "#92400e" };
  return { ...badge, background: "#e0f2fe", color: "#0369a1" };
}

function priorityCard(priority: string): CSSProperties {
  if (priority === "URGENT") return { borderColor: "#fecaca", background: "#fff7f7" };
  if (priority === "IMPORTANT") return { borderColor: "#fde68a", background: "#fffdf3" };
  return {};
}

function errorText(error: string) {
  if (error === "permission") return "공지 작성/수정/삭제 권한이 없습니다.";
  if (error === "announcement-empty") return "공지 제목과 내용을 입력해주세요.";
  return "요청을 처리하지 못했습니다.";
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const panel: CSSProperties = { background: "#fff", border: "1px solid #dfe3ea", borderRadius: 8, padding: 12, display: "grid", gap: 10, minWidth: 0 };
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const eyebrow: CSSProperties = { margin: "0 0 4px", color: "var(--asc-primary-deep)", fontWeight: 950, fontSize: 12 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "3px 0 0", color: "#6b7280", fontSize: 12 };
const headRight: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" };
const summary: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", color: "#4b5563", fontSize: 12, fontWeight: 900 };
const errorBox: CSSProperties = { margin: 0, padding: 10, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontWeight: 900 };
const composeDetails: CSSProperties = { position: "relative" };
const writeButton: CSSProperties = { height: 30, display: "inline-flex", alignItems: "center", borderRadius: 7, background: "#111827", color: "#fff", padding: "0 10px", fontSize: 12, fontWeight: 950, cursor: "pointer", listStyle: "none", whiteSpace: "nowrap" };
const composeBox: CSSProperties = { position: "absolute", top: 36, right: 0, zIndex: 5, width: "min(460px, calc(100vw - 96px))", display: "grid", gap: 8, border: "1px solid #d1d5db", borderRadius: 8, padding: 10, background: "#fff", boxShadow: "0 18px 40px rgba(15,23,42,.18)" };
const input: CSSProperties = { width: "100%", minWidth: 0, height: 34, border: "1px solid #d1d5db", borderRadius: 7, padding: "0 10px", background: "#fff" };
const textarea: CSSProperties = { width: "100%", minWidth: 0, border: "1px solid #d1d5db", borderRadius: 7, padding: 10, background: "#fff", resize: "vertical", lineHeight: 1.45 };
const composeBottom: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const select: CSSProperties = { height: 34, border: "1px solid #d1d5db", borderRadius: 7, padding: "0 9px", background: "#fff", fontWeight: 850 };
const checkLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 900, color: "#374151" };
const primaryButton: CSSProperties = { marginLeft: "auto", height: 34, border: 0, borderRadius: 7, background: "#111827", color: "#fff", padding: "0 12px", fontWeight: 950 };
const list: CSSProperties = { display: "grid", gap: 7 };
const pinnedGroup: CSSProperties = { display: "grid", gap: 7, border: "1px solid #fde68a", borderRadius: 8, padding: 8, background: "#fffbeb" };
const normalGroup: CSSProperties = { display: "grid", gap: 7 };
const groupHead: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
const groupLabel: CSSProperties = { color: "#92400e", fontSize: 12 };
const normalGroupLabel: CSSProperties = { color: "#374151", fontSize: 12 };
const groupCount: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 900 };
const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 9, background: "#fff", display: "grid", gap: 6 };
const pinnedCard: CSSProperties = { boxShadow: "inset 3px 0 0 #f59e0b" };
const cardHead: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" };
const cardTitleWrap: CSSProperties = { minWidth: 0 };
const badgeLine: CSSProperties = { display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 };
const badge: CSSProperties = { display: "inline-flex", alignItems: "center", height: 20, borderRadius: 999, padding: "0 7px", fontSize: 11, fontWeight: 950 };
const pinBadge: CSSProperties = { ...badge, background: "#fef3c7", color: "#92400e" };
const readBadge: CSSProperties = { ...badge, background: "#dcfce7", color: "#166534" };
const unreadBadge: CSSProperties = { ...badge, background: "#f1f5f9", color: "#475569" };
const cardTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const content: CSSProperties = { margin: "4px 0 0", lineHeight: 1.38, color: "#374151", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "normal" };
const cardFoot: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", color: "#6b7280", fontSize: 12, fontWeight: 850 };
const confirmButton: CSSProperties = { height: 30, border: "1px solid #bbf7d0", borderRadius: 7, background: "#dcfce7", color: "#166534", padding: "0 10px", fontWeight: 950, whiteSpace: "nowrap" };
const details: CSSProperties = { borderTop: "1px solid #f1f5f9", paddingTop: 8 };
const summaryButton: CSSProperties = { cursor: "pointer", color: "var(--asc-primary-deep)", fontWeight: 950, fontSize: 12 };
const editGrid: CSSProperties = { display: "grid", gap: 8, alignItems: "start", marginTop: 8 };
const editForm: CSSProperties = { display: "grid", gap: 7, minWidth: 0 };
const smallButton: CSSProperties = { height: 32, border: "1px solid #111827", borderRadius: 7, background: "#111827", color: "#fff", padding: "0 11px", fontWeight: 950 };
const dangerButton: CSSProperties = { height: 32, border: "1px solid #fecaca", borderRadius: 7, background: "#fee2e2", color: "#991b1b", padding: "0 11px", fontWeight: 950 };
const empty: CSSProperties = { border: "1px dashed #d1d5db", borderRadius: 8, padding: 14, textAlign: "center", color: "#6b7280", fontWeight: 900, display: "grid", gap: 4, background: "#f8fafc" };

