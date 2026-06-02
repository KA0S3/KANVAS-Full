create table if not exists public.desktop_update_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  device_activation_id uuid not null references public.device_activations(id) on delete cascade,
  channel text not null check (channel in ('stable', 'beta')),
  version text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists desktop_update_tokens_user_id_idx
  on public.desktop_update_tokens(user_id);

create index if not exists desktop_update_tokens_expires_at_idx
  on public.desktop_update_tokens(expires_at);

alter table public.desktop_update_tokens enable row level security;

drop policy if exists "desktop_update_tokens_no_direct_access" on public.desktop_update_tokens;
create policy "desktop_update_tokens_no_direct_access"
  on public.desktop_update_tokens
  as restrictive
  for all
  using (false)
  with check (false);
