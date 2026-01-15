/**
 * Tamoxifen Side Effect Tracker - Core Logic
 * All business logic here, UI-agnostic
 */

// =============================================================================
// SUPABASE CONFIGURATION
// =============================================================================
const SUPABASE_URL = 'https://mhloxubuifluwvnlrklb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obG94dWJ1aWZsdXd2bmxya2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjE1NDgsImV4cCI6MjA4Mzk5NzU0OH0.LOoDwKQN9HrA38B3_qu0ONYSMz7hJw7Re9xnnkBXNHc';

// Supabase client (initialized if supabase-js is loaded)
let supabaseClient = null;
let currentUser = null;
let currentHouseholdId = null;
let currentUserRole = null; // 'patient' or 'partner'
let isShareMode = false;

function getAppBaseUrl() {
    const origin = window.location.origin;
    const pathname = window.location.pathname;

    // If we're on a file path (e.g., /demo.html), base is the containing directory.
    // If we're on a directory without trailing slash (e.g., /tamoxifen-tracker), treat it as a directory.
    let basePath;
    if (pathname.endsWith('/')) {
        basePath = pathname;
    } else if (pathname.includes('.')) {
        basePath = pathname.slice(0, pathname.lastIndexOf('/') + 1);
    } else {
        basePath = pathname + '/';
    }

    return origin + basePath;
}

// Initialize Supabase client if available
function initSupabase() {
    if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: window.localStorage,
                storageKey: 'tamoxifen-auth'
            }
        });
        return true;
    }
    return false;
}

// =============================================================================
// AUTH FUNCTIONS
// =============================================================================

async function signInWithMagicLink(email) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const redirectTo = getAppBaseUrl();
    const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;
    return { success: true };
}

async function verifyEmailOtp(email, token) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const cleanedToken = String(token || '').trim().replace(/\s+/g, '');
    if (!email) throw new Error('Email is required');
    if (!cleanedToken) throw new Error('Code is required');

    // Supabase supports multiple OTP “types” depending on configuration.
    // Try the common one first, then fall back.
    const attempts = [
        { type: 'email', label: 'email' },
        { type: 'magiclink', label: 'magiclink' }
    ];

    let lastError = null;
    for (const attempt of attempts) {
        // verifyOtp throws in some environments; normalize to { data, error }
        // eslint-disable-next-line no-await-in-loop
        const result = await supabaseClient.auth.verifyOtp({
            email,
            token: cleanedToken,
            type: attempt.type
        }).catch((e) => ({ error: e }));

        const error = result?.error;
        if (!error) {
            return { success: true, session: result?.data?.session || null };
        }
        lastError = error;
    }

    const message = lastError?.message || String(lastError || 'Invalid code');
    throw new Error(message);
}

async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentHouseholdId = null;
    currentUserRole = null;
}

async function getSession() {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
}

function onAuthStateChange(callback) {
    if (!supabaseClient) return { data: { subscription: { unsubscribe: () => {} } } };
    return supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        callback(event, session);
    });
}

// =============================================================================
// HOUSEHOLD FUNCTIONS
// =============================================================================

async function ensureHousehold() {
    if (!supabaseClient || !currentUser) return null;

    // First check if user OWNS a household (they are the patient)
    // This takes priority over membership to ensure patients always see their own data
    const { data: ownedHousehold } = await supabaseClient
        .from('households')
        .select('id')
        .eq('owner_user_id', currentUser.id)
        .single();

    if (ownedHousehold) {
        currentHouseholdId = ownedHousehold.id;
        currentUserRole = 'patient';
        console.log('ensureHousehold: Found owned household', ownedHousehold.id);
        return ownedHousehold.id;
    }

    // If not an owner, check if user is a member (partner)
    const { data: membership } = await supabaseClient
        .from('household_members')
        .select('household_id, role')
        .eq('user_id', currentUser.id)
        .single();

    if (membership) {
        currentHouseholdId = membership.household_id;
        currentUserRole = membership.role || 'partner';
        console.log('ensureHousehold: Found membership', membership.household_id, membership.role);
        return membership.household_id;
    }

    // No household yet - create one (user becomes patient/owner)
    console.log('ensureHousehold: Creating new household for user', currentUser.id);
    const { data: created, error: insertError } = await supabaseClient
        .from('households')
        .insert({ owner_user_id: currentUser.id })
        .select('id')
        .single();

    if (insertError) throw insertError;
    currentHouseholdId = created.id;
    currentUserRole = 'patient';
    return created.id;
}

// =============================================================================
// PARTNER INVITE FUNCTIONS
// =============================================================================

