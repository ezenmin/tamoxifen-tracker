/**
 * Test cases for symptom severity entry uniqueness
 * Run with: node tests/test-symptom-severity.js
 * 
 * Tests that each symptom type has ONLY ONE entry per day per author
 */

const https = require('https');

const SUPABASE_URL = 'https://mhloxubuifluwvnlrklb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obG94dWJ1aWZsdXd2bmxya2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQyMTU0OCwiZXhwIjoyMDgzOTk3NTQ4fQ.SYx7qvjBlOGvSoYWPEgfUUqiNrP1eOL6ewqdp4hHb48';
const HOUSEHOLD_ID = 'f3c49aa8-442d-446c-a6ba-a81b887a0cd3';
const TEST_DATE = '2099-12-30'; // Use far future date to avoid conflicts

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
    await supabaseRequest('DELETE', `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}`);
}

// ============================================
// TEST CASES
// ============================================

async function testCreateSymptomEntry() {
    console.log('\n--- Test: Create Symptom Entry ---');
    
    const entry = {
        household_id: HOUSEHOLD_ID,
        occurred_at: TEST_DATE,
        payload: {
            id: 'test-' + Date.now(),
            type: 'muscle_pain',
            severity: 3,
            author: 'patient',
            date: `${TEST_DATE}T12:00:00.000Z`
        }
    };
    
    const res = await supabaseRequest('POST', '/rest/v1/entries', entry);
    
    if (res.status === 201 && res.data && res.data.length > 0) {
        log('Symptom entry created', true, `ID: ${res.data[0].id}, severity: 3`);
        return res.data[0].id;
    } else {
        log('Symptom entry created', false, `Status: ${res.status}`);
        return null;
    }
}

async function testUpdateSymptomEntry() {
    console.log('\n--- Test: Update Symptom Entry (Same Day) ---');
    
    // First, get existing entry
    const getRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.muscle_pain`);
    
    if (!getRes.data || getRes.data.length === 0) {
        log('Update symptom entry', false, 'No entry found to update');
        return false;
    }
    
    const existingId = getRes.data[0].id;
    
    // Update severity to 5
    await supabaseRequest('PATCH', 
        `/rest/v1/entries?id=eq.${existingId}`,
        { payload: { ...getRes.data[0].payload, severity: 5 } }
    );
    
    // Verify only ONE entry exists with severity 5
    const verifyRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.muscle_pain`);
    
    if (verifyRes.data && verifyRes.data.length === 1 && verifyRes.data[0].payload.severity === 5) {
        log('Update creates no duplicate', true, 'Single entry with severity 5');
        return true;
    } else {
        log('Update creates no duplicate', false, 
            `Count: ${verifyRes.data?.length}, Severity: ${verifyRes.data?.[0]?.payload?.severity}`);
        return false;
    }
}

async function testNoMultipleEntriesSameDay() {
    console.log('\n--- Test: Detect Multiple Entries Same Day (REAL DATA) ---');
    
    // Check REAL data for Jan 16, 2026 muscle_pain
    const res = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.2026-01-16&payload->>type=eq.muscle_pain`);
    
    if (res.data && res.data.length === 1) {
        log('No duplicates for muscle_pain on 2026-01-16', true, 'Single entry exists');
        return true;
    } else if (res.data && res.data.length > 1) {
        const severities = res.data.map(e => e.payload.severity).join(', ');
        log('No duplicates for muscle_pain on 2026-01-16', false, 
            `Found ${res.data.length} entries with severities: ${severities}`);
        return false;
    } else {
        log('No duplicates for muscle_pain on 2026-01-16', true, 'No entries (acceptable)');
        return true;
    }
}

async function testCheckAllSymptomDuplicates() {
    console.log('\n--- Test: Check All Symptom Types for Duplicates ---');
    
    // Get all entries for household
    const res = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&select=id,occurred_at,payload`);
    
    if (!res.data) {
        log('Check all symptom duplicates', false, 'Could not fetch entries');
        return false;
    }
    
    // Group by (date, type, author) and find duplicates
    const groups = {};
    for (const entry of res.data) {
        if (entry.payload.event) continue; // Skip event entries
        if (!entry.payload.severity) continue; // Skip non-severity entries
        
        const key = `${entry.occurred_at}:${entry.payload.type}:${entry.payload.author || 'patient'}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
    }
    
    const duplicates = Object.entries(groups).filter(([k, v]) => v.length > 1);
    
    if (duplicates.length === 0) {
        log('No symptom duplicates in database', true, 'All entries unique per day/type/author');
        return true;
    } else {
        console.log('\n  Duplicates found:');
        for (const [key, entries] of duplicates) {
            const severities = entries.map(e => e.payload.severity).join(', ');
            console.log(`    ${key}: ${entries.length} entries (severities: ${severities})`);
        }
        log('No symptom duplicates in database', false, `${duplicates.length} duplicate groups found`);
        return false;
    }
}

async function testDeleteSymptomEntry() {
    console.log('\n--- Test: Delete Symptom Entry (Deselect) ---');
    
    // Get the test entry
    const getRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.muscle_pain`);
    
    if (!getRes.data || getRes.data.length === 0) {
        log('Delete symptom entry', false, 'No entry found to delete');
        return false;
    }
    
    const existingId = getRes.data[0].id;
    
    // Delete it
    await supabaseRequest('DELETE', `/rest/v1/entries?id=eq.${existingId}`);
    
    // Verify it's gone
    const verifyRes = await supabaseRequest('GET', 
        `/rest/v1/entries?household_id=eq.${HOUSEHOLD_ID}&occurred_at=eq.${TEST_DATE}&payload->>type=eq.muscle_pain`);
    
    if (!verifyRes.data || verifyRes.data.length === 0) {
        log('Delete symptom entry works', true, 'Entry successfully deleted');
        return true;
    } else {
        log('Delete symptom entry works', false, `Entry still exists`);
        return false;
    }
}

// ============================================
// MAIN
// ============================================

async function runTests() {
    console.log('========================================');
    console.log('Symptom Severity Uniqueness Test Suite');
    console.log('========================================');
    
    try {
        // Cleanup before tests
        await cleanup();
        
        // Run tests
        await testCreateSymptomEntry();
        await testUpdateSymptomEntry();
        await testDeleteSymptomEntry();
        
        // Check real data for duplicates
        await testNoMultipleEntriesSameDay();
        await testCheckAllSymptomDuplicates();
        
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
            console.log('\n❌ SOME TESTS FAILED - Fix required before committing');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('Test execution error:', error);
        await cleanup();
        process.exit(1);
    }
}

runTests();
