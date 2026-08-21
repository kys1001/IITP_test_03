# IITP 이슈 대응·성과 보고서 초안 생성기

키워드·뉴스 본문과 문서 양식을 바탕으로 이슈 대응 및 성과 보고서 초안을 만드는 순정 Next.js App Router 프로젝트입니다.

## 실행

    npm install
    npm run dev

브라우저에서 http://localhost:3000 을 엽니다.

## 주요 기능

- OpenAI Web Search와 Gemini Google Search Grounding 병렬 검색
- HWP/HWPX/DOCX/PDF/XLSX/XLS 양식 업로드 및 kordoc 기반 Markdown 분석
- 분석된 양식의 제목·항목·문단 순서를 보고서 생성 프롬프트에 반영
- API 키는 서버 환경변수가 아니라 브라우저 sessionStorage에만 저장
- 저장한 보고서는 Supabase에 저장하고, 연결이 아직 준비되지 않은 경우 브라우저에 임시 저장

## 환경변수

현재 필수 서버 환경변수는 없습니다. OpenAI와 Gemini 키는 UI에서 입력하며 브라우저 세션 동안만 사용됩니다.

.env.example은 이 정책을 명시하기 위해 포함되어 있습니다. 실제 API 키를 .env, .env.local, 소스 코드 또는 커밋에 넣지 마세요.

## Supabase 설정

Supabase SQL Editor에서 supabase/schema.sql을 실행하면 saved_reports 테이블과 기본 RLS 정책이 생성됩니다. 이후 저장·목록·삭제 기능이 Supabase를 사용합니다. 테이블이 아직 없거나 연결에 실패하면 화면에 안내를 표시하고 브라우저 임시 저장으로 동작합니다.

## 검증

    npm run build
