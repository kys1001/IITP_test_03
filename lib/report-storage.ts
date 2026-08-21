import { supabase } from "./supabase";

export type SavedReport = {
  id: string;
  title: string;
  meta: string;
  savedAt: string;
  sections: [string, string][];
  openaiText?: string;
  geminiText?: string;
  templateFilename?: string;
};
export type StorageResult<T> = { data: T; remote: boolean; error?: string };
const STORAGE_KEY = "iitp-saved-reports";
const DEVICE_KEY = "iitp-report-device-id";

function getDeviceId() {
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(DEVICE_KEY, id); }
  return id;
}
export function readSavedReports(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeLocalReports(reports: SavedReport[]) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, 50))); }
function mapRow(row: { id: string; title: string; meta: string; sections: [string, string][]; openai_text?: string | null; gemini_text?: string | null; template_filename?: string | null; created_at: string }): SavedReport {
  return { id: row.id, title: row.title, meta: row.meta, sections: row.sections || [], openaiText: row.openai_text || undefined, geminiText: row.gemini_text || undefined, templateFilename: row.template_filename || undefined, savedAt: row.created_at };
}
export async function syncSavedReports(): Promise<StorageResult<SavedReport[]>> {
  if (!supabase) return { data: readSavedReports(), remote: false, error: "Supabase 환경변수가 없습니다." };
  const { data, error } = await supabase.from("saved_reports").select("id,title,meta,sections,openai_text,gemini_text,template_filename,created_at").eq("device_id", getDeviceId()).order("created_at", { ascending: false }).limit(50);
  if (error) return { data: readSavedReports(), remote: false, error: error.message };
  const reports = (data || []).map(mapRow); writeLocalReports(reports); return { data: reports, remote: true };
}
export async function saveReportRecord(report: Omit<SavedReport, "id" | "savedAt">): Promise<StorageResult<SavedReport>> {
  if (supabase) {
    const { data, error } = await supabase.from("saved_reports").insert({ device_id: getDeviceId(), title: report.title, meta: report.meta, sections: report.sections, openai_text: report.openaiText || null, gemini_text: report.geminiText || null, template_filename: report.templateFilename || null }).select("id,title,meta,sections,openai_text,gemini_text,template_filename,created_at").single();
    if (!error && data) { const saved = mapRow(data); writeLocalReports([saved, ...readSavedReports()]); return { data: saved, remote: true }; }
  }
  const next: SavedReport = { ...report, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
  writeLocalReports([next, ...readSavedReports()]);
  return { data: next, remote: false, error: "Supabase 저장에 실패해 이 브라우저에 임시 저장했습니다." };
}
export async function deleteSavedReport(id: string): Promise<StorageResult<null>> {
  if (supabase) {
    const { error } = await supabase.from("saved_reports").delete().eq("id", id).eq("device_id", getDeviceId());
    if (!error) { writeLocalReports(readSavedReports().filter((report) => report.id !== id)); return { data: null, remote: true }; }
  }
  writeLocalReports(readSavedReports().filter((report) => report.id !== id));
  return { data: null, remote: false, error: "Supabase 삭제에 실패해 로컬 목록만 갱신했습니다." };
}
