"use client";
import { ChangeEvent, useEffect, useState } from "react";
import { deleteSavedReport, saveReportRecord, syncSavedReports, type SavedReport } from "../lib/report-storage";
type ReportType = "one-page" | "issue-response";
type Period = "7d" | "30d" | "1y" | "all";
type Source = "public" | "research" | "news" | "company" | "global";
type ProviderResponse = { ok: boolean; text?: string; citations?: { url: string; title: string }[]; error?: string };
type TemplateResult = { filename: string; fileType?: string; markdown: string; outline?: { level: number; text: string }[]; warnings?: { code: string; message: string }[] };
type ReportDraft = { title: string; meta: string; sections: [string, string][] };
const sources: { id: Source; label: string; icon: string }[] = [
  { id: "public", label: "정부·공공기관", icon: "⌂" }, { id: "research", label: "연구·학술", icon: "◇" }, { id: "news", label: "뉴스", icon: "▤" }, { id: "company", label: "기업", icon: "▥" }, { id: "global", label: "국제기구", icon: "◎" },
];
const periodLabels: Record<Period, string> = { "7d": "최근 7일", "30d": "최근 30일", "1y": "최근 1년", all: "전체 기간" };
const reportTypeLabels: Record<ReportType, string> = { "one-page": "보고용 1장 페이퍼", "issue-response": "현황-문제점-대응방향" };
function createExampleReport(topic: string, reportType: ReportType, period: Period, selectedSources: Source[]): ReportDraft {
  const subject = topic.trim() || "최근 생성형 AI 산업 동향";
  const onePage = reportType === "one-page";
  return {
    title: subject + " 관련 이슈 대응 및 성과 보고서 초안",
    meta: reportTypeLabels[reportType] + " · " + periodLabels[period] + " · " + selectedSources.length + "개 소스",
    sections: onePage ? [
      ["핵심 요약", subject + "에 대한 관심과 정책적 대응 필요성이 높아지고 있습니다. 주요 공개자료를 종합한 결과, 선제적인 현황 파악과 실행과제 정리가 필요합니다."],
      ["주요 동향", "최근 관련 정책 발표와 연구·산업 현장의 변화가 이어지고 있으며, 현장 적용을 위한 기준과 지원체계 마련이 주요 과제로 확인됩니다."],
      ["제안 대응", "① 관련 동향 상시 모니터링 ② 유관기관 협업을 통한 데이터 축적 ③ 단기 실행과제와 중장기 성과지표를 연계한 후속 계획 수립"],
    ] as [string, string][] : [
      ["현황", subject + " 관련 국내외 논의가 확대되고 있습니다. " + periodLabels[period] + " 동안 확인된 자료를 기준으로 정책·시장·기술 변화가 동시에 진행 중인 것으로 보입니다."],
      ["문제점", "정보가 여러 출처에 분산되어 신속한 판단에 시간이 걸리고, 기관별 대응 현황과 성과를 동일한 기준으로 비교하기 어렵습니다."],
      ["대응방향", "핵심 이슈를 주 단위로 정리하고, 유관기관의 역할과 담당 과제를 명확히 합니다. 정량지표와 현장 피드백을 함께 수집해 다음 보고에 반영합니다."],
    ] as [string, string][],
  };
}
function ProviderCard({ label, result }: { label: string; result: ProviderResponse | null }) {
  if (!result) return null;
  return <article className={"provider-card " + (result.ok ? "provider-success" : "provider-failure")}>
    <div className="provider-card-heading"><h4>{label}</h4><span>{result.ok ? "성공" : "오류"}</span></div>
    {result.ok ? <><p className="provider-text">{result.text}</p>{result.citations?.length ? <div className="provider-sources"><strong>참고 출처</strong>{result.citations.map((citation, index) => <a href={citation.url} target="_blank" rel="noreferrer" key={citation.url}>[{index + 1}] {citation.title || citation.url}</a>)}</div> : <p className="no-sources">추출된 URL 출처가 없습니다.</p>}</> : <p className="provider-error">{result.error}</p>}
  </article>;
}

