-- =============================================================================
-- ADD ENTRY OWNERSHIP COLUMN
-- =============================================================================

-- Add created_by_user_id column to entries table
alter table public.entries
    add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

-- Create index for faster lookups
create index if not exists entries_created_by_user_id_idx on public.entries(created_by_user_id);

-- =============================================================================
-- BACKFILL EXISTING ENTRIES
-- Set created_by_user_id to the household owner for all existing entries
-- =============================================================================

update public.entries e
set created_by_user_id = h.owner_user_id
from public.households h
where e.household_id = h.id
and e.created_by_user_id is null;

-- =============================================================================
-- UPDATE RLS POLICIES FOR ENTRIES
-- - SELECT: unchanged (owner + members can read all household entries)
-- - INSERT: must set created_by_user_id = auth.uid()
-- - UPDATE/DELETE: only if created_by_user_id = auth.uid() OR is null (legacy)
-- =============================================================================

-- Drop existing entries policies (from partner_membership migration)
drop policy if exists "entries_select_household" on public.entries;
drop policy if exists "entries_insert_household" on public.entries;
drop policy if exists "entries_update_household" on public.entries;
drop policy if exists "entries_delete_household" on public.entries;

-- SELECT: owner + members can read all entries in household
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

-- INSERT: owner + members can insert, but created_by_user_id must be set to current user
create policy "entries_insert_household"
    on public.entries for insert
    with check (
        (
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
        and (created_by_user_id = auth.uid())
    );

-- UPDATE: only if you created the entry (or legacy entry with null created_by_user_id)
create policy "entries_update_own"
    on public.entries for update
    using (
        (
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
        and (created_by_user_id = auth.uid() or created_by_user_id is null)
    )
    with check (
        (
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
        and (created_by_user_id = auth.uid() or created_by_user_id is null)
    );

-- DELETE: only if you created the entry (or legacy entry with null created_by_user_id)
create policy "entries_delete_own"
    on public.entries for delete
    using (
        (
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
        and (created_by_user_id = auth.uid() or created_by_user_id is null)
    );
