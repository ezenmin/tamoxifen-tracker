# Tamoxifen Tracker - Claude CLI Instructions

## Project Overview
A side effect tracker for Tamoxifen patients. Data is stored locally in `data/entries.json`.

---

## DEVELOPMENT WORKFLOW (Hypervelocity)

### Before ANY Code Change
1. Run tests first: `node tests/run-tests.js`
2. If tests fail, fix them before proceeding

### Adding a New Feature
1. **Write the test first** in `tests/run-tests.js`
2. Run tests - confirm the new test fails
3. Implement the feature in `src/tracker.js`
4. Run tests - confirm all pass
5. If feature affects UI, update `public/` files
6. Log the change to `logs/devlog.jsonl`

### Modifying Existing Code
1. Run tests first
2. Make the change
3. Run tests again
4. If tests fail, either fix the code or update the test

### Test Commands
```powershell
# Run all tests
node tests/run-tests.js

# Run tests with verbose output
$env:DEBUG="1"; node tests/run-tests.js
```

### Adding a Test
Edit `tests/run-tests.js` and add:
```javascript
test('description of what it tests', () => {
    // Setup
    const result = tracker.someFunction(input);
    // Assert
    assert(result === expected, 'Error message if fails');
});
```

### Reading Logs (Debug)
```powershell
# View recent logs
Get-Content logs/devlog.jsonl | Select-Object -Last 10

# View errors only
Get-Content logs/devlog.jsonl | Where-Object { $_ -match '"ERROR"' }
```

### Project Structure for Development
```
src/tracker.js    # Core logic - ALL business logic here
src/logger.js     # Logging utility
public/           # Web UI - calls functions from tracker.js
tests/            # All tests - run before and after changes
specs/            # Requirements - check before implementing
```

### Key Principles
- **Tests first** - No feature without a test
- **Logs always** - Log operations to devlog.jsonl
- **Local only** - No cloud dependencies
- **Small changes** - One feature at a time, test between each

---

## How to Operate

### Add an Entry
When user reports a side effect, create an entry in `data/entries.json`:
```json
{
  "id": "<timestamp>-<random>",
  "type": "<side_effect_type>",
  "severity": <1-5>,
  "notes": "<user's description>",
  "date": "<ISO timestamp>"
}
```

**Valid side effect types:**
- hot_flashes
- joint_pain
- muscle_pain
- fatigue
- mood_changes
- nausea
- headaches
- weight_changes
- sleep_problems
- other

**Severity scale:** 1 (mild) to 5 (severe)

### View History
Read `data/entries.json` and summarize recent entries for the user.

### Generate Summary for Doctor
Use the `formatSummary()` function from `src/tracker.js` or create a readable summary showing:
- Frequency of each side effect type
- Average severity per type
- Date range covered
- Notable patterns

### Export Report
Create a text file in the project root with the summary.

## Before Making Changes
Always run tests first:
```
node tests/run-tests.js
```

## Logs
Append operations to `logs/devlog.jsonl` in JSON Lines format:
```json
{"timestamp": "ISO", "level": "INFO|WARN|ERROR", "event": "event_name", ...data}
```

## File Structure
```
tamoxifen-tracker/
├── CLAUDE.md           # This file
├── data/
│   └── entries.json    # User's side effect entries
├── logs/
│   └── devlog.jsonl    # Operation logs
├── src/
│   ├── tracker.js      # Core logic (use these functions)
│   ├── logger.js       # Logging helper
│   └── mcp-logs-server.js  # MCP server for log access
├── tests/
│   └── run-tests.js    # Run before any changes
├── public/             # PWA web interface
└── specs/
    └── requirements.md # Product requirements
```

---

## MCP SETUP (For Hypervelocity Log Access)

Claude CLI can query logs directly via MCP. Set it up once:

### Install the MCP Server
```powershell
# From the tamoxifen-tracker folder, run:
claude mcp add --transport stdio tamoxifen-logs -- node src/mcp-logs-server.js
```

### Verify Installation
```powershell
claude mcp list
```

### Available MCP Tools
Once installed, Claude CLI can use these tools:
- `get_recent_logs` - Get last N log entries
- `get_errors` - Get all error logs
- `search_logs` - Search by event name

### Usage in Claude CLI
Just ask naturally:
- "Show me recent logs"
- "Are there any errors in the logs?"
- "Find logs about entry_added events"

---

## Example Interactions

**User says:** "I had hot flashes this morning, pretty bad"
**Action:** Add entry with type=hot_flashes, severity=4, notes="this morning, pretty bad"

**User says:** "Show me what I logged this week"
**Action:** Read entries.json, filter last 7 days, summarize

**User says:** "I need a report for my doctor appointment"
**Action:** Generate formatted summary of all entries

---

## FEATURE DEVELOPMENT EXAMPLES

### Example: Add a "delete entry" feature

**Step 1: Write test first**
```javascript
test('deleteEntry removes entry by id', () => {
    const entry = tracker.createEntry('fatigue', 2, 'test');
    const entries = [entry];
    const result = tracker.deleteEntry(entries, entry.id);
    assertEqual(result.length, 0, 'Should remove the entry');
});
```

**Step 2: Run tests** → Confirm new test fails

**Step 3: Implement in tracker.js**
```javascript
function deleteEntry(entries, id) {
    return entries.filter(e => e.id !== id);
}
```

**Step 4: Run tests** → Confirm all pass

**Step 5: Log it**
```json
{"timestamp":"...","level":"INFO","event":"feature_added","feature":"deleteEntry"}
```

### Example: Fix a bug

**Step 1:** Run tests to see current state
**Step 2:** Add a test that reproduces the bug
**Step 3:** Fix the bug
**Step 4:** Confirm test passes
**Step 5:** Log it
```json
{"timestamp":"...","level":"INFO","event":"bug_fixed","description":"..."}
```

### Example: Update the web UI

**Step 1:** Run tests (ensure core logic works)
**Step 2:** Edit `public/index.html`
**Step 3:** Start dev server: `npx http-server public -p 3000`
**Step 4:** Test in browser at http://localhost:3000
**Step 5:** If UI uses new tracker.js functions, copy: 
```powershell
Copy-Item src/tracker.js public/tracker.js
```
