import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
const TIMEOUT_MS = 120_000;
const MAX_SOURCES = 20;
type SearchPeriod = "7d" | "30d" | "1y" | "all";
type SearchSource = "public" | "research" | "news" | "company" | "global";
type Citation = { url: string; title: string };
type ProviderResult = { ok: boolean; text?: string; citations?: Citation[]; error?: string };
const periodLabels: Record<SearchPeriod, string> = { "7d": "최근 7일", "30d": "최근 30일", "1y": "최근 1년", all: "전체 기간" };
const sourceLabels: Record<SearchSource, string> = { public: "정부·공공기관", research: "연구·학술", news: "뉴스", company: "기업", global: "국제기구" };
const sourceDomains: Record<SearchSource, string[]> = {
  public: ["go.kr", "gov", "korea.kr", "who.int"], research: ["nature.com", "sciencedirect.com", "arxiv.org", "scholar.google.com"], news: ["reuters.com", "apnews.com", "yonhapnews.co.kr", "bbc.com"], company: ["samsung.com", "google.com", "microsoft.com", "openai.com"], global: ["un.org", "oecd.org", "worldbank.org", "imf.org"],
};
function cleanUrl(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try { const url = new URL(value); ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key)); url.hash = ""; url.pathname = url.pathname.replace(/\/+$/, "") || "/"; return url.toString(); } catch { return null; }
}
function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((item) => { const url = cleanUrl(item.url); if (!url) return false; const key = url.toLowerCase().replace(/\/+$/, ""); if (seen.has(key)) return false; seen.add(key); item.url = url; return true; }).slice(0, MAX_SOURCES);
}
function remapCitationIndexes(raw: Citation[], citations: Citation[], placements: { endIndex?: number; citationIndexes: number[] }[]) {
  const indexByUrl = new Map(citations.map((citation, index) => [citation.url.toLowerCase().replace(/\/+$/, ""), index]));
  return placements.map((placement) => ({ endIndex: placement.endIndex, citationIndexes: placement.citationIndexes.map((index) => indexByUrl.get((raw[index]?.url || "").toLowerCase().replace(/\/+$/, ""))).filter((index): index is number => typeof index === "number") }));
}
function addInlineCitations(text: string, citations: Citation[], placements: { endIndex?: number; citationIndexes: number[] }[]) {
  let result = text;
  [...placements].filter((item) => typeof item.endIndex === "number" && item.citationIndexes.length).sort((a, b) => (b.endIndex || 0) - (a.endIndex || 0)).forEach((placement) => {
    const refs = placement.citationIndexes.map((index) => citations[index] ? "[" + (index + 1) + "]" : "").filter(Boolean).join(" ");
    if (refs) result = result.slice(0, placement.endIndex) + " " + refs + result.slice(placement.endIndex);
  });
  return result;
}
function buildPrompt(input: string, period: SearchPeriod, selectedSources: SearchSource[], templateMarkdown: string, templateFilename: string) {
  const periodText = periodLabels[period];
  const sourceText = selectedSources.length ? selectedSources.map((source) => sourceLabels[source]).join(", ") : "선택된 소스 없음";
  const templateInstruction = templateMarkdown ? "\n\n업로드된 문서 양식(" + templateFilename + ") 분석 결과:\n---\n" + templateMarkdown.slice(0, 80_000) + "\n---\n양식 적용 지침: 업로드 양식의 제목, 항목명, 제목·항목·문단 순서를 최대한 유지해. 표와 개조식 구조가 있으면 같은 순서와 계층으로 재현하고, 양식에 있는 항목을 빠뜨리지 마. 위의 기본 보고서 항목은 양식의 대응 항목 안에 자연스럽게 배치해. 양식의 빈칸·입력 위치는 실제 검색 결과로 채워." : "";
  return "다음 이슈를 " + periodText + " 기준으로 웹 검색하여 한국어 보고서 초안을 작성해줘.\n\n검색 기간: " + periodText + "\n우선 검색할 소스 유형: " + sourceText + "\n검색 지침: 선택한 소스 유형을 우선하되, 사실 확인에 필요한 경우 관련 신뢰 출처를 보완해. 각 사실 주장에는 제공된 검색 출처가 연결되도록 작성해.\n\n반드시 다음 형식을 지켜:\n제목\n핵심 요약\n현황\n문제점\n대응방향\n효과성\n시사점\n참고 출처\n\n참고 출처 섹션에는 출처 URL을 다시 나열하지 말고, 본문에 근거를 자연스럽게 반영해." + templateInstruction + "\n\n분석 대상:\n" + (input.trim() || "최근 생성형 AI 산업 동향");
}
async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : "HTTP " + response.status);
  return json;
}
async function callOpenAI(apiKey: string, prompt: string, selectedSources: SearchSource[]): Promise<ProviderResult> {
  try {
    const allowedDomains = [...new Set(selectedSources.flatMap((source) => sourceDomains[source]))];
    const data = await fetchJson("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey }, body: JSON.stringify({ model: "gpt-5.6-luna", input: prompt, tools: [{ type: "web_search", filters: { allowed_domains: allowedDomains } }] }) });
    const text = typeof data.output_text === "string" ? data.output_text : "";
    const raw: Citation[] = []; const placements: { endIndex?: number; citationIndexes: number[] }[] = [];
    for (const item of data.output || []) for (const content of item.content || []) for (const annotation of content.annotations || []) if (annotation.type === "url_citation") {
      const url = cleanUrl(annotation.url); if (!url) continue; let citationIndex = raw.findIndex((citation) => citation.url.toLowerCase() === url.toLowerCase()); if (citationIndex < 0) { raw.push({ url, title: annotation.title || new URL(url).hostname }); citationIndex = raw.length - 1; } placements.push({ endIndex: annotation.end_index, citationIndexes: [citationIndex] });
    }
    const citations = dedupeCitations(raw);
    return { ok: true, text: addInlineCitations(text || "검색 결과가 비어 있습니다.", citations, remapCitationIndexes(raw, citations, placements)), citations };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "OpenAI 요청 중 알 수 없는 오류가 발생했습니다." }; }
}
async function callGemini(apiKey: string, prompt: string): Promise<ProviderResult> {
  try {
    const data = await fetchJson("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }) });
    const candidate = data.candidates?.[0]; const text = (candidate?.content?.parts || []).map((part: { text?: string }) => part.text || "").join(""); const metadata = candidate?.groundingMetadata;
    const raw: Citation[] = (metadata?.groundingChunks || []).map((chunk: { web?: { uri?: string; title?: string } }) => chunk.web).filter(Boolean).map((web: { uri?: string; title?: string }) => ({ url: web.uri || "", title: web.title || "" }));
    const citations = dedupeCitations(raw); const placements = (metadata?.groundingSupports || []).map((support: { segment?: { endIndex?: number }; groundingChunkIndices?: number[] }) => ({ endIndex: support.segment?.endIndex, citationIndexes: support.groundingChunkIndices || [] }));
    return { ok: true, text: addInlineCitations(text || "검색 결과가 비어 있습니다.", citations, remapCitationIndexes(raw, citations, placements)), citations };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Gemini 요청 중 알 수 없는 오류가 발생했습니다." }; }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const openaiKey = typeof body.openaiKey === "string" ? body.openaiKey.trim() : ""; const geminiKey = typeof body.geminiKey === "string" ? body.geminiKey.trim() : ""; const input = typeof body.input === "string" ? body.input : ""; const period = (body.period || "30d") as SearchPeriod; const templateMarkdown = typeof body.templateMarkdown === "string" ? body.templateMarkdown : ""; const templateFilename = typeof body.templateFilename === "string" ? body.templateFilename : "업로드 양식"; const selectedSources: SearchSource[] = Array.isArray(body.selectedSources) ? body.selectedSources.filter((source: unknown): source is SearchSource => typeof source === "string" && source in sourceLabels) : [];
    if (!openaiKey && !geminiKey) return NextResponse.json({ openai: { ok: false, error: "OpenAI API 키가 없습니다." }, gemini: { ok: false, error: "Gemini API 키가 없습니다." } }, { status: 400 });
    const prompt = buildPrompt(input, periodLabels[period] ? period : "30d", selectedSources, templateMarkdown, templateFilename);
    const [openai, gemini] = await Promise.allSettled([openaiKey ? callOpenAI(openaiKey, prompt, selectedSources) : Promise.resolve({ ok: false, error: "OpenAI API 키가 없습니다." } as ProviderResult), geminiKey ? callGemini(geminiKey, prompt) : Promise.resolve({ ok: false, error: "Gemini API 키가 없습니다." } as ProviderResult)]);
    const result = (item: PromiseSettledResult<ProviderResult>): ProviderResult => item.status === "fulfilled" ? item.value : { ok: false, error: "요청 처리 중 예외가 발생했습니다." };
    return NextResponse.json({ openai: result(openai), gemini: result(gemini) });
  } catch (error) { return NextResponse.json({ openai: { ok: false, error: "요청 본문을 처리하지 못했습니다." }, gemini: { ok: false, error: error instanceof Error ? error.message : "알 수 없는 서버 오류가 발생했습니다." } }, { status: 400 }); }
}
