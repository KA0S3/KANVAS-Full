create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('active','past_due','cancelled','revoked','refunded','trial')),
  plan text not null check (plan in ('beta','stable','lifetime','subscription','admin_grant')),
  allowed_devices int not null default 2 check (allowed_devices > 0),
  allowed_channels text[] not null default array['stable']::text[],
  source text not null default 'manual' check (source in ('manual','paystack','access_key','admin')),
  paystack_customer_code text,
  paystack_reference text,
  paystack_subscription_code text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.device_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  device_id text not null,
  device_name text,
  platform text,
  app_version text,
  channel text not null default 'stable',
  active boolean not null default true,
  first_activated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text
);

create table public.activation_requests (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  state text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  platform text,
  app_version text,
  channel text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.license_heartbeats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  device_activation_id uuid references public.device_activations(id) on delete set null,
  device_id text not null,
  status text not null,
  app_version text,
  channel text,
  checked_at timestamptz not null default now(),
  reason text
);

create table public.access_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  plan text not null default 'stable',
  allowed_devices int not null default 2 check (allowed_devices > 0),
  allowed_channels text[] not null default array['stable']::text[],
  max_redemptions int not null default 1 check (max_redemptions > 0),
  redemption_count int not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.access_key_redemptions (
  id uuid primary key default gen_random_uuid(),
  access_key_id uuid not null references public.access_keys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(access_key_id, user_id)
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','support','admin')),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  event_type text not null,
  reference text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, reference, event_type)
);

create index entitlements_user_id_idx on public.entitlements(user_id);
create index entitlements_active_user_idx on public.entitlements(user_id, status, expires_at);
create index device_activations_user_id_idx on public.device_activations(user_id);
create index device_activations_entitlement_id_idx on public.device_activations(entitlement_id);
create unique index device_activations_active_device_unique
  on public.device_activations(entitlement_id, device_id)
  where active = true;
create index activation_requests_user_id_idx on public.activation_requests(user_id);
create index license_heartbeats_user_id_idx on public.license_heartbeats(user_id);
create index access_key_redemptions_user_id_idx on public.access_key_redemptions(user_id);
create index audit_log_actor_user_id_idx on public.audit_log(actor_user_id);
create index payment_events_reference_idx on public.payment_events(reference);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = check_user_id
  );
$$;

create or replace function public.current_user_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.admin_users where user_id = auth.uid();
$$;

create or replace function public.has_active_entitlement(check_user_id uuid, requested_channel text default 'stable')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.entitlements
    where user_id = check_user_id
      and status in ('active', 'trial')
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
      and requested_channel = any(allowed_channels)
  );
$$;

alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.device_activations enable row level security;
alter table public.activation_requests enable row level security;
alter table public.license_heartbeats enable row level security;
alter table public.access_keys enable row level security;
alter table public.access_key_redemptions enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_log enable row level security;
alter table public.payment_events enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "entitlements_select_own"
  on public.entitlements for select
  to authenticated
  using (user_id = auth.uid());

create policy "device_activations_select_own"
  on public.device_activations for select
  to authenticated
  using (user_id = auth.uid());

create policy "access_key_redemptions_select_own"
  on public.access_key_redemptions for select
  to authenticated
  using (user_id = auth.uid());
