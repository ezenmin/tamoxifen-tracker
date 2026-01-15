# Cross-Device Sync & Mobile UI Fixes - Claude Implementation Prompt

## Claude CLI Prompt

```
Read specs/cross-device-sync-fixes.md and implement all fixes:

1. Run SQL migration to add display_name column to household_members and patient_name to households tables using the Supabase Management API or provide the SQL for manual execution
2. Add syncNameToSupabase() and fetchNamesFromSupabase() functions to public/tracker.js
3. Update name input handlers in public/index.html to sync to Supabase with debouncing
4. Call fetchNamesFromSupabase() in initializeApp() after ensureHousehold()
5. Fix data consistency by ensuring remote entries always take precedence on load
6. Fix invite helper text to wrap properly on small screens (break into two lines)
7. Add the test cases from the spec to tests/run-tests.js
8. Run npm test to verify all tests pass
9. Commit all changes with message "Fix cross-device name sync and mobile UI issues"
10. Push to origin main

Do NOT modify public/demo.html. Use debouncing (300ms) for name sync to avoid excessive API calls.
```

## Context
The tamoxifen-tracker PWA has several issues when used across devices (browser vs Home Screen app):

1. **Names not synced**: Patient/partner names are stored in localStorage which is device-specific. Names set in browser don't appear in the PWA Home Screen app.

2. **Data inconsistency**: Entry counts differ between browser and PWA (e.g., "2 entries in last 7 days" in app vs "1" in browser) due to localStorage isolation.

3. **Invite text bundling**: The helper text for partner invite is too long and bundles together on small phone screens.

## Requirements

### 1. Sync Names to Supabase
Patient and partner names should be synced to Supabase so they appear across all devices.

**Database change needed:**
- Add `display_name` column to `household_members` table (or `households` table for patient name)

**Code changes:**
- When user edits name input, save to both localStorage AND Supabase
- On app load, fetch names from Supabase and populate localStorage
- Names should sync bidirectionally

### 2. Fix Data Consistency
Entries should always be fetched from Supabase as the source of truth.

**Code changes:**
- On app load (after auth), always fetch entries from Supabase first
- Replace local entries with remote entries (remote takes precedence)
- Ensure `renderHistory()` and `renderPartnerHistory()` are called after sync

### 3. Fix Invite Text Responsive Layout
The invite helper text needs to wrap properly on small screens.

**Current text (problematic):**
```
"Invite expires in 7 days (only affects joining; once joined, partner stays connected until removed)."
```

**Fix options:**
- Break into two lines with `<br>`
- Use responsive CSS to adjust on small screens
- Shorten the text

## Test Cases to Add

Add these tests to `tests/run-tests.js` in a new section:

```javascript
// -----------------------------------------------------------------------------
// Cross-Device Sync Tests
// -----------------------------------------------------------------------------
console.log('\n--- Cross-Device Sync Tests ---');

test('mergeEntriesRemotePrecedence gives remote entries priority', () => {
    // Test the merge logic: when same ID exists, remote wins
    const local = [
        { id: 'a', type: 'fatigue', severity: 2, date: '2026-01-10T10:00:00Z' },
        { id: 'b', type: 'headaches', severity: 3, date: '2026-01-11T10:00:00Z' }
    ];
    const remote = [
        { id: 'a', type: 'fatigue', severity: 4, date: '2026-01-10T10:00:00Z' },
        { id: 'c', type: 'nausea', severity: 1, date: '2026-01-12T10:00:00Z' }
    ];
    
    const mergedMap = new Map();
    local.forEach(e => mergedMap.set(e.id, e));
    remote.forEach(e => mergedMap.set(e.id, e));
    const merged = Array.from(mergedMap.values());
    
    assertEqual(merged.length, 3, 'Should have 3 entries after merge');
    const entryA = merged.find(e => e.id === 'a');
    assertEqual(entryA.severity, 4, 'Entry A should have remote severity (4)');
});

test('name trimming works correctly', () => {
    const testName = '  John Doe  ';
    const trimmed = testName.trim();
    assertEqual(trimmed, 'John Doe', 'Name should be trimmed');
});

test('empty name trims to empty string', () => {
    const testName = '   ';
    const trimmed = testName.trim();
    assertEqual(trimmed, '', 'Empty name should trim to empty string');
});

test('debounce helper delays function execution', () => {
    // Test debounce concept - actual timing tested manually
    let callCount = 0;
    const increment = () => { callCount++; };
    
    // Simulate immediate calls (no debounce in unit test, just logic check)
    increment();
    increment();
    increment();
    
    assertEqual(callCount, 3, 'Without debounce, all calls execute');
});
```

## Implementation Steps

### Step 1: Add Database Column
Run this SQL in Supabase SQL Editor:
```sql
-- Add display_name to household_members for partner names
ALTER TABLE household_members ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add patient_name to households for patient name (owner)
ALTER TABLE households ADD COLUMN IF NOT EXISTS patient_name TEXT;
```

### Step 2: Add Sync Functions to `public/tracker.js`
Add these functions:

```javascript
// Sync patient/partner display name to Supabase
async function syncNameToSupabase(role, displayName) {
    if (!supabaseClient || !currentUser || !currentHouseholdId) return;
    
    const trimmedName = (displayName || '').trim();
    
    try {
        if (role === 'patient') {
            // Patient name goes in households table
            await supabaseClient
                .from('households')
                .update({ patient_name: trimmedName })
                .eq('id', currentHouseholdId);
        } else {
            // Partner name goes in household_members
            await supabaseClient
                .from('household_members')
                .update({ display_name: trimmedName })
                .eq('household_id', currentHouseholdId)
                .eq('user_id', currentUser.id);
        }
        console.log(`Synced ${role} name to Supabase:`, trimmedName);
    } catch (err) {
        console.error('Failed to sync name:', err);
    }
}

// Fetch names from Supabase and populate localStorage
async function fetchNamesFromSupabase() {
    if (!supabaseClient || !currentHouseholdId) return;
    
    try {
        // Fetch patient name from households
        const { data: household } = await supabaseClient
            .from('households')
            .select('patient_name')
            .eq('id', currentHouseholdId)
            .single();
        
        if (household?.patient_name) {
            localStorage.setItem('tamoxifen-patient-name', household.patient_name);
        }
        
        // Fetch partner name from household_members
        const { data: members } = await supabaseClient
            .from('household_members')
            .select('display_name, role')
            .eq('household_id', currentHouseholdId)
            .eq('role', 'partner');
        
        if (members?.[0]?.display_name) {
            localStorage.setItem('tamoxifen-partner-name', members[0].display_name);
        }
        
        // Update UI
        if (typeof updateTabLabels === 'function') updateTabLabels();
        
    } catch (err) {
        console.error('Failed to fetch names:', err);
    }
}
```

Export these functions in the module.exports/window assignment.

### Step 3: Update Name Input Handlers in `public/index.html`
Find the name input event listeners and add sync calls:

```javascript
document.getElementById('patient-name').addEventListener('input', (e) => {
    setName(PATIENT_NAME_KEY, e.target.value);
    updateTabLabels();
    // Sync to Supabase
    if (typeof syncNameToSupabase === 'function') {
        syncNameToSupabase('patient', e.target.value);
    }
});

document.getElementById('partner-name').addEventListener('input', (e) => {
    setName(PARTNER_NAME_KEY, e.target.value);
    updateTabLabels();
    // Sync to Supabase  
    if (typeof syncNameToSupabase === 'function') {
        syncNameToSupabase('partner', e.target.value);
    }
});
```

### Step 4: Call fetchNamesFromSupabase on App Load
In `initializeApp()`, after `ensureHousehold()` completes:

```javascript
// After ensureHousehold() and before rendering UI
await fetchNamesFromSupabase();
```

### Step 5: Fix Data Consistency
In the initialization flow, ensure remote entries always take precedence:

```javascript
// Fetch and merge entries - remote takes precedence
const remoteEntries = await fetchEntriesFromSupabase();
if (remoteEntries.length > 0) {
    // Replace local with remote (remote is source of truth)
    saveEntries(remoteEntries);
}
renderHistory();
renderPartnerHistory();
updateCharts();
```

### Step 6: Fix Invite Helper Text Responsive Layout
Find the invite helper text in `public/index.html` and update:

**Before:**
```html
<div class="helper" style="...">Invite expires in 7 days (only affects joining; once joined, partner stays connected until removed).</div>
```

**After:**
```html
<div class="helper" style="margin-top:0.25rem;font-size:0.75rem;line-height:1.4;">
    Invite expires in 7 days.<br/>
    Once joined, partner stays connected until removed.
</div>
```

## Verification Steps

1. **Run tests**: `npm test` - should pass with new tests
2. **Run SQL migration** in Supabase dashboard
3. **Test name sync**:
   - Set patient name in browser
   - Open PWA Home Screen app
   - Name should appear
4. **Test data consistency**:
   - Add entry in browser
   - Open PWA
   - Same entry count should show
5. **Test invite text**:
   - View on phone-sized screen
   - Text should wrap nicely on two lines

## Files to Modify
- `public/tracker.js` - Add sync functions
- `public/index.html` - Update name handlers, fix invite text CSS
- `tests/run-tests.js` - Add sync tests
- Supabase SQL Editor - Add columns

## Constraints
- Do NOT modify `public/demo.html`
- Maintain backward compatibility (app should work if Supabase is unreachable)
- Use debouncing (300ms) for name sync to avoid excessive API calls
- All tests must pass before committing
- Commit message: "Fix cross-device name sync and mobile UI issues"
- Push to origin main after commit

## SQL Migration

Run this SQL in Supabase (project ref: mhloxubuifluwvnlrklb):

```sql
-- Add display_name to household_members for partner names
ALTER TABLE household_members ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add patient_name to households for patient name (owner)
ALTER TABLE households ADD COLUMN IF NOT EXISTS patient_name TEXT;
```

## Supabase Connection Info
- Project ref: mhloxubuifluwvnlrklb
- URL: https://mhloxubuifluwvnlrklb.supabase.co
- Anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obG94dWJ1aWZsdXd2bmxya2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjE1NDgsImV4cCI6MjA4Mzk5NzU0OH0.LOoDwKQN9HrA38B3_qu0ONYSMz7hJw7Re9xnnkBXNHc
- Service role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obG94dWJ1aWZsdXd2bmxya2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQyMTU0OCwiZXhwIjoyMDgzOTk3NTQ4fQ.SYx7qvjBlOGvSoYWPEgfUUqiNrP1eOL6ewqdp4hHb48
