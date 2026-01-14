/**
 * Tamoxifen Side Effect Tracker - Core Logic
 * All business logic here, UI-agnostic
 */

const SIDE_EFFECT_TYPES = [
    'hot_flashes',
    'joint_pain',
    'muscle_pain',
    'fatigue',
    'mood_changes',
    'nausea',
    'headaches',
    'weight_changes',
    'sleep_problems',
    'other'
];

const PARTNER_OBSERVATION_TYPES = [
    'noticed_mood_change',
    'seemed_tired',
    'mentioned_pain',
    'sleep_issues_observed',
    'appetite_change',
    'low_energy',
    'seemed_uncomfortable',
    'other'
];

const MENSTRUAL_EVENT_TYPES = [
    'period_started',
    'period_ended',
    'spotting'
];

/**
 * Create a new side effect entry
 */
function createEntry(type, severity, notes) {
    if (severity < 1 || severity > 5) {
        throw new Error('Severity must be between 1 and 5');
    }
    
    return {
        id: generateId(),
        type: type,
        severity: severity,
        notes: notes || '',
        date: new Date().toISOString()
    };
}

/**
 * Create a new event entry (no severity required, e.g., menstrual events)
 */
function createEventEntry(type, notes) {
    return {
        id: generateId(),
        type: type,
        event: true,
        notes: notes || '',
        date: new Date().toISOString()
    };
}

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Format entries into a readable summary for doctors
 */
function formatSummary(entries) {
    if (!entries || entries.length === 0) {
        return 'No side effects recorded.';
    }

    // Separate severity-based entries from event entries
    const severityEntries = entries.filter(e => !e.event && e.severity != null);
    const eventEntries = entries.filter(e => e.event === true);

    const lines = ['=== Tamoxifen Side Effect Summary ===', ''];

    // Group severity entries by type
    const byType = {};
    severityEntries.forEach(e => {
        if (!byType[e.type]) byType[e.type] = [];
        byType[e.type].push(e);
    });

    // Generate Executive Summary / Key Findings
    if (severityEntries.length > 0) {
        lines.push('--- KEY FINDINGS ---');
        lines.push('');

        // Find most frequent symptom
        let mostFrequentType = null;
        let maxCount = 0;
        Object.keys(byType).forEach(type => {
            if (byType[type].length > maxCount) {
                maxCount = byType[type].length;
                mostFrequentType = type;
            }
        });

        // Find highest severity symptom (by average)
        let highestSeverityType = null;
        let maxAvgSeverity = 0;
        Object.keys(byType).forEach(type => {
            const avg = byType[type].reduce((sum, e) => sum + e.severity, 0) / byType[type].length;
            if (avg > maxAvgSeverity) {
                maxAvgSeverity = avg;
                highestSeverityType = type;
            }
        });

        // Find worst day/period (day with highest average severity)
        const byDay = {};
        severityEntries.forEach(e => {
            const day = e.date.split('T')[0];
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(e.severity);
        });

        let worstDay = null;
        let worstDayAvg = 0;
        Object.keys(byDay).forEach(day => {
            const avg = byDay[day].reduce((a, b) => a + b, 0) / byDay[day].length;
            if (avg > worstDayAvg) {
                worstDayAvg = avg;
                worstDay = day;
            }
        });

        // Date range
        const dates = severityEntries.map(e => new Date(e.date)).sort((a, b) => a - b);
        const startDate = dates[0].toLocaleDateString();
        const endDate = dates[dates.length - 1].toLocaleDateString();

        if (mostFrequentType) {
            const label = mostFrequentType.replace(/_/g, ' ');
            lines.push(`Most frequent symptom: ${label} (${maxCount} occurrences)`);
        }

        if (highestSeverityType) {
            const label = highestSeverityType.replace(/_/g, ' ');
            lines.push(`Highest severity symptom: ${label} (avg ${maxAvgSeverity.toFixed(1)}/5)`);
        }

        if (worstDay) {
            lines.push(`Worst day recorded: ${worstDay} (avg severity ${worstDayAvg.toFixed(1)}/5)`);
        }

        lines.push(`Reporting period: ${startDate} to ${endDate}`);
        lines.push('');
    }

    lines.push('--- DETAILED BREAKDOWN ---');
    lines.push('');

    // Format each type
    Object.keys(byType).forEach(type => {
        const typeEntries = byType[type];
        const avgSeverity = typeEntries.reduce((sum, e) => sum + e.severity, 0) / typeEntries.length;

        lines.push(`${type.replace(/_/g, ' ').toUpperCase()}`);
        lines.push(`  Occurrences: ${typeEntries.length}`);
        lines.push(`  Avg Severity: ${avgSeverity.toFixed(1)}/5`);
        lines.push('');
    });

    // Add menstrual/bleeding events section if any exist
    const menstrualEvents = eventEntries.filter(e => ['period_started', 'period_ended', 'spotting'].includes(e.type));
    if (menstrualEvents.length > 0) {
        lines.push('--- Menstrual / Bleeding Events ---');
        // Sort by date
        const sorted = menstrualEvents.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        sorted.forEach(e => {
            const dateStr = e.date.split('T')[0];
            const label = e.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            lines.push(`  ${dateStr}: ${label}${e.notes ? ' - ' + e.notes : ''}`);
        });
        lines.push('');
    }

    // Add weight tracking section if any weight entries exist
    const weightEvents = eventEntries.filter(e => e.type === 'weight_changes' && e.notes);
    if (weightEvents.length > 0) {
        lines.push('--- Weight Tracking ---');
        const sorted = weightEvents.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        sorted.forEach(e => {
            const dateStr = e.date.split('T')[0];
            lines.push(`  ${dateStr}: ${e.notes}`);
        });
        lines.push('');
    }

    lines.push(`Total entries: ${entries.length}`);
    lines.push(`Report generated: ${new Date().toLocaleDateString()}`);

    return lines.join('\n');
}

