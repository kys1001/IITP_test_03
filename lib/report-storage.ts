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

const STORAGE_KEY = "iitp-saved-reports";

export function readSavedReports(): SavedReport[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveReportRecord(report: Omit<SavedReport, "id" | "savedAt">): SavedReport {
  const next: SavedReport = { ...report, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
  const reports = [next, ...readSavedReports()].slice(0, 50);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  return next;
}

export function deleteSavedReport(id: string) {
  const reports = readSavedReports().filter((report) => report.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}
