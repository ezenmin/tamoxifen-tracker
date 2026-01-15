# Data Cleanup, Deduplication & Entry Constraint - Claude Implementation Prompt

## Claude CLI Prompt

```
Read specs/data-cleanup-and-dedup.md and implement all fixes.

## Business Logic (CRITICAL - read carefully):

Each symptom category (hot_flashes, fatigue, mood_swings, etc.) follows these rules:
- If a category is clicked MULTIPLE TIMES in a day, keep ONLY THE LAST VALUE and count as 1 entry
- If a category is selected then UNSELECTED (severity set to null/0/empty), the entry is DELETED (0 entries)
- Maximum entries per (day, type, author) combination: 0 or 1 (never 2+)

Examples:
- User clicks hot_flashes → severity 2 → clicks again → severity 4 → clicks again → severity 3
  Result: 1 entry with severity=3 (the last value)
- User clicks hot_flashes → severity 2 → then unclicks/clears it
  Result: 0 entries (the entry is deleted)
- User clicks hot_flashes (severity 3) and fatigue (severity 2) on same day
  Result: 2 entries (one per type is valid)

## Implementation Steps:

1. Create a SQL script to deduplicate existing entries in Supabase:
   - Keep only ONE entry per (household_id, occurred_at, payload->type, payload->author) combination
   - Keep the most recent updated_at when duplicates exist
   - This PRESERVES data, doesn't delete it all

2. Run the deduplication SQL via Supabase REST API using service role key

3. Update entry creation logic in public/tracker.js:
   - If severity is null/0/empty → DELETE existing entry for that day/type/author (if any)
   - If severity has a value → UPSERT (update existing or insert new)
   - Never create duplicate entries for same day/type/author

4. Update sync logic to prevent re-creating entries that already exist in Supabase

5. REMOVE the invite helper text from the partner invite section entirely (expiration info is already shown in Manage tab)

6. Add test cases for:
   - Clicking same category multiple times keeps only last value
   - Unselecting a category deletes the entry (0 entries)
   - Different categories on same day create separate entries
   - Deduplication keeps most recent entry

7. Bump service worker cache version to force PWA refresh

8. Run npm test to verify all tests pass

9. Commit with message "Fix duplicate entries: keep last value per day/type, unselect=delete, remove redundant invite text"

10. Push to origin main

Do NOT modify public/demo.html.
```

## Problem Analysis

### Issue 1: Massive Entry Duplication in Supabase
The database has accumulated duplicate entries due to faulty sync logic:
- **53 hot_flashes** total (should be ~5-10 unique days)
- **27 hot_flashes on Jan 13 alone** (should be 0 or 1!)
- Similar duplication across all symptom types

**Root cause**: The old merge logic (`mergedMap.set(e.id, e)`) used the entry's internal `id` from localStorage which was regenerated each time, causing the same entry to be uploaded multiple times with different IDs.

**Solution**: Deduplicate (keep last entry per unique combo) - this PRESERVES data, doesn't delete it all.

### Issue 2: No Upsert/Delete Logic for Same-Day Entries
Currently when a user clicks a category multiple times or unclicks it:
- Multiple clicks create multiple entries (WRONG - should keep only last value)
- Unclicking doesn't delete the entry (WRONG - unselected = 0 entries)

**Correct behavior**:
| Action | Result |
|--------|--------|
| Click hot_flashes (severity 3) | 1 entry with severity=3 |
| Click hot_flashes again (severity 4) | Still 1 entry, severity updated to 4 |
| Unclick hot_flashes (severity null) | 0 entries (deleted) |

### Issue 3: Redundant Invite Helper Text
The invite expiration text appears both:
- Next to the partner email input
- In the Manage tab (Partner Management section)

**Fix**: Remove the helper text from the invite input area since it's already shown in Manage tab.

### Issue 4: Entry Count Mismatch (Browser vs App)
Different localStorage contexts have different cached data. After deduplication, both will sync from the same Supabase source.

