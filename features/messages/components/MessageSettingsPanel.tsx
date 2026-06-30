import type { CSSProperties } from "react";
import { loadSsodaaSendPhonesAction, saveSsodaaSettingsAction, sendSsodaaTestMessageAction, testSsodaaConnectionAction } from "@/features/messages/actions/messageActions";
import type { SmsProviderStatus } from "@/lib/sms/types";

type Props = { settings: SmsProviderStatus; canManage: boolean; settingsStatus?: string };

export default function MessageSettingsPanel({ settings, canManage, settingsStatus }: Props) {
  return (
    <section style={wrap}>
      <div>
        <h2 style={title}>문자 발송 설정</h2>
        <p style={desc}>쏘다 API Key와 Token Key는 서버에서만 사용하고 화면에는 마스킹된 값만 표시합니다.</p>
      </div>

      {settingsStatus && <div style={statusNotice(settingsStatus)}>{settingsStatusMessage(settingsStatus)}</div>}

      <div style={grid}>
        <StatusCard label="Provider" value={settings.provider} />
        <StatusCard label="발신번호" value={settings.hasSenderNumber ? settings.senderNumber ?? "설정됨" : "미설정"} tone={settings.hasSenderNumber ? "success" : "warn"} />
        <StatusCard label="API Key" value={settings.hasApiKey ? settings.maskedApiKey ?? "설정됨" : "미설정"} tone={settings.hasApiKey ? "success" : "warn"} />
        <StatusCard label="Token Key" value={settings.hasApiSecret ? settings.maskedTokenKey ?? "설정됨" : "미설정"} tone={settings.hasApiSecret ? "success" : "warn"} />
        <StatusCard label="연결 상태" value={connectionLabel(settings.connectionStatus)} tone={settings.connectionStatus === "CONNECTED" ? "success" : settings.connectionStatus === "FAILED" ? "danger" : "warn"} />
        <StatusCard label="실제 발송" value={settings.canSendActual && !settings.dryRun ? "가능" : "차단"} tone={settings.canSendActual && !settings.dryRun ? "success" : "danger"} />
      </div>

      {settings.reason && <div style={notice}>{settings.reason}</div>}
      {settings.connectionMessage && <div style={infoBox}>{settings.connectionMessage}</div>}

      <section style={panel}>
        <h3 style={sectionTitle}>쏘다 API 설정</h3>
        {!canManage && <div style={notice}>ADMIN 또는 MANAGER만 문자 발송 설정을 변경할 수 있습니다.</div>}
        <form action={saveSsodaaSettingsAction} style={formGrid}>
          <label style={field}><span>API Key</span><input name="apiKey" type="password" placeholder={settings.maskedApiKey || "쏘다 API Key"} disabled={!canManage} style={input} autoComplete="off" /></label>
          <label style={field}><span>Token Key</span><input name="tokenKey" type="password" placeholder={settings.maskedTokenKey || "쏘다 Token Key"} disabled={!canManage} style={input} autoComplete="off" /></label>
          <label style={field}><span>기본 발신번호</span><input name="defaultSendPhone" defaultValue={settings.senderNumber ?? ""} disabled={!canManage} style={input} inputMode="numeric" /></label>
          <label style={field}><span>무료 수신거부 번호</span><input name="unsubPhone" defaultValue={settings.unsubPhone ?? ""} disabled={!canManage} style={input} inputMode="numeric" /></label>
          <label style={field}><span>발송자명/학원명</span><input name="senderName" defaultValue={settings.senderName ?? ""} disabled={!canManage} style={input} /></label>
          <label style={field}><span>테스트 수신번호</span><input name="testReceiverPhone" defaultValue={settings.testReceiverPhone ?? ""} disabled={!canManage} style={input} inputMode="numeric" /></label>
          <label style={checkLine}><input name="isMarketingDefault" type="checkbox" defaultChecked={settings.isMarketingDefault} disabled={!canManage} /> 광고 문자 기본 사용</label>
          <div style={actions}><button type="submit" style={primaryButton} disabled={!canManage}>저장</button></div>
        </form>
      </section>

      <section style={panel}>
        <h3 style={sectionTitle}>연결 확인</h3>
        <div style={actions}>
          <form action={testSsodaaConnectionAction}><button type="submit" style={secondaryButton} disabled={!canManage}>연결 테스트 / 잔여 포인트 조회</button></form>
          <form action={loadSsodaaSendPhonesAction}><button type="submit" style={secondaryButton} disabled={!canManage}>발신번호 목록 불러오기</button></form>
          <form action={sendSsodaaTestMessageAction} style={testForm}><input name="testReceiverPhone" placeholder="테스트 수신번호" defaultValue={settings.testReceiverPhone ?? ""} style={input} /><button type="submit" style={primaryButton} disabled={!canManage}>테스트 문자 발송</button></form>
        </div>
      </section>

      <section style={panel}>
        <h3 style={sectionTitle}>안내</h3>
        <ul style={helpList}>
          <li>쏘다 API Key와 Token Key는 쏘다 관리자 페이지에서 직접 발급해야 합니다.</li>
          <li>쏘다 API 토큰에 현재 서버 IP가 등록되어 있어야 발송이 가능합니다.</li>
          <li>발신번호는 쏘다에 등록된 번호만 사용할 수 있습니다.</li>
          <li>광고 문자는 수신동의 및 무료 수신거부 안내가 필요합니다.</li>
          <li>DB 저장은 <code>APP_ENCRYPTION_KEY</code>가 설정된 경우에만 허용됩니다. 없으면 <code>.env</code>의 <code>SSODAA_*</code> 값을 사용하세요.</li>
        </ul>
      </section>
    </section>
  );
}

function StatusCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warn" | "danger" | "info" }) {
  return <div style={{ ...card, ...toneStyle(tone) }}><span>{label}</span><b>{value}</b></div>;
}
function connectionLabel(value: SmsProviderStatus["connectionStatus"]) { if (value === "CONNECTED") return "연결됨"; if (value === "FAILED") return "실패"; return "확인 필요"; }
function settingsStatusMessage(value: string) {
  if (value === "saved") return "문자 발송 설정을 저장했습니다. 연결 테스트를 실행해주세요.";
  if (value === "connected") return "쏘다 API 연결을 확인했습니다.";
  if (value === "phones") return "등록 발신번호 목록을 확인했습니다.";
  if (value === "failed") return "쏘다 API 연결에 실패했습니다. API Key, Token Key, 서버 IP, 발신번호를 확인해주세요.";
  if (value === "test-sent") return "테스트 문자를 발송했습니다.";
  if (value === "test-failed") return "테스트 문자 발송에 실패했습니다.";
  if (value === "test-phone-required") return "테스트 수신번호를 입력해주세요.";
  if (value === "encryption-required") return "DB에 API Key를 저장하려면 APP_ENCRYPTION_KEY 환경변수가 필요합니다.";
  return "요청을 처리했습니다.";
}
function statusNotice(value: string): CSSProperties { return value.includes("failed") || value.includes("required") ? dangerNotice : successNotice; }
function toneStyle(tone: string): CSSProperties { if (tone === "success") return { borderColor: "#86efac", background: "var(--asc-success-soft)", color: "var(--asc-success)" }; if (tone === "warn") return { borderColor: "#ffd166", background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)" }; if (tone === "danger") return { borderColor: "#fecaca", background: "var(--asc-danger-soft)", color: "var(--asc-danger)" }; if (tone === "info") return { borderColor: "#93c5fd", background: "var(--asc-info-soft)", color: "var(--asc-info)" }; return {}; }

const wrap: CSSProperties = { display: "grid", gap: 10 };
const title: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 950 };
const desc: CSSProperties = { margin: "4px 0 0", color: "var(--asc-text-muted)", fontSize: 13 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6, minmax(130px, 1fr))", gap: 7 };
const card: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 3, color: "var(--asc-text-subtle)", fontWeight: 900 };
const notice: CSSProperties = { border: "1px solid #ffd166", borderRadius: 8, background: "var(--asc-warning-soft)", color: "var(--asc-warning-text)", padding: 10, fontWeight: 900 };
const successNotice: CSSProperties = { border: "1px solid #86efac", borderRadius: 8, background: "var(--asc-success-soft)", color: "var(--asc-success)", padding: 10, fontWeight: 900 };
const dangerNotice: CSSProperties = { border: "1px solid #fecaca", borderRadius: 8, background: "var(--asc-danger-soft)", color: "var(--asc-danger)", padding: 10, fontWeight: 900 };
const infoBox: CSSProperties = { border: "1px solid #93c5fd", borderRadius: 8, background: "var(--asc-info-soft)", color: "var(--asc-info)", padding: 10, fontWeight: 900 };
const panel: CSSProperties = { border: "1px solid var(--asc-border)", borderRadius: 8, background: "#fff", padding: 10, display: "grid", gap: 10 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 950 };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 9, alignItems: "end" };
const field: CSSProperties = { display: "grid", gap: 5, color: "var(--asc-text-subtle)", fontSize: 12, fontWeight: 900 };
const input: CSSProperties = { width: "100%", height: 36, border: "1px solid var(--asc-border)", borderRadius: 8, padding: "0 10px", background: "#fff", color: "var(--asc-text)" };
const checkLine: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 900, color: "var(--asc-text-subtle)", minHeight: 36 };
const actions: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const primaryButton: CSSProperties = { height: 36, border: "1px solid var(--asc-primary)", borderRadius: 8, background: "var(--asc-primary)", color: "#fff", padding: "0 14px", fontWeight: 950 };
const secondaryButton: CSSProperties = { ...primaryButton, background: "#fff", color: "var(--asc-primary)" };
const testForm: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };
const helpList: CSSProperties = { margin: 0, paddingLeft: 18, color: "var(--asc-text-subtle)", lineHeight: 1.65, fontWeight: 850 };