async function createPartnerInvite(partnerEmail) {
    if (!supabaseClient || !currentHouseholdId) throw new Error('Not authenticated');
    if (currentUserRole !== 'patient') throw new Error('Only patient can invite partners');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabaseClient
        .from('household_invites')
        .insert({
            household_id: currentHouseholdId,
            invited_email: partnerEmail.toLowerCase().trim(),
            role: 'partner',
            expires_at: expiresAt.toISOString()
        });

    if (error) throw error;
    return { success: true };
}

// Result object for claimHouseholdInvite
// { success: true, household_id, role } - invite claimed
// { success: false, noInvite: true } - no invite found (not an error)
// { success: false, error: 'message' } - actual error occurred
async function claimHouseholdInvite() {
    if (!supabaseClient || !currentUser) return { success: false, noInvite: true };

    // Call the edge function to claim any pending invite
    const session = await getSession();
    if (!session) return { success: false, noInvite: true };

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/claim-household-invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Supabase Edge Functions typically require apikey header in addition to Authorization.
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (response.status === 404 || response.status === 401) {
            // 404 = No invite found (expected for non-partners)
            // 401 = Auth issue with edge function (treat as no invite, don't block app)
            if (response.status === 401) {
                let details = '';
                try {
                    const errData = await response.json();
                    if (errData && errData.error) details = ` (${errData.error})`;
                } catch (_) {
                    try {
                        const text = await response.text();
                        if (text) details = ` (${text.slice(0, 160)})`;
                    } catch (_) {}
                }
                console.log(`Claim invite: 401 from edge function${details} (treating as no invite)`);
            }
            return { success: false, noInvite: true };
        }

        if (!response.ok) {
            // Actual error (500, CORS, etc.) - still don't block, just log
            let errorMsg = `Server error (${response.status})`;
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (_) {}
            console.error('Claim invite error:', errorMsg);
            // Treat as no invite rather than blocking error
            return { success: false, noInvite: true };
        }

        const data = await response.json();
        if (data.success && data.household_id) {
            currentHouseholdId = data.household_id;
            currentUserRole = data.role || 'partner';
            return { success: true, household_id: data.household_id, role: data.role || 'partner' };
        }

        return { success: false, noInvite: true };
    } catch (e) {
        // Network error, CORS, etc.
        console.error('Claim invite fetch error:', e.message);
        return { success: false, error: e.message || 'Network error' };
    }
}

function getUserRole() {
    return currentUserRole;
}

function getHouseholdId() {
    return currentHouseholdId;
}

function getCurrentUserId() {
    return currentUser?.id || null;
}

// =============================================================================
// HOUSEHOLD MEMBER MANAGEMENT
// =============================================================================

async function getHouseholdMembers() {
    if (!supabaseClient || !currentHouseholdId) return [];
    if (currentUserRole !== 'patient') return []; // Only patient can see members

    const { data, error } = await supabaseClient
        .from('household_members')
        .select('user_id, role, created_at')
        .eq('household_id', currentHouseholdId);

    if (error) {
        console.error('Error fetching household members:', error);
        return [];
    }

    // Get user emails from auth.users via a simple lookup
    // Note: We can't directly query auth.users, but we can get email from invites
    const members = data || [];

    // Try to get emails from accepted invites
    const { data: invites } = await supabaseClient
        .from('household_invites')
        .select('invited_email, accepted_by_user_id')
        .eq('household_id', currentHouseholdId)
        .not('accepted_by_user_id', 'is', null);

    // Map user_id to email
    const emailMap = {};
    (invites || []).forEach(inv => {
        if (inv.accepted_by_user_id) {
            emailMap[inv.accepted_by_user_id] = inv.invited_email;
        }
    });

    return members.map(m => ({
        ...m,
        email: emailMap[m.user_id] || 'Unknown'
    }));
}

async function removePartnerFromHousehold(userId) {
    if (!supabaseClient || !currentHouseholdId) throw new Error('Not authenticated');
    if (currentUserRole !== 'patient') throw new Error('Only patient can remove partners');

    const { error } = await supabaseClient
        .from('household_members')
        .delete()
        .eq('household_id', currentHouseholdId)
        .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
}

/**
 * Fetch pending invites for the current household
 * @returns {Promise<Array>} Array of pending invite objects
 */
async function getPendingInvites() {
    if (!supabaseClient || !currentHouseholdId) return [];
    if (currentUserRole !== 'patient') return []; // Only patient can see invites

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('household_invites')
        .select('id, invited_email, expires_at, created_at')
        .eq('household_id', currentHouseholdId)
        .is('accepted_at', null)
        .or('revoked.is.null,revoked.eq.false')
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching pending invites:', error);
        return [];
    }

    return data || [];
}