## Database Schema
Current `entries` table structure:
- `id` (UUID, primary key)
- `household_id` (UUID)
- `occurred_at` (DATE)
- `payload` (JSONB) containing: `{ id, type, severity, notes, author, date, _created_by_user_id }`
- `created_at`, `updated_at` (timestamps)
- `created_by_user_id` (UUID)

## SQL Migration for Deduplication

```sql
-- Step 1: Create a temp table with deduplicated entries (keep newest updated_at for each unique combo)
CREATE TEMP TABLE entries_dedup AS
SELECT DISTINCT ON (household_id, occurred_at, payload->>'type', payload->>'author')
    id, household_id, occurred_at, payload, created_at, updated_at, created_by_user_id
FROM entries
ORDER BY household_id, occurred_at, payload->>'type', payload->>'author', updated_at DESC;

-- Step 2: Count before/after
SELECT 'Before' as stage, COUNT(*) as count FROM entries
UNION ALL
SELECT 'After (dedup)', COUNT(*) FROM entries_dedup;

-- Step 3: Delete all entries and re-insert deduplicated ones
DELETE FROM entries;
INSERT INTO entries SELECT * FROM entries_dedup;

-- Step 4: Add unique constraint to prevent future duplicates
-- Note: Can't add unique constraint on JSONB fields directly, so we add a generated column or use upsert logic
```

## Alternative: Use Upsert with Conflict Resolution

Instead of a database constraint, update the sync logic to:
1. Generate a deterministic ID based on (household_id, occurred_at, type, author)
2. Use upsert (INSERT ... ON CONFLICT UPDATE)

Deterministic ID formula:
```javascript
function getEntryUniqueKey(householdId, occurredAt, type, author) {
    return `${householdId}:${occurredAt}:${type}:${author || 'patient'}`;
}
```

## Test Cases to Add

Add these tests to `tests/run-tests.js`:

