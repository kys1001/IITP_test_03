create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  title text not null,
  meta text not null default '',
  sections jsonb not null default '[]'::jsonb,
  openai_text text,
  gemini_text text,
  template_filename text,
  created_at timestamptz not null default now()
);

create index if not exists saved_reports_device_id_created_at_idx
  on public.saved_reports (device_id, created_at desc);

alter table public.saved_reports enable row level security;

drop policy if exists "saved_reports_public_select" on public.saved_reports;
create policy "saved_reports_public_select"
  on public.saved_reports for select
  to anon, authenticated
  using (true);

drop policy if exists "saved_reports_public_insert" on public.saved_reports;
create policy "saved_reports_public_insert"
  on public.saved_reports for insert
  to anon, authenticated
  with check (true);

drop policy if exists "saved_reports_public_delete" on public.saved_reports;
create policy "saved_reports_public_delete"
  on public.saved_reports for delete
  to anon, authenticated
  using (true);