/**
 * Revoke a pending invite
 * @param {string} inviteId - The invite ID to revoke
 * @returns {Promise<boolean>} Success status
 */
async function revokeInvite(inviteId) {
    if (!supabaseClient || !currentHouseholdId) throw new Error('Not authenticated');
    if (currentUserRole !== 'patient') throw new Error('Only patient can revoke invites');

    const { error } = await supabaseClient
        .from('household_invites')
        .update({ revoked: true })
        .eq('id', inviteId)
        .eq('household_id', currentHouseholdId); // Extra safety check

    if (error) throw error;
    return true;
}

/**
 * Sync patient/partner display name to Supabase
 * @param {string} role - 'patient' or 'partner'
 * @param {string} displayName - The name to sync
 */
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

/**
 * Fetch names from Supabase and populate localStorage
 */
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

        // Update UI if function exists
        if (typeof updateTabLabels === 'function') updateTabLabels();

    } catch (err) {
        console.error('Failed to fetch names:', err);
    }
}

// =============================================================================
// SYNC FUNCTIONS
// =============================================================================

async function syncEntriesToSupabase(localEntries) {
    if (!supabaseClient || !currentHouseholdId || !currentUser) return;

    // Get remote entries
    const { data: remoteEntries, error } = await supabaseClient
        .from('entries')
        .select('id, payload, created_by_user_id')
        .eq('household_id', currentHouseholdId);

    if (error) throw error;

    // Upsert local entries that don't exist remotely or need updating
    for (const entry of localEntries) {
        const occurredAt = entry.date ? entry.date.split('T')[0] : new Date().toISOString().split('T')[0];

        // Check if entry exists by payload.id
        const existingRemote = (remoteEntries || []).find(r => r.payload?.id === entry.id);

        if (existingRemote) {
            // Only update if this user owns the entry (created_by_user_id matches)
            // If created_by_user_id is null (legacy), allow update by anyone in household
            if (existingRemote.created_by_user_id && existingRemote.created_by_user_id !== currentUser.id) {
                // Skip - can't update other user's entries
                continue;
            }
            await supabaseClient
                .from('entries')
                .update({ payload: entry, occurred_at: occurredAt })
                .eq('id', existingRemote.id);
        } else {
            // Insert new - set created_by_user_id to current user
            await supabaseClient
                .from('entries')
                .insert({
                    household_id: currentHouseholdId,
                    occurred_at: occurredAt,
                    payload: entry,
                    created_by_user_id: currentUser.id
                });
        }
    }
}

async function fetchEntriesFromSupabase() {
    if (!supabaseClient || !currentHouseholdId) {
        console.log('fetchEntriesFromSupabase: No client or household', { hasClient: !!supabaseClient, householdId: currentHouseholdId });
        return [];
    }

    console.log('fetchEntriesFromSupabase: Fetching for household', currentHouseholdId);
    const { data, error } = await supabaseClient
        .from('entries')
        .select('payload, created_by_user_id')
        .eq('household_id', currentHouseholdId)
        .order('occurred_at', { ascending: false });

    if (error) {
        console.error('fetchEntriesFromSupabase: Error', error);
        throw error;
    }

    console.log('fetchEntriesFromSupabase: Found', (data || []).length, 'entries');
    // Include created_by_user_id in the payload so frontend can check ownership
    return (data || []).map(row => ({
        ...row.payload,
        _created_by_user_id: row.created_by_user_id
    }));
}

async function deleteEntryFromSupabase(entryId) {
    if (!supabaseClient || !currentHouseholdId || !currentUser) return;

    // Find the entry by payload.id
    const { data } = await supabaseClient
        .from('entries')
        .select('id, payload, created_by_user_id')
        .eq('household_id', currentHouseholdId);

    const toDelete = (data || []).find(r => r.payload?.id === entryId);
    if (toDelete) {
        // Only delete if user owns the entry (or legacy entry with null created_by_user_id)
        if (toDelete.created_by_user_id && toDelete.created_by_user_id !== currentUser.id) {
            throw new Error('Cannot delete entries created by another user');
        }
        await supabaseClient.from('entries').delete().eq('id', toDelete.id);
    }
}

// Check if current user can edit/delete an entry
function canEditEntry(entry) {
    if (!currentUser) return false;
    // If no _created_by_user_id, it's a legacy entry - allow edit by anyone in household
    if (!entry._created_by_user_id) return true;
    return entry._created_by_user_id === currentUser.id;
}

