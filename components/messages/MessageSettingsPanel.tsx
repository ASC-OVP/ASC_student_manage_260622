import type { CSSProperties } from "react";
import type { SmsProviderStatus } from "@/lib/sms/types";

type Props = {
  settings: SmsProviderStatus;
};

export default function MessageSettingsPanel({ settings }: Props) {
  return (
    <section style={wrap}>
      <div>
        <h2 style={title}>설정</h2>
        <p style={desc}>API key와 secret 값은 서버 env에서만 읽고 화면에는 노출하지 않습니다.</p>
      </div>

      <div style={grid}>
        <StatusCard label="SMS provider" value={settings.provider} />
        <StatusCard label="발신번호" value={settings.hasSenderNumber ? settings.senderNumber ?? "설정됨" : "미설정"} tone={settings.hasSenderNumber ? "success" : "warn"} />
        <StatusCard label="dry-run 모드" value={settings.dryRun ? "켜짐" : "꺼짐"} tone={settings.dryRun ? "info" : "success"} />
        <StatusCard label="API KEY" value={settings.hasApiKey ? "설정됨" : "미설정"} tone={settings.hasApiKey ? "success" : "warn"} />
        <StatusCard label="API SECRET" value={settings.hasApiSecret ? "설정됨" : "미설정"} tone={settings.hasApiSecret ? "success" : "warn"} />
        <StatusCard label="실제 발송" value={settings.canSendActual ? "가능" : "차단"} tone={settings.canSendActual ? "success" : "danger"} />
        <StatusCard label="광고성 문자" value="비활성화" tone="info" />
      </div>

      {!settings.canSendActual && settings.reason && <div style={notice}>{settings.reason}</div>}

      <section style={panel}>
        <h3 style={sectionTitle}>env 예시</h3>
        <pre style={codeBlock}>{`SMS_PROVIDER=solapi
SMS_API_KEY=
SMS_API_SECRET=
SMS_SENDER_NUMBER=
SMS_DRY_RUN=true`}</pre>
      </section>
    </section>
  );
}

function StatusCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warn" | "danger" | "info" }) {
  return (
    <div style={{ ...card, ...toneStyle(tone) }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function toneStyle(tone: string): CSSProperties {
  if (tone === "success") return { borderColor: "#86efac", background: "var(--asc-success-soft)", color: "var(--asc-success)" };
  if (tone === "warn") return { borderColor: "#ffd166", background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" };
  if (tone === "danger") return { borderColor: "#fecaca", background: "var(--asc-danger-soft)", color: "var(--asc-danger)" };
  if (tone === "info") return { borderColor: "#93c5fd", background: "var(--asc-info-soft)", color: "var(--asc-info)" };
  return {};
}

const wrap: CSSProperties = { display: "grid", gap: 10 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 7 };
const card: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 3, color: "var(--asc-text-subtle)", fontWeight: 900 };
const notice: CSSProperties = { border: "1px solid #ffd166", borderRadius: 8, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", padding: 10, fontWeight: 900 };
const panel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10 };
const sectionTitle: CSSProperties = { margin: "0 0 10px", fontSize: 16, fontWeight: 950 };
const codeBlock: CSSProperties = { margin: 0, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc", padding: 10, whiteSpace: "pre-wrap", color: "var(--asc-text-subtle)" };
