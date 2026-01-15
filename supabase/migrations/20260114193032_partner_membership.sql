-- =============================================================================
-- Drop unused login_codes table (was for custom code-login, now using Supabase OTP)
-- =============================================================================
drop table if exists public.login_codes;

-- =============================================================================
-- HOUSEHOLD MEMBERS TABLE
-- =============================================================================
create table if not exists public.household_members (
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('patient', 'partner')),
    created_at timestamptz not null default now(),
    primary key (household_id, user_id)
);

-- =============================================================================
-- HOUSEHOLD INVITES TABLE (email-based, no links)
-- =============================================================================
create table if not exists public.household_invites (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    invited_email text not null,
    role text not null default 'partner' check (role in ('partner')),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    accepted_at timestamptz null,
    accepted_by_user_id uuid null references auth.users(id) on delete set null,
    revoked boolean not null default false
);

-- Indexes
create index if not exists household_invites_invited_email_idx on public.household_invites(invited_email);
create index if not exists household_invites_household_expires_idx on public.household_invites(household_id, expires_at desc);

-- =============================================================================
-- RLS FOR HOUSEHOLD_MEMBERS
-- =============================================================================
alter table public.household_members enable row level security;

-- Owner can manage members for their household
create policy "household_members_owner_all"
    on public.household_members for all
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

-- Users can see their own membership
create policy "household_members_self_select"
    on public.household_members for select
    using (user_id = auth.uid());

-- =============================================================================
-- RLS FOR HOUSEHOLD_INVITES
-- =============================================================================
alter table public.household_invites enable row level security;

-- Owner can manage invites for their household
create policy "household_invites_owner_all"
    on public.household_invites for all
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

-- =============================================================================
-- UPDATE ENTRIES RLS TO ALLOW MEMBERS
-- =============================================================================

-- Drop existing entries policies
drop policy if exists "entries_select_own" on public.entries;
drop policy if exists "entries_insert_own" on public.entries;
drop policy if exists "entries_update_own" on public.entries;
drop policy if exists "entries_delete_own" on public.entries;

-- Create new policies that allow both owner and members
create policy "entries_select_household"
    on public.entries for select
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
        or exists (
            select 1 from public.household_members m
            where m.household_id = entries.household_id
            and m.user_id = auth.uid()
        )
    );

create policy "entries_insert_household"
    on public.entries for insert
    with check (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
        or exists (
            select 1 from public.household_members m
            where m.household_id = entries.household_id
            and m.user_id = auth.uid()
        )
    );

create policy "entries_update_household"
    on public.entries for update
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
        or exists (
            select 1 from public.household_members m
            where m.household_id = entries.household_id
            and m.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
        or exists (
            select 1 from public.household_members m
            where m.household_id = entries.household_id
            and m.user_id = auth.uid()
        )
    );

create policy "entries_delete_household"
    on public.entries for delete
    using (
        exists (
            select 1 from public.households h
            where h.id = household_id
            and h.owner_user_id = auth.uid()
        )
        or exists (
            select 1 from public.household_members m
            where m.household_id = entries.household_id
            and m.user_id = auth.uid()
        )
    );