// =============================================================================
// SHARE LINK FUNCTIONS
// =============================================================================

async function sha256Hex(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSecureToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createDoctorShareLink() {
    if (!supabaseClient || !currentHouseholdId) throw new Error('Not authenticated');

    const token = generateSecureToken();
    const tokenHash = await sha256Hex(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabaseClient
        .from('share_links')
        .insert({
            household_id: currentHouseholdId,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString()
        });

    if (error) throw error;

    // Return the full URL with token (always use the app base URL, not demo.html)
    const baseUrl = getAppBaseUrl();
    return `${baseUrl}?share=${token}`;
}

async function fetchDoctorSummary(token) {
    const functionUrl = `${SUPABASE_URL}/functions/v1/doctor-summary?share=${encodeURIComponent(token)}`;
    const response = await fetch(functionUrl);
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Failed to fetch summary');
    }
    return response.json();
}

// =============================================================================
// SHARE MODE DETECTION
// =============================================================================

function checkShareMode() {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share') || params.get('token');
    if (shareToken) {
        isShareMode = true;
        return shareToken;
    }
    return null;
}

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
 * Create a daily note entry (event-style, no severity)
 */
function createDailyNote(author, notes, dateIso) {
    const entry = createEventEntry('daily_note', notes);
    entry.author = author === 'partner' ? 'partner' : 'patient';
    if (dateIso) entry.date = dateIso;
    return entry;
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
        createDailyNote,
        createPartnerObservation,
        formatSummary,
        filterByDateRange,
        filterByType,
        filterByAuthor,
        getChartData,
        getTopSymptomsByAvgSeverity,
        getSymptomTrendData,
        // Supabase functions (browser only, stubs for Node)
        initSupabase: typeof initSupabase !== 'undefined' ? initSupabase : () => false,
        signInWithMagicLink: typeof signInWithMagicLink !== 'undefined' ? signInWithMagicLink : async () => {},
        verifyEmailOtp: typeof verifyEmailOtp !== 'undefined' ? verifyEmailOtp : async () => {},
        signOut: typeof signOut !== 'undefined' ? signOut : async () => {},
        getSession: typeof getSession !== 'undefined' ? getSession : async () => null,
        onAuthStateChange: typeof onAuthStateChange !== 'undefined' ? onAuthStateChange : () => {},
        ensureHousehold: typeof ensureHousehold !== 'undefined' ? ensureHousehold : async () => null,
        getUserRole: typeof getUserRole !== 'undefined' ? getUserRole : () => null,
        getHouseholdId: typeof getHouseholdId !== 'undefined' ? getHouseholdId : () => null,
        getCurrentUserId: typeof getCurrentUserId !== 'undefined' ? getCurrentUserId : () => null,
        canEditEntry: typeof canEditEntry !== 'undefined' ? canEditEntry : () => true,
        createPartnerInvite: typeof createPartnerInvite !== 'undefined' ? createPartnerInvite : async () => {},
        claimHouseholdInvite: typeof claimHouseholdInvite !== 'undefined' ? claimHouseholdInvite : async () => ({ success: false, noInvite: true }),
        syncEntriesToSupabase: typeof syncEntriesToSupabase !== 'undefined' ? syncEntriesToSupabase : async () => {},
        fetchEntriesFromSupabase: typeof fetchEntriesFromSupabase !== 'undefined' ? fetchEntriesFromSupabase : async () => [],
        deleteEntryFromSupabase: typeof deleteEntryFromSupabase !== 'undefined' ? deleteEntryFromSupabase : async () => {},
        createDoctorShareLink: typeof createDoctorShareLink !== 'undefined' ? createDoctorShareLink : async () => '',
        fetchDoctorSummary: typeof fetchDoctorSummary !== 'undefined' ? fetchDoctorSummary : async () => ({}),
        checkShareMode: typeof checkShareMode !== 'undefined' ? checkShareMode : () => null,
        getHouseholdMembers: typeof getHouseholdMembers !== 'undefined' ? getHouseholdMembers : async () => [],
        removePartnerFromHousehold: typeof removePartnerFromHousehold !== 'undefined' ? removePartnerFromHousehold : async () => {},
        getPendingInvites: typeof getPendingInvites !== 'undefined' ? getPendingInvites : async () => [],
        revokeInvite: typeof revokeInvite !== 'undefined' ? revokeInvite : async () => false,
        syncNameToSupabase: typeof syncNameToSupabase !== 'undefined' ? syncNameToSupabase : async () => {},
        fetchNamesFromSupabase: typeof fetchNamesFromSupabase !== 'undefined' ? fetchNamesFromSupabase : async () => {}
    };
}
