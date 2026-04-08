import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("No autenticado");

    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();
    if (!callerRole) throw new Error("No autorizado");

    const { user_id, display_name, role, password } = await req.json();

    if (!user_id) throw new Error("user_id requerido");

    // Update display name in profiles
    if (display_name) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ display_name })
        .eq("user_id", user_id);
      if (profileError) throw profileError;
    }

    // Update role in user_roles
    if (role) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id);
      if (roleError) throw roleError;
    }

    // Update password if provided
    if (password) {
      const { error: pwError } = await supabase.auth.admin.updateUserById(user_id, { password });
      if (pwError) throw pwError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
