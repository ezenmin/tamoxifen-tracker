-- Enable pgcrypto extension for hashing
create extension if not exists pgcrypto;

-- =============================================================================
-- TABLES
-- =============================================================================

-- households: Each authenticated user owns one household
create table public.households (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint households_owner_unique unique (owner_user_id)
);

-- entries: Side effect entries belonging to a household
create table public.entries (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    occurred_at date not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- share_links: Doctor share links (token stored as hash only)
create table public.share_links (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    token_hash text not null unique,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    revoked boolean not null default false,
    last_accessed_at timestamptz null
);

-- =============================================================================
-- INDEXES
-- =============================================================================

create index entries_household_occurred_idx on public.entries(household_id, occurred_at desc);
create index share_links_household_expires_idx on public.share_links(household_id, expires_at desc);

-- =============================================================================
-- TRIGGER: Auto-update entries.updated_at
-- =============================================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger entries_updated_at
    before update on public.entries
    for each row
    execute function public.handle_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
alter table public.households enable row level security;
alter table public.entries enable row level security;
alter table public.share_links enable row level security;

-- households policies: owner can CRUD their own
create policy "households_select_own"
    on public.households for select
    using (owner_user_id = auth.uid());

create policy "households_insert_own"
    on public.households for insert
    with check (owner_user_id = auth.uid());

create policy "households_update_own"
    on public.households for update
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

create policy "households_delete_own"
    on public.households for delete
    using (owner_user_id = auth.uid());

-- entries policies: user can CRUD entries in their household
create policy "entries_select_own"
    on public.entries for select
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

create policy "entries_insert_own"
    on public.entries for insert
    with check (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

create policy "entries_update_own"
    on public.entries for update
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

create policy "entries_delete_own"
    on public.entries for delete
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

-- share_links policies: user can CRUD share_links in their household
create policy "share_links_select_own"
    on public.share_links for select
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

create policy "share_links_insert_own"
    on public.share_links for insert
    with check (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

create policy "share_links_update_own"
    on public.share_links for update
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );

create policy "share_links_delete_own"
    on public.share_links for delete
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
    );