function SavedReportsView({ reports, onOpen, onDelete, storageMessage }: { reports: SavedReport[]; onOpen: (report: SavedReport) => void; onDelete: (id: string) => void; storageMessage: string }) {
  return <section className="saved-view" aria-label="저장한 보고서">
    <div className="saved-view-heading"><div><p className="section-kicker">REPORT LIBRARY</p><h2>저장한 보고서</h2><p>브라우저에 저장된 초안을 확인하고 다시 열 수 있습니다.</p></div><span className="saved-count">{reports.length} / 50</span></div>
    {storageMessage && <p className="storage-message">{storageMessage}</p>}
    {reports.length ? <div className="saved-list">{reports.map((item) => <article className="saved-card" key={item.id}><div className="saved-card-main"><span className="draft-badge">DRAFT</span><h3>{item.title}</h3><p>{item.meta}</p><time dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleString("ko-KR")}</time></div><div className="saved-card-actions"><button type="button" className="outline-button" onClick={() => onOpen(item)}>열어보기</button><button type="button" className="danger-button" onClick={() => onDelete(item.id)}>삭제</button></div></article>)}</div> : <div className="empty-saved"><span>♡</span><h3>저장한 보고서가 없습니다.</h3><p>생성 결과에서 저장 버튼을 누르면 이곳에서 다시 확인할 수 있습니다.</p></div>}
  </section>;
}