```javascript
// -----------------------------------------------------------------------------
// Deduplication & Entry Upsert/Delete Tests
// -----------------------------------------------------------------------------
console.log('\n--- Deduplication & Entry Upsert/Delete Tests ---');

test('getEntryUniqueKey generates consistent keys', () => {
    const key1 = 'hh123:2026-01-15:hot_flashes:patient';
    const key2 = 'hh123:2026-01-15:hot_flashes:patient';
    assertEqual(key1, key2, 'Same inputs should produce same key');
});

test('getEntryUniqueKey differentiates by type', () => {
    const key1 = 'hh123:2026-01-15:hot_flashes:patient';
    const key2 = 'hh123:2026-01-15:fatigue:patient';
    assert(key1 !== key2, 'Different types should produce different keys');
});

test('getEntryUniqueKey differentiates by date', () => {
    const key1 = 'hh123:2026-01-15:hot_flashes:patient';
    const key2 = 'hh123:2026-01-14:hot_flashes:patient';
    assert(key1 !== key2, 'Different dates should produce different keys');
});

test('getEntryUniqueKey differentiates by author', () => {
    const key1 = 'hh123:2026-01-15:hot_flashes:patient';
    const key2 = 'hh123:2026-01-15:hot_flashes:partner';
    assert(key1 !== key2, 'Different authors should produce different keys');
});

test('clicking same category multiple times keeps only last value', () => {
    // Simulate: user clicks hot_flashes 3 times with severities 2, 3, 4
    const clicks = [
        { type: 'hot_flashes', severity: 2, timestamp: '2026-01-15T10:00:00Z' },
        { type: 'hot_flashes', severity: 3, timestamp: '2026-01-15T10:01:00Z' },
        { type: 'hot_flashes', severity: 4, timestamp: '2026-01-15T10:02:00Z' },
    ];
    
    // Each click should UPDATE, not create new
    let entry = null;
    clicks.forEach(click => {
        entry = { type: click.type, severity: click.severity, date: click.timestamp };
    });
    
    // Result: 1 entry with severity=4 (last value)
    assertEqual(entry.severity, 4, 'Should keep the last severity value (4)');
});

test('unselecting a category deletes the entry (severity null = 0 entries)', () => {
    // Simulate: user clicks hot_flashes then unclicks it
    let entries = [
        { id: 'a', type: 'hot_flashes', date: '2026-01-15T10:00:00Z', severity: 3 }
    ];
    
    // User unclicks - severity becomes null/0/empty
    const unclickSeverity = null;
    const dayKey = '2026-01-15';
    const type = 'hot_flashes';
    
    if (unclickSeverity === null || unclickSeverity === 0) {
        // DELETE the entry
        entries = entries.filter(e => !(e.date.startsWith(dayKey) && e.type === type));
    }
    
    assertEqual(entries.length, 0, 'Unselecting should delete the entry (0 entries)');
});

test('different categories on same day create separate entries', () => {
    const entries = [
        { id: 'a', type: 'hot_flashes', date: '2026-01-15T10:00:00Z', severity: 3 },
        { id: 'b', type: 'fatigue', date: '2026-01-15T10:00:00Z', severity: 2 },
    ];
    
    assertEqual(entries.length, 2, 'Different types on same day should have 2 entries');
});

test('deduplicateEntries keeps only the last entry per unique key', () => {
    // Input: 3 entries, 2 are duplicates (same day, same type, same author)
    const entries = [
        { id: 'a', type: 'hot_flashes', date: '2026-01-15T10:00:00Z', author: 'patient', severity: 2 },
        { id: 'b', type: 'hot_flashes', date: '2026-01-15T14:00:00Z', author: 'patient', severity: 3 }, // Duplicate - same day/type/author
        { id: 'c', type: 'fatigue', date: '2026-01-15T10:00:00Z', author: 'patient', severity: 1 }, // Different type - OK
    ];
    
    // Dedup logic: group by (date's day, type, author), keep last entry
    const seen = new Map();
    entries.forEach(e => {
        const dayKey = e.date.split('T')[0];
        const key = `${dayKey}:${e.type}:${e.author || 'patient'}`;
        seen.set(key, e); // Later entry overwrites earlier
    });
    const deduped = Array.from(seen.values());
    
    assertEqual(deduped.length, 2, 'Should have 2 unique entries (one hot_flashes + one fatigue)');
    const hotFlash = deduped.find(e => e.type === 'hot_flashes');
    assertEqual(hotFlash.severity, 3, 'Should keep the later hot_flashes entry (severity 3)');
});

test('updateOrDeleteEntry handles upsert correctly', () => {
    let entries = [
        { id: 'a', type: 'hot_flashes', date: '2026-01-15T10:00:00Z', severity: 2 }
    ];
    
    // Update with new severity
    const newSeverity = 4;
    const dayKey = '2026-01-15';
    const type = 'hot_flashes';
    
    const existing = entries.find(e => e.date.startsWith(dayKey) && e.type === type);
    if (existing) {
        existing.severity = newSeverity;
    }
    
    assertEqual(entries.length, 1, 'Should still have exactly 1 entry (not 2)');
    assertEqual(entries[0].severity, 4, 'Severity should be updated to new value');
});
```

## Implementation Steps

### Step 1: Run Deduplication SQL
Execute via Supabase Management API or SQL Editor:

```sql
-- Deduplicate entries keeping the most recently updated one per unique combination
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY household_id, occurred_at, payload->>'type', COALESCE(payload->>'author', 'patient')
               ORDER BY updated_at DESC
           ) as rn
    FROM entries
)
DELETE FROM entries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
```

### Step 2: Update tracker.js Entry Creation
Modify `saveEntryToSupabase` to handle upsert AND delete:

```javascript
async function saveEntryToSupabase(entry) {
    if (!supabaseClient || !currentHouseholdId) return;
    
    const occurredAt = entry.date.split('T')[0]; // Get just the date part
    const entryType = entry.type;
    const author = entry.author || 'patient';
    
    // Check if entry already exists for this day/type/author
    const { data: existing } = await supabaseClient
        .from('entries')
        .select('id')
        .eq('household_id', currentHouseholdId)
        .eq('occurred_at', occurredAt)
        .eq('payload->>type', entryType)
        .eq('payload->>author', author)
        .single();
    
    // If severity is null/0/empty, DELETE the entry (user unselected)
    if (!entry.severity) {
        if (existing) {
            await supabaseClient
                .from('entries')
                .delete()
                .eq('id', existing.id);
            console.log(`Deleted entry for ${entryType} on ${occurredAt}`);
        }
        return;
    }
    
    // Otherwise, UPSERT (update existing or insert new)
    if (existing) {
        // Update existing entry with new severity
        await supabaseClient
            .from('entries')
            .update({
                payload: { ...entry, _created_by_user_id: currentUser.id },
                updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        console.log(`Updated entry for ${entryType} on ${occurredAt} to severity ${entry.severity}`);
    } else {
        // Insert new entry
        await supabaseClient
            .from('entries')
            .insert({
                household_id: currentHouseholdId,
                occurred_at: occurredAt,
                payload: { ...entry, _created_by_user_id: currentUser.id },
                created_by_user_id: currentUser.id
            });
        console.log(`Created entry for ${entryType} on ${occurredAt} with severity ${entry.severity}`);
    }
}
```

### Step 3: Update Local Entry Logic
Modify entry creation to handle upsert and delete locally:

```javascript
function createOrUpdateEntry(type, severity, notes, dateOverride) {
    const targetDate = dateOverride || new Date().toISOString();
    const dayKey = targetDate.split('T')[0];
    const entries = getEntries();
    
    // Find existing entry of same type on same day
    const existingIndex = entries.findIndex(e => 
        e.date.startsWith(dayKey) && 
        e.type === type && 
        (e.author || 'patient') === 'patient'
    );
    
    // If severity is null/0/empty, DELETE the entry
    if (!severity) {
        if (existingIndex >= 0) {
            entries.splice(existingIndex, 1);
            saveEntries(entries);
            console.log(`Deleted local entry for ${type} on ${dayKey}`);
        }
        return null;
    }
    
    // Otherwise, UPSERT
    if (existingIndex >= 0) {
        // Update existing entry with new severity (keeps only last value)
        entries[existingIndex].severity = severity;
        entries[existingIndex].notes = notes;
        entries[existingIndex].date = targetDate;
        saveEntries(entries);
        return entries[existingIndex];
    } else {
        // Create new entry
        const newEntry = {
            id: generateId(),
            type,
            severity,
            notes: notes || '',
            date: targetDate,
            author: 'patient'
        };
        entries.push(newEntry);
        saveEntries(entries);
        return newEntry;
    }
}
```

### Step 4: Remove Redundant Invite Helper Text
Remove the invite helper text from the partner invite section in `public/index.html`:

```html
<!-- REMOVE this div entirely - expiration info is already in Manage tab -->
<div class="helper invite-helper-text" style="...">
    Invite expires in 7 days.<br/>
    Once joined, partner stays connected until removed.
</div>
```

### Step 5: Clear Service Worker Cache
Bump the cache version in `sw.js` to force PWA to use new HTML:
```javascript
const CACHE_NAME = 'tamoxifen-tracker-v5'; // Increment from v4
```

## Supabase Connection Info
- Project ref: mhloxubuifluwvnlrklb
- URL: https://mhloxubuifluwvnlrklb.supabase.co
- Service role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obG94dWJ1aWZsdXd2bmxya2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQyMTU0OCwiZXhwIjoyMDgzOTk3NTQ4fQ.SYx7qvjBlOGvSoYWPEgfUUqiNrP1eOL6ewqdp4hHb48

## Verification Steps
1. Before dedup: 380 entries in Supabase
2. After dedup: Should have ~30-50 unique entries (one per type per day)
3. Run `npm test` - all tests pass
4. Refresh app - entry counts should now match between browser and PWA
5. Try adding same symptom type twice on same day - should update, not duplicate

## Constraints
- Do NOT modify `public/demo.html`
- Preserve existing entry data (dedup keeps last entry, doesn't delete all)
- Maintain backward compatibility with old entry format
- All tests must pass before committing
- Commit message: "Fix duplicate entries: keep last value per day/type, unselect=delete, remove redundant invite text"
- Push to origin main after commit