/**
 * Filter entries by date range
 */
function filterByDateRange(entries, startDate, endDate) {
    return entries.filter(e => {
        const date = new Date(e.date);
        return date >= startDate && date <= endDate;
    });
}

/**
 * Filter entries by type
 */
function filterByType(entries, type) {
    return entries.filter(e => e.type === type);
}

/**
 * Create a new partner observation entry
 */
function createPartnerObservation(type, severity, notes) {
    if (severity < 1 || severity > 5) {
        throw new Error('Severity must be between 1 and 5');
    }

    return {
        id: generateId(),
        author: 'partner',
        type: type,
        severity: severity,
        notes: notes || '',
        date: new Date().toISOString()
    };
}

/**
 * Filter entries by author (patient or partner)
 */
function filterByAuthor(entries, author) {
    return entries.filter(e => e.author === author);
}

/**
 * Get chart data for visualization
 * Returns data formatted for bar chart (frequency) and line chart (severity over time)
 */
function getChartData(patientEntries, partnerObservations, days) {
    const now = new Date();
    let startDate = null;

    if (days !== 'all') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - parseInt(days));
    }

    // Filter by date range
    let filteredPatient = patientEntries || [];
    let filteredPartner = partnerObservations || [];

    if (startDate) {
        filteredPatient = filteredPatient.filter(e => new Date(e.date) >= startDate);
        filteredPartner = filteredPartner.filter(e => new Date(e.date) >= startDate);
    }

    // Separate severity entries from event entries
    const severityPatient = filteredPatient.filter(e => !e.event && e.severity != null);
    const eventPatient = filteredPatient.filter(e => e.event === true);

    // Bar chart data: frequency by type (severity entries only)
    const patientByType = {};
    const partnerByType = {};

    severityPatient.forEach(e => {
        patientByType[e.type] = (patientByType[e.type] || 0) + 1;
    });

    filteredPartner.forEach(e => {
        partnerByType[e.type] = (partnerByType[e.type] || 0) + 1;
    });

    // Get all unique types (exclude menstrual event types from bar chart)
    const menstrualTypes = ['period_started', 'period_ended', 'spotting'];
    const allTypes = [...new Set([
        ...Object.keys(patientByType),
        ...Object.keys(partnerByType)
    ])].filter(t => !menstrualTypes.includes(t)).sort();

    const barData = {
        labels: allTypes.map(t => t.replace(/_/g, ' ')),
        patientData: allTypes.map(t => patientByType[t] || 0),
        partnerData: allTypes.map(t => partnerByType[t] || 0)
    };

    // Line chart data: severity over time (grouped by day, severity entries only)
    const patientByDay = {};
    const partnerByDay = {};

    severityPatient.forEach(e => {
        const day = e.date.split('T')[0];
        if (!patientByDay[day]) patientByDay[day] = [];
        patientByDay[day].push(e.severity);
    });

    filteredPartner.forEach(e => {
        const day = e.date.split('T')[0];
        if (!partnerByDay[day]) partnerByDay[day] = [];
        if (e.severity != null) partnerByDay[day].push(e.severity);
    });

    // Get all unique days and sort
    const allDays = [...new Set([
        ...Object.keys(patientByDay),
        ...Object.keys(partnerByDay)
    ])].sort();

    // Collect menstrual event dates for highlighting
    const menstrualDates = new Set();
    eventPatient.forEach(e => {
        if (menstrualTypes.includes(e.type)) {
            menstrualDates.add(e.date.split('T')[0]);
        }
    });

    const lineData = {
        labels: allDays.map(d => {
            const date = new Date(d);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        }),
        rawDates: allDays, // for menstrual highlight matching
        patientData: allDays.map(d => {
            const severities = patientByDay[d];
            if (!severities || severities.length === 0) return null;
            return severities.reduce((a, b) => a + b, 0) / severities.length;
        }),
        partnerData: allDays.map(d => {
            const severities = partnerByDay[d];
            if (!severities || severities.length === 0) return null;
            return severities.reduce((a, b) => a + b, 0) / severities.length;
        })
    };

    return {
        barData,
        lineData,
        totalPatient: filteredPatient.length,
        totalPartner: filteredPartner.length,
        menstrualDates: Array.from(menstrualDates)
    };
}

