# Partner Visibility Feature - Claude Implementation Prompt

## Context
The tamoxifen-tracker app allows a patient to invite a partner to share their household. Currently the patient has no visibility into:
1. Which partner emails have been invited (pending invites)
2. Who has actually joined the household (active members)
3. Ability to revoke a pending invite

## Requirements

### 1. Patient Dashboard - Partner Management Section
In `public/index.html`, add a "Partner Management" card (visible only to patients) that shows:

**Pending Invites:**
- List all pending invites (unexpired, unaccepted, non-revoked)
- Show: invited email, when it expires
- "Revoke" button for each pending invite

**Active Partners:**
- List all household members with role='partner' 
- Show: email, joined date
- "Remove" button for each (already implemented, just needs to appear here)

### 2. Data Fetching Functions
In `public/tracker.js`, implement:

```javascript
/**
 * Fetch pending invites for the current household
 * Uses Supabase client to query household_invites table
 * @returns {Promise<Array>} Array of pending invite objects
 */
async function getPendingInvites() {
    // Query household_invites where:
    // - household_id = currentHouseholdId
    // - accepted_at is null
    // - revoked is false or null
    // - expires_at > now
}

/**
 * Revoke a pending invite
 * @param {string} inviteId - The invite ID to revoke
 * @returns {Promise<boolean>} Success status
 */
async function revokeInvite(inviteId) {
    // Update household_invites set revoked = true where id = inviteId
}

/**
 * Get all household members (already partially exists as getHouseholdMembers)
 * Should join with auth.users or a profiles table to get email
 */
```

### 3. Helper Functions (Already Added)
The following helpers are already in `src/tracker.js`:
- `filterPendingInvites(invites)` - Filter to only pending invites
- `filterActiveMembers(members)` - Filter to only active (non-removed) members

### 4. UI Rendering
Add a function to render the partner management section:

```javascript
async function renderPartnerManagement() {
    // Only show if currentUserRole === 'patient'
    // Fetch pending invites and active members
    // Render into #partner-management-content or similar
}
```

### 5. Database Schema Reference
Tables involved:
- `household_invites`: id, household_id, invited_email, expires_at, accepted_at, revoked, created_at
- `household_members`: id, household_id, user_id, role, joined_at, removed_at

### 6. Tests Already Added
The following tests exist in `tests/run-tests.js`:
- `filterPendingInvites returns only unexpired, unaccepted, non-revoked invites`
- `filterPendingInvites returns empty array when no invites`
- `filterPendingInvites handles null/undefined input gracefully`
- `filterActiveMembers returns only non-removed members`
- `filterActiveMembers handles empty/null input`

Run `npm test` to verify tests pass before and after implementation.

## Implementation Steps

1. **Run tests first**: `npm test` to confirm baseline passes (should be 24 tests)

2. **Add UI structure** in `public/index.html`:
   - Add a "Partner Management" card in the patient section
   - Include containers for pending invites list and active members list

3. **Add data functions** in `public/tracker.js`:
   - `getPendingInvites()` - async Supabase query
   - `revokeInvite(inviteId)` - async Supabase update
   - Enhance `getHouseholdMembers()` if needed to include email

4. **Add render function** in `public/index.html` script:
   - `renderPartnerManagement()` - fetches and displays both lists
   - Wire up revoke/remove buttons with click handlers

5. **Call on load**: Add `renderPartnerManagement()` to `initializeApp()` after household is established

6. **Test manually**: Sign in as patient, verify UI shows correctly

7. **Run tests again**: `npm test` to confirm nothing broke

## Constraints
- Do NOT modify `public/demo.html` - it's visual-only
- Use existing Supabase client from `window.supabase`
- Follow existing code patterns in the file
- Ensure graceful handling when no invites/members exist

## Expected Outcome
Patient can see:
- "Pending Invites" section with email + expiry + revoke button
- "Current Partners" section with email + joined date + remove button
- Both sections update after actions (revoke/remove)
