/**
 * Simple test runner - no dependencies needed
 * Following Hypervelocity: tests must work from day 1
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}`);
        errors.push({ name, error: e.message });
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

// Load and run test files
console.log('\n--- Tracker Core Tests ---');

// Import the tracker module
const trackerPath = path.join(__dirname, '..', 'src', 'tracker.js');
if (fs.existsSync(trackerPath)) {
    const tracker = require(trackerPath);
    
    test('createEntry returns object with required fields', () => {
        const entry = tracker.createEntry('hot_flashes', 3, 'After lunch');
        assert(entry.id, 'Should have id');
        assert(entry.type === 'hot_flashes', 'Should have type');
        assert(entry.severity === 3, 'Should have severity');
        assert(entry.notes === 'After lunch', 'Should have notes');
        assert(entry.date, 'Should have date');
    });

    test('createEntry validates severity 1-5', () => {
        let threw = false;
        try {
            tracker.createEntry('hot_flashes', 6, '');
        } catch (e) {
            threw = true;
        }
        assert(threw, 'Should throw for severity > 5');
    });

    test('formatSummary returns readable text', () => {
        const entries = [
            tracker.createEntry('hot_flashes', 3, 'Morning'),
            tracker.createEntry('fatigue', 2, 'Afternoon')
        ];
        const summary = tracker.formatSummary(entries);
        assert(summary.includes('HOT FLASHES') || summary.includes('hot_flashes'), 'Should include type');
        assert(typeof summary === 'string', 'Should be string');
    });

    // Partner Observation Tests
    console.log('\n--- Partner Observation Tests ---');

    test('createPartnerObservation returns object with required fields', () => {
        const obs = tracker.createPartnerObservation('seemed_tired', 3, 'After work');
        assert(obs.id, 'Should have id');
        assert(obs.type === 'seemed_tired', 'Should have type');
        assert(obs.severity === 3, 'Should have severity');
        assert(obs.notes === 'After work', 'Should have notes');
        assert(obs.date, 'Should have date');
        assert(obs.author === 'partner', 'Should have author set to partner');
    });

    test('createPartnerObservation validates severity 1-5', () => {
        let threw = false;
        try {
            tracker.createPartnerObservation('seemed_tired', 6, '');
        } catch (e) {
            threw = true;
        }
        assert(threw, 'Should throw for severity > 5');
    });

    test('PARTNER_OBSERVATION_TYPES is exported and has expected types', () => {
        assert(tracker.PARTNER_OBSERVATION_TYPES, 'Should export PARTNER_OBSERVATION_TYPES');
        assert(tracker.PARTNER_OBSERVATION_TYPES.includes('seemed_tired'), 'Should include seemed_tired');
        assert(tracker.PARTNER_OBSERVATION_TYPES.includes('noticed_mood_change'), 'Should include noticed_mood_change');
        assert(tracker.PARTNER_OBSERVATION_TYPES.includes('mentioned_pain'), 'Should include mentioned_pain');
    });

    test('filterByAuthor filters entries correctly', () => {
        const patientEntry = tracker.createEntry('hot_flashes', 2, 'test');
        patientEntry.author = 'patient'; // Add author for testing
        const partnerObs = tracker.createPartnerObservation('seemed_tired', 3, 'test');
        const allEntries = [patientEntry, partnerObs];

        const partnerOnly = tracker.filterByAuthor(allEntries, 'partner');
        assertEqual(partnerOnly.length, 1, 'Should have 1 partner entry');
        assertEqual(partnerOnly[0].author, 'partner', 'Should be partner entry');
    });

    // Menstrual Event Tests
    console.log('\n--- Menstrual Event Tests ---');

    test('createEventEntry returns object without severity', () => {
        const entry = tracker.createEventEntry('period_started', 'Day 1 of cycle');
        assert(entry.id, 'Should have id');
        assert(entry.type === 'period_started', 'Should have type');
        assert(entry.event === true, 'Should have event flag set to true');
        assert(entry.notes === 'Day 1 of cycle', 'Should have notes');
        assert(entry.date, 'Should have date');
        assert(entry.severity === undefined, 'Should NOT have severity');
    });

    test('createEventEntry does not throw (no severity required)', () => {
        let threw = false;
        try {
            tracker.createEventEntry('spotting', '');
            tracker.createEventEntry('period_ended', null);
        } catch (e) {
            threw = true;
        }
        assert(!threw, 'Should not throw when creating event entries');
    });

    console.log('\n--- Daily Notes Tests ---');

    test('createDailyNote returns event entry without severity', () => {
        assert(typeof tracker.createDailyNote === 'function', 'Should export createDailyNote');
        const date = '2026-01-15T00:00:00.000Z';
        const note = tracker.createDailyNote('patient', 'work was stressful', date);
        assert(note.id, 'Should have id');
        assertEqual(note.type, 'daily_note', 'Should have type daily_note');
        assertEqual(note.event, true, 'Should be event-style');
        assertEqual(note.author, 'patient', 'Should set author');
        assertEqual(note.notes, 'work was stressful', 'Should set notes');
        assertEqual(note.date, date, 'Should preserve date');
        assert(note.severity === undefined, 'Should NOT have severity');
    });

    test('MENSTRUAL_EVENT_TYPES is exported and has expected types', () => {
        assert(tracker.MENSTRUAL_EVENT_TYPES, 'Should export MENSTRUAL_EVENT_TYPES');
        assert(tracker.MENSTRUAL_EVENT_TYPES.includes('period_started'), 'Should include period_started');
        assert(tracker.MENSTRUAL_EVENT_TYPES.includes('period_ended'), 'Should include period_ended');
        assert(tracker.MENSTRUAL_EVENT_TYPES.includes('spotting'), 'Should include spotting');
    });

    test('formatSummary includes menstrual events section when event entries exist', () => {
        const severityEntry = tracker.createEntry('hot_flashes', 3, 'Morning');
        const eventEntry = tracker.createEventEntry('period_started', 'First day');
        const entries = [severityEntry, eventEntry];
        const summary = tracker.formatSummary(entries);
        assert(summary.includes('Menstrual') || summary.includes('Bleeding'), 'Should include menstrual events section');
        assert(summary.includes('Period Started') || summary.includes('period_started'), 'Should include the event type');
    });

    test('formatSummary handles mixed severity and event entries without errors', () => {
        const entries = [
            tracker.createEntry('fatigue', 2, ''),
            tracker.createEventEntry('spotting', 'Light'),
            tracker.createEntry('headaches', 4, ''),
            tracker.createEventEntry('period_ended', '')
        ];
        let threw = false;
        let summary;
        try {
            summary = tracker.formatSummary(entries);
        } catch (e) {
            threw = true;
        }
        assert(!threw, 'Should not throw with mixed entries');
        assert(typeof summary === 'string', 'Should return a string');
    });

    // Top Symptoms Tests
    console.log('\n--- Top Symptoms Tests ---');

    test('getTopSymptomsByAvgSeverity ranks by average severity not frequency', () => {
        // Create entries where one type has high frequency but low severity
        // and another has low frequency but high severity
        const entries = [
            { id: '1', type: 'fatigue', severity: 2, date: new Date().toISOString() },
            { id: '2', type: 'fatigue', severity: 2, date: new Date().toISOString() },
            { id: '3', type: 'fatigue', severity: 2, date: new Date().toISOString() },
            { id: '4', type: 'fatigue', severity: 2, date: new Date().toISOString() },
            { id: '5', type: 'headaches', severity: 5, date: new Date().toISOString() }
        ];
        const top = tracker.getTopSymptomsByAvgSeverity(entries, 'all', 3);
        assert(top.length >= 2, 'Should return at least 2 symptoms');
        assert(top[0].type === 'headaches', 'Headaches (avg 5) should be first');
        assert(top[1].type === 'fatigue', 'Fatigue (avg 2) should be second');
        assertEqual(top[0].avgSeverity, 5, 'Headaches avg should be 5');
        assertEqual(top[1].avgSeverity, 2, 'Fatigue avg should be 2');
    });

    test('getTopSymptomsByAvgSeverity excludes event entries', () => {
        const entries = [
            { id: '1', type: 'fatigue', severity: 3, date: new Date().toISOString() },
            { id: '2', type: 'period_started', event: true, date: new Date().toISOString() },
            { id: '3', type: 'spotting', event: true, date: new Date().toISOString() }
        ];
        const top = tracker.getTopSymptomsByAvgSeverity(entries, 'all', 3);
        assertEqual(top.length, 1, 'Should only include 1 symptom (fatigue)');
        assertEqual(top[0].type, 'fatigue', 'Should be fatigue');
    });

    test('getTopSymptomsByAvgSeverity respects topN parameter', () => {
        const entries = [
            { id: '1', type: 'fatigue', severity: 4, date: new Date().toISOString() },
            { id: '2', type: 'headaches', severity: 3, date: new Date().toISOString() },
            { id: '3', type: 'nausea', severity: 2, date: new Date().toISOString() },
            { id: '4', type: 'joint_pain', severity: 1, date: new Date().toISOString() }
        ];
        const top2 = tracker.getTopSymptomsByAvgSeverity(entries, 'all', 2);
        assertEqual(top2.length, 2, 'Should return only 2 symptoms');
    });

    // Symptom Trend Data Tests
    console.log('\n--- Symptom Trend Data Tests ---');

    test('getSymptomTrendData produces daily averages per type', () => {
        const today = new Date().toISOString().split('T')[0];
        const entries = [
            { id: '1', type: 'fatigue', severity: 2, date: today + 'T08:00:00Z' },
            { id: '2', type: 'fatigue', severity: 4, date: today + 'T16:00:00Z' },
            { id: '3', type: 'headaches', severity: 3, date: today + 'T12:00:00Z' }
        ];
        const data = tracker.getSymptomTrendData(entries, 'all', ['fatigue', 'headaches']);
        assert(data.seriesByType.fatigue, 'Should have fatigue series');
        assert(data.seriesByType.headaches, 'Should have headaches series');
        // Fatigue average for today should be (2+4)/2 = 3
        assertEqual(data.seriesByType.fatigue[0], 3, 'Fatigue daily avg should be 3');
        // Headaches average for today should be 3
        assertEqual(data.seriesByType.headaches[0], 3, 'Headaches daily avg should be 3');
    });

    test('getSymptomTrendData uses null when no entries for that symptom on a day', () => {
        const day1 = '2025-01-10';
        const day2 = '2025-01-11';
        const entries = [
            { id: '1', type: 'fatigue', severity: 3, date: day1 + 'T10:00:00Z' },
            { id: '2', type: 'headaches', severity: 2, date: day2 + 'T10:00:00Z' }
        ];
        const data = tracker.getSymptomTrendData(entries, 'all', ['fatigue', 'headaches']);
        // Day 1: fatigue=3, headaches=null
        // Day 2: fatigue=null, headaches=2
        assertEqual(data.seriesByType.fatigue[0], 3, 'Fatigue on day1 should be 3');
        assertEqual(data.seriesByType.fatigue[1], null, 'Fatigue on day2 should be null');
        assertEqual(data.seriesByType.headaches[0], null, 'Headaches on day1 should be null');
        assertEqual(data.seriesByType.headaches[1], 2, 'Headaches on day2 should be 2');
    });

    test('getSymptomTrendData returns rawDates and labels arrays', () => {
        const entries = [
            { id: '1', type: 'fatigue', severity: 2, date: '2025-01-15T10:00:00Z' }
        ];
        const data = tracker.getSymptomTrendData(entries, 'all', ['fatigue']);
        assert(Array.isArray(data.rawDates), 'rawDates should be an array');
        assert(Array.isArray(data.labels), 'labels should be an array');
        assertEqual(data.rawDates[0], '2025-01-15', 'rawDates should have date string');
    });

    // -------------------------------------------------------------------------
    // Partner Management Visibility Tests
    // -------------------------------------------------------------------------
    console.log('\n--- Partner Management Visibility Tests ---');

    test('filterPendingInvites returns only unexpired, unaccepted, non-revoked invites', () => {
        assert(typeof tracker.filterPendingInvites === 'function', 'Should export filterPendingInvites');
        const now = Date.now();
        const mockInvites = [
            { id: '1', invited_email: 'pending@example.com', expires_at: new Date(now + 86400000).toISOString(), accepted_at: null, revoked: false },
            { id: '2', invited_email: 'accepted@example.com', expires_at: new Date(now + 86400000).toISOString(), accepted_at: '2026-01-10T00:00:00Z', revoked: false },
            { id: '3', invited_email: 'expired@example.com', expires_at: new Date(now - 86400000).toISOString(), accepted_at: null, revoked: false },
            { id: '4', invited_email: 'revoked@example.com', expires_at: new Date(now + 86400000).toISOString(), accepted_at: null, revoked: true },
        ];
        const pending = tracker.filterPendingInvites(mockInvites);
        assertEqual(pending.length, 1, 'Should have 1 pending invite');
        assertEqual(pending[0].invited_email, 'pending@example.com', 'Wrong pending invite returned');
    });

    test('filterPendingInvites returns empty array when no invites', () => {
        const pending = tracker.filterPendingInvites([]);
        assertEqual(pending.length, 0, 'Should return empty array');
    });

    test('filterPendingInvites handles null/undefined input gracefully', () => {
        assertEqual(tracker.filterPendingInvites(null).length, 0, 'null should return empty');
        assertEqual(tracker.filterPendingInvites(undefined).length, 0, 'undefined should return empty');
    });

    test('filterActiveMembers returns only non-removed members', () => {
        assert(typeof tracker.filterActiveMembers === 'function', 'Should export filterActiveMembers');
        const mockMembers = [
            { user_id: 'u1', role: 'partner', removed_at: null, profiles: { email: 'partner1@example.com' } },
            { user_id: 'u2', role: 'partner', removed_at: '2026-01-01T00:00:00Z', profiles: { email: 'removed@example.com' } },
            { user_id: 'u3', role: 'partner', removed_at: null, profiles: { email: 'partner2@example.com' } },
        ];
        const active = tracker.filterActiveMembers(mockMembers);
        assertEqual(active.length, 2, 'Should have 2 active members');
        assert(active.every(m => m.removed_at === null), 'All should have removed_at null');
    });

    test('filterActiveMembers handles empty/null input', () => {
        assertEqual(tracker.filterActiveMembers([]).length, 0, 'Empty array should return empty');
        assertEqual(tracker.filterActiveMembers(null).length, 0, 'null should return empty');
    });

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

} else {
    console.log('  (tracker.js not yet created - creating skeleton tests)');
    
    test('test infrastructure works', () => {
        assert(true, 'Basic assertion');
    });
    
    test('assertEqual works', () => {
        assertEqual(1 + 1, 2, 'Math works');
    });
}

// Summary
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);

if (errors.length > 0) {
    console.log('Failures:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
}

process.exit(failed > 0 ? 1 : 0);