export default function Home() {
  const [openAiKey, setOpenAiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [sessionStatus, setSessionStatus] = useState<"idle" | "saved" | "cleared">("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openaiResult, setOpenaiResult] = useState<ProviderResponse | null>(null);
  const [geminiResult, setGeminiResult] = useState<ProviderResponse | null>(null);
  const [template, setTemplate] = useState<TemplateResult | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [templateInputKey, setTemplateInputKey] = useState(0);
  const [activeView, setActiveView] = useState<"studio" | "saved">("studio");
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [topic, setTopic] = useState(""); const [reportType, setReportType] = useState<ReportType>("one-page"); const [period, setPeriod] = useState<Period>("30d"); const [selectedSources, setSelectedSources] = useState<Source[]>(["public", "research", "news"]); const [report, setReport] = useState<ReportDraft>(() => createExampleReport("", "one-page", "30d", ["public", "research", "news"]));
  useEffect(() => {
    setOpenAiKey(sessionStorage.getItem("iitp-openai-key") || "");
    setGeminiKey(sessionStorage.getItem("iitp-gemini-key") || "");
    void syncSavedReports().then((result) => { setSavedReports(result.data); if (result.error) setStorageMessage("Supabase 연결을 확인할 수 없어 브라우저 저장을 사용 중입니다."); });
  }, []);
  const handleTemplateUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTemplateLoading(true); setTemplateError(""); setTemplate(null);
    const formData = new FormData(); formData.append("file", file);
    try {
      const response = await fetch("/api/template", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || !data.ok) { setTemplateError(data.error || "문서 분석에 실패했습니다."); return; }
      setTemplate({ filename: data.filename, fileType: data.fileType, markdown: data.markdown, outline: data.outline, warnings: data.warnings });
    } catch (uploadError) { setTemplateError(uploadError instanceof Error ? uploadError.message : "문서 업로드 중 오류가 발생했습니다."); } finally { setTemplateLoading(false); }
  };
  const onKeyChange = (setter: (value: string) => void, value: string) => { setter(value); setSessionStatus("idle"); setError(""); };
  const saveSession = () => { sessionStorage.setItem("iitp-openai-key", openAiKey); sessionStorage.setItem("iitp-gemini-key", geminiKey); setSessionStatus("saved"); setError(""); };
  const clearSession = () => { sessionStorage.removeItem("iitp-openai-key"); sessionStorage.removeItem("iitp-gemini-key"); setOpenAiKey(""); setGeminiKey(""); setSessionStatus("cleared"); setError(""); };
  const resetWorkspace = () => { setTopic(""); setReportType("one-page"); setPeriod("30d"); setSelectedSources(["public", "research", "news"]); setReport(createExampleReport("", "one-page", "30d", ["public", "research", "news"])); setOpenaiResult(null); setGeminiResult(null); setTemplate(null); setTemplateError(""); setTemplateInputKey((value) => value + 1); setSaveMessage(""); setError(""); };
  const saveCurrentReport = async () => { const result = await saveReportRecord({ title: report.title, meta: report.meta, sections: report.sections, openaiText: openaiResult?.text, geminiText: geminiResult?.text, templateFilename: template?.filename }); setSavedReports((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)].slice(0, 50)); setStorageMessage(result.remote ? "Supabase에 저장했습니다." : "Supabase 저장 실패로 브라우저에 임시 저장했습니다."); setSaveMessage("보고서를 저장했습니다."); };
  const openSavedReport = (saved: SavedReport) => { setReport({ title: saved.title, meta: saved.meta, sections: saved.sections }); setOpenaiResult(saved.openaiText ? { ok: true, text: saved.openaiText } : null); setGeminiResult(saved.geminiText ? { ok: true, text: saved.geminiText } : null); setActiveView("studio"); setSaveMessage(""); };
  const removeSavedReport = async (id: string) => { const result = await deleteSavedReport(id); setSavedReports((current) => current.filter((item) => item.id !== id)); if (!result.remote) setStorageMessage("Supabase 삭제 실패로 브라우저 목록만 갱신했습니다."); };
  const toggleSource = (source: Source) => setSelectedSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  const generateReport = async () => {
    if (!openAiKey.trim() && !geminiKey.trim()) { setError("OpenAI 또는 Gemini API 키를 먼저 입력하고 세션 저장을 눌러주세요."); return; }
    setError(""); setLoading(true); setOpenaiResult(null); setGeminiResult(null);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openaiKey: openAiKey, geminiKey, input: topic, period, selectedSources, templateMarkdown: template?.markdown || "", templateFilename: template?.filename || "" }) });
      const data = await response.json();
      setOpenaiResult(data.openai || { ok: false, error: "OpenAI 결과를 받지 못했습니다." }); setGeminiResult(data.gemini || { ok: false, error: "Gemini 결과를 받지 못했습니다." });
      if (!data.openai?.ok && !data.gemini?.ok) setError("두 검색 API가 모두 실패했습니다. 각 API별 오류 원인을 아래 결과 영역에서 확인하세요.");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "검색 요청 중 오류가 발생했습니다."); } finally { setLoading(false); }
  };
  return <main className="app-shell">
    <header className="topbar"><button type="button" className="brand-mark" onClick={() => setActiveView("studio")} aria-label="보고서 생성기로 이동">I</button><div><p className="eyebrow">IITP EVALUATION MANAGEMENT</p><h1>이슈 대응·성과 보고서</h1></div><nav className="topbar-nav" aria-label="주 메뉴"><button type="button" className={activeView === "studio" ? "top-nav-button active" : "top-nav-button"} onClick={() => setActiveView("studio")}>새 보고서</button><button type="button" className={activeView === "saved" ? "top-nav-button active" : "top-nav-button"} onClick={() => setActiveView("saved")}>저장한 보고서 <span>{savedReports.length}</span></button></nav><div className="topbar-status"><span className="status-dot" /> 초안 생성기</div></header>
    {activeView === "saved" ? <div className="workspace"><SavedReportsView reports={savedReports} onOpen={openSavedReport} onDelete={removeSavedReport} storageMessage={storageMessage} /></div> : <div className="workspace"><section className="intro-block"><div><p className="section-kicker">REPORT DRAFT STUDIO</p><h2>복잡한 이슈를<br /><span>한 장의 보고서로.</span></h2><p className="intro-copy">키워드나 뉴스 본문을 바탕으로, 빠르게 공유할 수 있는 보고서 초안을 만들어보세요.</p></div><div className="intro-note"><span>✦</span><p>예시 결과가 준비되어 있습니다.<br />입력 후 생성 버튼을 눌러 업데이트하세요.</p></div></section>
      <section className="api-panel" aria-label="API 키 세션 설정">
        <div className="api-heading"><div><span className="step-number">SETUP</span><h3>AI API 키 설정</h3></div><span className="session-hint">이 브라우저 탭에서만 사용</span></div>
        <div className="api-fields">
          <label className="api-field"><span>OpenAI API 키</span><input type="password" value={openAiKey} onChange={(event) => onKeyChange(setOpenAiKey, event.target.value)} placeholder="sk-..." autoComplete="off" /></label>
          <label className="api-field"><span>Gemini API 키</span><input type="password" value={geminiKey} onChange={(event) => onKeyChange(setGeminiKey, event.target.value)} placeholder="AIza..." autoComplete="off" /></label>
        </div>
        <div className="api-bottom"><p className="privacy-note">🔒 키는 서버나 보고서에 전송·표시되지 않으며, 탭을 닫으면 삭제됩니다.</p><div className="api-actions"><button type="button" className="text-button" onClick={resetWorkspace}>입력·결과 리셋</button><button type="button" className="outline-button" onClick={saveSession}>세션 저장</button><button type="button" className="danger-button" onClick={clearSession}>세션 비우기</button></div></div>
        {sessionStatus === "saved" && <p className="session-message success">✓ 현재 탭의 세션에 API 키를 저장했습니다.</p>}
        {sessionStatus === "cleared" && <p className="session-message">세션의 API 키를 비웠습니다.</p>}
        {error && <p className="session-message error" role="alert">! {error}</p>}
      </section>
      <section className="template-panel" aria-label="문서 양식 업로드">
        <div className="template-heading"><div><span className="step-number">TEMPLATE</span><h3>보고서 양식 분석</h3></div><span className="template-types">HWP · HWPX · DOCX · PDF · XLSX · XLS</span></div>
        <div className="template-upload-row">
          <label className="upload-dropzone" htmlFor={"template-file-" + templateInputKey}><span className="upload-icon">↑</span><span><strong>{templateLoading ? "문서 분석 중..." : "문서 양식 업로드"}</strong><small>한글·Word·PDF·Excel 파일을 선택하세요. 최대 25MB</small></span><input key={templateInputKey} id={"template-file-" + templateInputKey} type="file" accept=".hwp,.hwpx,.docx,.pdf,.xlsx,.xls" onChange={handleTemplateUpload} disabled={templateLoading} /></label>
          {template && <div className="template-status success"><span>✓</span><div><strong>{template.filename}</strong><small>분석 완료 · {template.fileType?.toUpperCase()}</small></div></div>}
          {templateError && <div className="template-status failure"><span>!</span><div><strong>분석 실패</strong><small>{templateError}</small></div></div>}
        </div>
        {template && <div className="template-preview"><div><strong>분석된 구조</strong><span>{template.outline?.length || 0}개 항목 · 보고서 생성에 자동 반영</span></div><pre>{template.markdown.slice(0, 900)}{template.markdown.length > 900 ? "\n…" : ""}</pre>{template.warnings?.length ? <p className="template-warning">주의: {template.warnings.map((warning) => warning.message).join(" · ")}</p> : null}</div>}
      </section>
      <div className="content-grid"><section className="panel form-panel" aria-label="보고서 생성 조건">
        <div className="panel-heading"><div><span className="step-number">01</span><h3>분석할 내용</h3></div><span className="required-label">필수 입력</span></div>
        <label className="field-label" htmlFor="topic">키워드 또는 뉴스 기사 본문</label><textarea id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="예: 생성형 AI 규제 동향, 또는 뉴스 기사 본문을 입력하세요." /><div className="char-count">{topic.length} / 2,000자</div>
        <div className="form-section"><div className="panel-heading compact"><div><span className="step-number">02</span><h3>보고서 유형</h3></div></div><div className="segmented-control" role="radiogroup" aria-label="보고서 유형">{(Object.keys(reportTypeLabels) as ReportType[]).map((type) => <button type="button" key={type} className={reportType === type ? "segment active" : "segment"} onClick={() => setReportType(type)} aria-pressed={reportType === type}>{reportTypeLabels[type]}</button>)}</div></div>
        <div className="form-section"><div className="panel-heading compact"><div><span className="step-number">03</span><h3>검색 기간</h3></div></div><div className="period-grid" role="radiogroup" aria-label="검색 기간">{(Object.keys(periodLabels) as Period[]).map((item) => <button type="button" key={item} className={period === item ? "period-button active" : "period-button"} onClick={() => setPeriod(item)} aria-pressed={period === item}>{periodLabels[item]}</button>)}</div></div>
        <div className="form-section"><div className="panel-heading compact"><div><span className="step-number">04</span><h3>검색 소스</h3></div><span className="selected-count">{selectedSources.length}개 선택</span></div><div className="source-list">{sources.map((source) => <label className="source-option" key={source.id}><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={() => toggleSource(source.id)} /><span className="checkmark">✓</span><span className="source-icon">{source.icon}</span><span>{source.label}</span></label>)}</div></div>
        <button type="button" className="generate-button" onClick={generateReport} disabled={loading}><span>{loading ? "◌" : "✦"}</span> {loading ? "검색 중..." : "보고서 초안 생성"} <b>→</b></button><p className="form-footnote">현재는 OpenAI·Gemini 웹 검색 결과를 각각 표시합니다.</p>
      </section><section className="panel result-panel" aria-label="보고서 생성 결과"><div className="result-topline"><div><span className="step-number">RESULT</span><h3>생성 결과</h3></div><button type="button" className="icon-button" aria-label="결과 더보기">···</button></div><div className="result-paper"><div className="paper-header"><span className="draft-badge">DRAFT</span><span>2026. 08. 21</span></div><h4>{report.title}</h4><p className="report-meta">{report.meta}</p><div className="report-divider" />{report.sections.map(([heading, body]) => <div className="report-section" key={heading}><h5>{heading}</h5><p>{body}</p></div>)}<div className="paper-footer"><span>이슈 대응·성과 보고서 초안</span><span>1 / 1</span></div></div>{loading && <div className="loading-message">두 검색 API에서 자료를 수집하고 있습니다. 최대 120초가 걸릴 수 있습니다.</div>}<div className="provider-results"><ProviderCard label="OpenAI Web Search" result={openaiResult} /><ProviderCard label="Gemini Google Search" result={geminiResult} /></div><div className="result-actions"><button type="button" className="secondary-button" onClick={saveCurrentReport}>♡ 저장</button><button type="button" className="secondary-button">↓ 다운로드</button></div>{saveMessage && <p className="save-message" role="status">✓ {saveMessage}</p>}</section></div>
    </div>}</main>;
}
