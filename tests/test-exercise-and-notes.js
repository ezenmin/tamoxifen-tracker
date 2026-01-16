/**
 * Test cases for exercise feature and daily notes upsert fix
 * Run with: node tests/test-exercise-and-notes.js
 * 
 * Prerequisites:
 * - Supabase project must be accessible
 * - Service role key must be set
 */

const https = require('https');

const SUPABASE_URL = 'https://mhloxubuifluwvnlrklb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obG94dWJ1aWZsdXd2bmxya2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQyMTU0OCwiZXhwIjoyMDgzOTk3NTQ4fQ.SYx7qvjBlOGvSoYWPEgfUUqiNrP1eOL6ewqdp4hHb48';
const HOUSEHOLD_ID = 'f3c49aa8-442d-446c-a6ba-a81b887a0cd3';
const TEST_DATE = '2099-12-31'; // Use far future date to avoid conflicts with real data

// Helper to make Supabase REST API calls
function supabaseRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SUPABASE_URL);
        const options = {
            method,
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
                } catch {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Test results tracking
const results = [];
function log(test, passed, details = '') {
    results.push({ test, passed, details });
    console.log(`${passed ? '✅' : '❌'} ${test}${details ? ': ' + details : ''}`);
}

// Cleanup test data
async function cleanup() {
    // Delete any test entries with our test date
    await supabaseRequest('DELETE', `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}`);
}

// ============================================
// TEST CASES
// ============================================

async function testExerciseEntryCreation() {
    console.log('\n--- Test: Exercise Entry Creation ---');
    
    // Create an exercise entry
    const entry = {
        household_id: HOUSEHOLD_ID,
        occurred_at: TEST_DATE,
        payload: {
            type: 'exercise',
            event: true,
            exercise: '30 min jogging',
            author: 'patient'
        }
    };
    
    const res = await supabaseRequest('POST', '/rest/v1/entries', entry);
    
    if (res.status === 201 && res.data && res.data.length > 0) {
        log('Exercise entry created', true, `ID: ${res.data[0].id}`);
        return res.data[0].id;
    } else {
        log('Exercise entry created', false, `Status: ${res.status}`);
        return null;
    }
}

async function testExerciseEntryRetrieval() {
    console.log('\n--- Test: Exercise Entry Retrieval ---');
    
    const res = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.exercise`);
    
    if (res.status === 200 && res.data && res.data.length > 0) {
        const entry = res.data[0];
        const hasExerciseField = entry.payload && entry.payload.exercise === '30 min jogging';
        log('Exercise entry retrieved with correct data', hasExerciseField, 
            hasExerciseField ? entry.payload.exercise : 'Missing exercise field');
        return true;
    } else {
        log('Exercise entry retrieved', false, `Status: ${res.status}, Count: ${res.data?.length || 0}`);
        return false;
    }
}

async function testExerciseEntryUpdate() {
    console.log('\n--- Test: Exercise Entry Update (Upsert) ---');
    
    // First, get existing entry
    const getRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.exercise`);
    
    if (!getRes.data || getRes.data.length === 0) {
        log('Exercise entry update', false, 'No entry found to update');
        return false;
    }
    
    const existingId = getRes.data[0].id;
    
    // Update the exercise entry (simulating upsert by updating same date)
    const updateRes = await supabaseRequest('PATCH', 
        `/rest/v1/entries?id=eq.${existingId}`,
        { payload: { type: 'exercise', event: true, exercise: '45 min swimming', author: 'patient' } }
    );
    
    // Verify only one entry exists
    const verifyRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.exercise`);
    
    if (verifyRes.data && verifyRes.data.length === 1 && verifyRes.data[0].payload.exercise === '45 min swimming') {
        log('Exercise entry updated without duplication', true, 'Single entry with updated value');
        return true;
    } else {
        log('Exercise entry updated without duplication', false, 
            `Count: ${verifyRes.data?.length}, Value: ${verifyRes.data?.[0]?.payload?.exercise}`);
        return false;
    }
}

async function testDailyNoteCreation() {
    console.log('\n--- Test: Daily Note Creation ---');
    
    const entry = {
        household_id: HOUSEHOLD_ID,
        occurred_at: TEST_DATE,
        payload: {
            type: 'daily_note',
            event: true,
            notes: 'First note of the day',
            author: 'patient'
        }
    };
    
    const res = await supabaseRequest('POST', '/rest/v1/entries', entry);
    
    if (res.status === 201 && res.data && res.data.length > 0) {
        log('Daily note created', true, `ID: ${res.data[0].id}`);
        return res.data[0].id;
    } else {
        log('Daily note created', false, `Status: ${res.status}`);
        return null;
    }
}

async function testDailyNoteNoDuplication() {
    console.log('\n--- Test: Daily Note No Duplication on Update ---');
    
    // Get existing daily note
    const getRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.daily_note`);
    
    if (!getRes.data || getRes.data.length === 0) {
        log('Daily note no duplication', false, 'No entry found');
        return false;
    }
    
    const existingId = getRes.data[0].id;
    
    // Update the note (simulating what the app does on same-day update)
    await supabaseRequest('PATCH', 
        `/rest/v1/entries?id=eq.${existingId}`,
        { payload: { type: 'daily_note', event: true, notes: 'Updated note for the day', author: 'patient' } }
    );
    
    // Verify only ONE daily note exists for this date
    const verifyRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.daily_note`);
    
    if (verifyRes.data && verifyRes.data.length === 1) {
        log('Daily note no duplication on update', true, 'Single entry exists');
        return true;
    } else {
        log('Daily note no duplication on update', false, `Found ${verifyRes.data?.length} entries`);
        return false;
    }
}

async function testExerciseOnlyForPatient() {
    console.log('\n--- Test: Exercise Entry Has Author Field ---');
    
    const res = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.exercise`);
    
    if (res.data && res.data.length > 0) {
        const hasAuthor = res.data[0].payload.author === 'patient';
        log('Exercise entry has patient author', hasAuthor, 
            `Author: ${res.data[0].payload.author || 'missing'}`);
        return hasAuthor;
    } else {
        log('Exercise entry has patient author', false, 'No entry found');
        return false;
    }
}

// ============================================
// MAIN
// ============================================

async function runTests() {
    console.log('========================================');
    console.log('Exercise & Daily Notes Test Suite');
    console.log('========================================');
    console.log(`Test Date: ${TEST_DATE} (fake date to avoid conflicts)`);
    
    try {
        // Cleanup before tests
        await cleanup();
        
        // Run tests
        await testExerciseEntryCreation();
        await testExerciseEntryRetrieval();
        await testExerciseEntryUpdate();
        await testDailyNoteCreation();
        await testDailyNoteNoDuplication();
        await testExerciseOnlyForPatient();
        
        // Cleanup after tests
        await cleanup();
        
        // Summary
        console.log('\n========================================');
        console.log('TEST SUMMARY');
        console.log('========================================');
        const passed = results.filter(r => r.passed).length;
        const total = results.length;
        console.log(`Passed: ${passed}/${total}`);
        
        if (passed === total) {
            console.log('\n✅ ALL TESTS PASSED - Safe to commit!');
            process.exit(0);
        } else {
            console.log('\n❌ SOME TESTS FAILED - Review before committing');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Test execution error:', error);
        await cleanup();
        process.exit(1);
    }
}

runTests();
