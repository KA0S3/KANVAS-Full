alter table public.entitlements
  add column if not exists product_key text,
  add column if not exists stable_upgrade_eligible boolean not null default false;

create unique index if not exists entitlements_paystack_reference_unique
  on public.entitlements(paystack_reference)
  where paystack_reference is not null;