/**
 * Get top symptoms ranked by highest average severity
 * Excludes event entries (event:true) and menstrual types
 */
function getTopSymptomsByAvgSeverity(entries, days, topN) {
    topN = topN || 3;
    const now = new Date();
    let startDate = null;

    if (days !== 'all') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - parseInt(days));
    }

    // Filter by date range
    let filtered = entries || [];
    if (startDate) {
        filtered = filtered.filter(e => new Date(e.date) >= startDate);
    }

    // Only severity entries, exclude events
    const severityEntries = filtered.filter(e => !e.event && e.severity != null);

    // Exclude menstrual event types
    const menstrualTypes = ['period_started', 'period_ended', 'spotting', 'weight_changes'];
    const symptomEntries = severityEntries.filter(e => !menstrualTypes.includes(e.type));

    // Group by type
    const byType = {};
    symptomEntries.forEach(e => {
        if (!byType[e.type]) byType[e.type] = [];
        byType[e.type].push(e.severity);
    });

    // Calculate avg and count
    const results = Object.keys(byType).map(type => {
        const severities = byType[type];
        const avgSeverity = severities.reduce((a, b) => a + b, 0) / severities.length;
        return {
            type: type,
            avgSeverity: avgSeverity,
            count: severities.length
        };
    });

    // Sort by avgSeverity descending
    results.sort((a, b) => b.avgSeverity - a.avgSeverity);

    return results.slice(0, topN);
}

/**
 * Get symptom trend data for line chart (daily averages per symptom type)
 */
function getSymptomTrendData(entries, days, types) {
    const now = new Date();
    let startDate = null;

    if (days !== 'all') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - parseInt(days));
    }

    // Filter by date range
    let filtered = entries || [];
    if (startDate) {
        filtered = filtered.filter(e => new Date(e.date) >= startDate);
    }

    // Only severity entries
    const severityEntries = filtered.filter(e => !e.event && e.severity != null);

    // Get all unique days
    const allDaysSet = new Set();
    severityEntries.forEach(e => {
        allDaysSet.add(e.date.split('T')[0]);
    });
    const allDays = Array.from(allDaysSet).sort();

    // For each type, build daily averages
    const seriesByType = {};
    types.forEach(type => {
        const entriesOfType = severityEntries.filter(e => e.type === type);

        // Group by day
        const byDay = {};
        entriesOfType.forEach(e => {
            const day = e.date.split('T')[0];
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(e.severity);
        });

        // Map to allDays array
        seriesByType[type] = allDays.map(d => {
            const sev = byDay[d];
            if (!sev || sev.length === 0) return null;
            return sev.reduce((a, b) => a + b, 0) / sev.length;
        });
    });

    // Collect menstrual event dates
    const menstrualTypes = ['period_started', 'period_ended', 'spotting'];
    const eventEntries = filtered.filter(e => e.event === true);
    const menstrualDates = [];
    eventEntries.forEach(e => {
        if (menstrualTypes.includes(e.type)) {
            menstrualDates.push(e.date.split('T')[0]);
        }
    });

    return {
        rawDates: allDays,
        labels: allDays.map(d => {
            const date = new Date(d);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        }),
        seriesByType: seriesByType,
        menstrualDates: menstrualDates
    };
}

// Export for Node.js (tests) and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SIDE_EFFECT_TYPES,
        PARTNER_OBSERVATION_TYPES,
        MENSTRUAL_EVENT_TYPES,
        createEntry,
        createEventEntry,
        createPartnerObservation,
        formatSummary,
        filterByDateRange,
        filterByType,
        filterByAuthor,
        getChartData,
        getTopSymptomsByAvgSeverity,
        getSymptomTrendData
    };
}
