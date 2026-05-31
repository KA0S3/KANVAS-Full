insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('desktop-installers', 'desktop-installers', false, 524288000, null),
  ('desktop-updates', 'desktop-updates', true, 524288000, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.download_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('stable', 'beta')),
  version text not null,
  storage_path text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists download_tokens_user_id_idx
  on public.download_tokens(user_id);

create index if not exists download_tokens_expires_at_idx
  on public.download_tokens(expires_at);

alter table public.download_tokens enable row level security;

drop policy if exists "download_tokens_no_direct_access" on public.download_tokens;
create policy "download_tokens_no_direct_access"
  on public.download_tokens
  as restrictive
  for all
  using (false)
  with check (false);
