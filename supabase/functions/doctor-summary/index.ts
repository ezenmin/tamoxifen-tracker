import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("share") || url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing share token" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Hash the token
  const tokenHash = await sha256Hex(token);

  // Use service role key to bypass RLS (this function is publicly accessible)
  // SUPABASE_URL is auto-injected by Supabase Edge Functions runtime
  // SERVICE_ROLE_KEY is set via supabase secrets set
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Look up share link
  const { data: shareLink, error: shareLinkError } = await supabase
    .from("share_links")
    .select("id, household_id, expires_at, revoked")
    .eq("token_hash", tokenHash)
    .single();

  if (shareLinkError || !shareLink) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired share link" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Check if revoked
  if (shareLink.revoked) {
    return new Response(JSON.stringify({ error: "Share link has been revoked" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if expired
  const expiresAt = new Date(shareLink.expires_at);
  if (expiresAt < new Date()) {
    return new Response(JSON.stringify({ error: "Share link has expired" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update last_accessed_at (best-effort, don't fail if this errors)
  await supabase
    .from("share_links")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", shareLink.id);

  // Query entries for the last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().split("T")[0];

  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select("occurred_at, payload")
    .eq("household_id", shareLink.household_id)
    .gte("occurred_at", startDate)
    .order("occurred_at", { ascending: false });

  if (entriesError) {
    return new Response(JSON.stringify({ error: "Failed to fetch entries" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build summary stats
  const severityCounts: Record<string, number> = {};
  const symptomCounts: Record<string, number> = {};
  let minDate: string | null = null;
  let maxDate: string | null = null;

  // Also build raw entries array for charts (filter out private notes content)
  const rawEntries: Array<Record<string, unknown>> = [];

  for (const entry of entries || []) {
    const date = entry.occurred_at;
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;

    const payload = entry.payload as Record<string, unknown>;

    // Count severity
    if (typeof payload.severity === "number") {
      const sevKey = `severity_${payload.severity}`;
      severityCounts[sevKey] = (severityCounts[sevKey] || 0) + 1;
    }

    // Count symptom types
    if (typeof payload.type === "string") {
      const symptom = payload.type;
      symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
    }

    // Add to raw entries for charts
    const sanitizedEntry: Record<string, unknown> = {
      date: payload.date || date,
      type: payload.type,
      author: payload.author || 'patient',
    };
    if (typeof payload.severity === "number") {
      sanitizedEntry.severity = payload.severity;
    }
    // Include message for exercise and day_note types (doctor needs full context)
    if ((payload.type === 'exercise' || payload.type === 'day_note') && typeof payload.message === "string") {
      sanitizedEntry.message = payload.message;
    }
    rawEntries.push(sanitizedEntry);
  }

  // Sort symptoms by count descending
  const topSymptoms = Object.entries(symptomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symptom, count]) => ({ symptom, count }));

  const summary = {
    date_range: {
      start: minDate,
      end: maxDate,
    },
    total_entries: entries?.length || 0,
    severity_counts: severityCounts,
    top_symptoms: topSymptoms,
    entries: rawEntries, // Raw entries for interactive charts
    generated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
