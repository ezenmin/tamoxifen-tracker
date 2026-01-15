import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return new Response(JSON.stringify({ error: "Email and code required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Look up the code
    const { data: codeRecord, error: lookupError } = await supabase
      .from("login_codes")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lookupError || !codeRecord) {
      return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark code as used
    await supabase
      .from("login_codes")
      .update({ used: true })
      .eq("id", codeRecord.id);

    // Generate a magic link for this user (this creates the user if needed)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: email.toLowerCase(),
      options: {
        redirectTo: `${supabaseUrl}`,
      },
    });

    if (linkError || !linkData) {
      console.error("Generate link error:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The linkData contains the user and the hashed_token we need
    // We can use verifyOtp with this token on the client side
    // Or we can directly return session data

    // Extract token from the action_link
    const actionLink = linkData.properties?.action_link || "";
    const url = new URL(actionLink);
    const token = url.searchParams.get("token");
    const tokenHash = url.searchParams.get("token_hash"); // v2 uses token_hash

    if (!token && !tokenHash) {
      // Fallback: try to get session directly using admin API
      // Generate a password and set it for the user
      const tempPassword = crypto.randomUUID();

      // Update or create user with password
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        linkData.user.id,
        { password: tempPassword }
      );

      if (updateError) {
        console.error("Update user error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to create session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sign in with the temp password to get session
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: tempPassword,
      });

      if (signInError || !signInData.session) {
        console.error("Sign in error:", signInError);
        return new Response(JSON.stringify({ error: "Failed to sign in" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        expires_in: signInData.session.expires_in,
        user: {
          id: signInData.user?.id,
          email: signInData.user?.email,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return the token for client-side verification
    return new Response(JSON.stringify({
      success: true,
      token: token || tokenHash,
      type: token ? "token" : "token_hash",
      email: email.toLowerCase(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
