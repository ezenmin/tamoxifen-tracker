import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://ezenmin.github.io",
  "http://localhost:3000",
  "http://localhost:8000",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Supabase Edge Functions are commonly called with both Authorization and apikey headers.
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    // Echo requested headers to satisfy browser preflight checks.
    const requestedHeaders = req.headers.get("access-control-request-headers");
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers": requestedHeaders || corsHeaders["Access-Control-Allow-Headers"],
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authorization required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Debug: check if env vars are set
  if (!supabaseUrl || !anonKey) {
    console.error("Missing env vars:", { supabaseUrl: !!supabaseUrl, anonKey: !!anonKey, serviceRoleKey: !!serviceRoleKey });
    return new Response(JSON.stringify({ error: "Server configuration error", details: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create client with user's token to get their identity
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  // Get the authenticated user
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    console.error("Auth error:", userError?.message || "No user returned");
    return new Response(JSON.stringify({ error: "Invalid token", details: userError?.message || "getUser failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userEmail = user.email?.toLowerCase();
  if (!userEmail) {
    return new Response(JSON.stringify({ error: "User has no email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role to access invites
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Find active invite for this email
  const { data: invite, error: inviteError } = await supabase
    .from("household_invites")
    .select("id, household_id, role")
    .eq("invited_email", userEmail)
    .eq("revoked", false)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (inviteError || !invite) {
    return new Response(JSON.stringify({ error: "No active invite found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if already a member
  const { data: existingMembership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("household_id", invite.household_id)
    .eq("user_id", user.id)
    .single();

  if (!existingMembership) {
    // Add user to household_members
    const { error: memberError } = await supabase
      .from("household_members")
      .insert({
        household_id: invite.household_id,
        user_id: user.id,
        role: invite.role || "partner",
      });

    if (memberError) {
      console.error("Member insert error:", memberError);
      return new Response(JSON.stringify({ error: "Failed to join household" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Mark invite as accepted
  await supabase
    .from("household_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
    })
    .eq("id", invite.id);

  return new Response(JSON.stringify({
    success: true,
    household_id: invite.household_id,
    role: invite.role || "partner",
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
