import { NextRequest, NextResponse } from "next/server";
import { parse } from "kordoc";

export const runtime = "nodejs";
export const maxDuration = 120;

const allowedExtensions = new Set(["hwp", "hwpx", "docx", "pdf", "xlsx", "xls"]);
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function getExtension(filename: string) {
  return filename.toLowerCase().split(".").pop() || "";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "업로드할 파일을 선택해주세요." }, { status: 400 });
    const extension = getExtension(file.name);
    if (!allowedExtensions.has(extension)) return NextResponse.json({ ok: false, error: "지원하지 않는 파일 형식입니다. HWP, HWPX, DOCX, PDF, XLSX, XLS 파일만 업로드할 수 있습니다." }, { status: 415 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "파일이 너무 큽니다. 25MB 이하의 파일을 업로드해주세요." }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parse(buffer, { keepTrailingEmptyCols: true, keepEmptyParagraphs: true });
    if (!parsed.success) return NextResponse.json({ ok: false, filename: file.name, fileType: parsed.fileType, error: parsed.error || "문서 분석에 실패했습니다.", code: parsed.code || "PARSE_ERROR" }, { status: 422 });
    const markdown = parsed.markdown.trim();
    if (!markdown) return NextResponse.json({ ok: false, filename: file.name, fileType: parsed.fileType, error: "문서에서 분석할 텍스트나 표 구조를 찾지 못했습니다.", code: "EMPTY_INPUT" }, { status: 422 });
    return NextResponse.json({
      ok: true,
      filename: file.name,
      fileType: parsed.fileType,
      markdown,
      outline: parsed.outline || [],
      metadata: parsed.metadata || {},
      warnings: parsed.warnings || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 분석 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: "문서 분석에 실패했습니다: " + message, code: "PARSE_ERROR" }, { status: 422 });
  }
}
