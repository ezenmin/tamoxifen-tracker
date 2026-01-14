/**
 * Generate 2 months of realistic test data
 */

const fs = require('fs');
const path = require('path');

const SIDE_EFFECT_TYPES = [
    'hot_flashes', 'joint_pain', 'muscle_pain', 'fatigue',
    'mood_changes', 'nausea', 'headaches', 'weight_changes',
    'sleep_problems', 'other'
];

const PARTNER_OBSERVATION_TYPES = [
    'noticed_mood_change', 'seemed_tired', 'mentioned_pain',
    'sleep_issues_observed', 'appetite_change', 'low_energy',
    'seemed_uncomfortable', 'other'
];

const PATIENT_NOTES = [
    'Woke up feeling this way',
    'Started after lunch',
    'Worse than yesterday',
    'Took ibuprofen, helped a bit',
    'Happened during work meeting',
    'Better after resting',
    'Lasted about 2 hours',
    'Night time episode',
    'Morning was rough',
    'Noticed after taking medication',
    'Exercise seemed to trigger it',
    'Feeling better now',
    'Had to lie down',
    'Drinking more water helped',
    ''
];

const PARTNER_NOTES = [
    'She seemed really uncomfortable today',
    'Noticed she was quieter than usual',
    'Asked if she was okay, she said tired',
    'She went to bed early',
    'Didn\'t want to eat much at dinner',
    'She mentioned her joints hurt',
    'Saw her rubbing her temples',
    'She looked exhausted after work',
    'More irritable than usual',
    'She slept poorly last night',
    'Seemed to feel better after lunch',
    'She was moving slowly this morning',
    ''
];

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomSeverity() {
    // Weight towards middle values (2-4)
    const weights = [1, 2, 3, 3, 3, 4, 4, 4, 5];
    return randomChoice(weights);
}

function generatePatientEntries() {
    const entries = [];
    const now = new Date();

    // Generate entries for past 60 days
    for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
        // 0-3 entries per day
        const entriesPerDay = Math.floor(Math.random() * 3);

        for (let i = 0; i < entriesPerDay; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - daysAgo);
            date.setHours(Math.floor(Math.random() * 14) + 7); // 7am - 9pm
            date.setMinutes(Math.floor(Math.random() * 60));

            entries.push({
                id: generateId(),
                type: randomChoice(SIDE_EFFECT_TYPES),
                severity: randomSeverity(),
                notes: randomChoice(PATIENT_NOTES),
                date: date.toISOString()
            });
        }
    }

    return entries;
}

function generatePartnerObservations() {
    const observations = [];
    const now = new Date();

    // Generate observations for past 60 days (less frequent than patient)
    for (let daysAgo = 60; daysAgo >= 0; daysAgo--) {
        // 0-2 observations per day, ~40% chance of any observation
        if (Math.random() > 0.4) continue;

        const obsPerDay = Math.floor(Math.random() * 2) + 1;

        for (let i = 0; i < obsPerDay; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - daysAgo);
            date.setHours(Math.floor(Math.random() * 6) + 18); // 6pm - midnight (evening observations)
            date.setMinutes(Math.floor(Math.random() * 60));

            observations.push({
                id: generateId(),
                author: 'partner',
                type: randomChoice(PARTNER_OBSERVATION_TYPES),
                severity: randomSeverity(),
                notes: randomChoice(PARTNER_NOTES),
                date: date.toISOString()
            });
        }
    }

    return observations;
}

// Generate data
const patientEntries = generatePatientEntries();
const partnerObservations = generatePartnerObservations();

console.log(`Generated ${patientEntries.length} patient entries`);
console.log(`Generated ${partnerObservations.length} partner observations`);

// Output as JSON that can be loaded into localStorage
const output = {
    patientEntries,
    partnerObservations
};

// Write to a file for reference
fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'test-data.json'),
    JSON.stringify(output, null, 2)
);

// Output JavaScript to paste into browser console
console.log('\n--- Copy this to browser console to load test data ---\n');
console.log(`localStorage.setItem('tamoxifen-entries', '${JSON.stringify(patientEntries)}');`);
console.log(`localStorage.setItem('tamoxifen-partner-observations', '${JSON.stringify(partnerObservations)}');`);
console.log(`location.reload();`);
console.log('\n--- Or run this in the app to auto-load ---');
