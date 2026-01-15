-- Table to store email login codes (for PWA-friendly auth)
create table if not exists public.login_codes (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    code text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used boolean not null default false
);

-- Index for lookups
create index login_codes_email_code_idx on public.login_codes(email, code);

-- Auto-cleanup old codes (optional - can also do via cron)
-- For now, just index by expiry for efficient cleanup queries
create index login_codes_expires_idx on public.login_codes(expires_at);

-- RLS: Only service role can access this table (edge functions use service role)
alter table public.login_codes enable row level security;

-- No policies = no access via anon/authenticated, only service role
