// =====================================================================
// admin-users — Supabase Edge Function (Deno)
// Create / reset-password / delete / list Supabase Auth users for the HR
// recruitment system, so accounts created in the app can LOG IN for real.
//
// WHY an Edge Function: creating an auth user requires the service_role key,
// which must NEVER ship in the browser bundle. This function holds it
// server-side and only lets an authenticated *admin* caller use it.
//
// DEPLOY:
//   supabase functions deploy admin-users
//
// SECRETS: none to set manually. Supabase auto-injects SUPABASE_URL,
//   SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY into every function.
//
// AUTHZ: caller must send their logged-in JWT (the supabase-js client does
//   this automatically via functions.invoke). We verify the token and allow
//   ONLY callers whose app_metadata.role === 'admin' (default-deny). We read
//   app_metadata (admin-only, not user-editable) and deliberately IGNORE
//   user_metadata here — user_metadata can be self-set via auth.updateUser(),
//   so trusting it for authz would let a 'user' self-promote to admin.
//
// REQUEST BODY (JSON): { action, ...payload }
//   action 'list'            -> { }
//   action 'create'          -> { email, password, name?, dept?, role? }
//   action 'reset-password'  -> { id?|email?, password }
//   action 'delete'          -> { id?|email? }
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// resolve an auth user id from an email (small teams: scan first 200)
async function findIdByEmail(admin: SupabaseClient, email: string): Promise<string | undefined> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = data.users.find((x) => (x.email ?? '').toLowerCase() === email.toLowerCase());
  return u?.id;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1) verify caller token + admin role
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'unauthorized (no token)' }, 401);

    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: 'unauthorized (invalid token)' }, 401);

    // Read app_metadata ONLY (not user_metadata — see AUTHZ note above).
    // Default-deny: missing/any-non-'admin' role is rejected.
    const callerRole = user.app_metadata?.role as string | undefined;
    if (callerRole !== 'admin') return json({ error: 'forbidden (admin only)' }, 403);

    // 2) service-role client for the privileged work
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, ...p } = await req.json();

    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      const users = data.users.map((u) => ({
        id: u.id,
        email: u.email,
        name: (u.user_metadata?.name as string) ?? '',
        dept: (u.user_metadata?.dept as string) ?? '',
        role: ((u.app_metadata?.role ?? u.user_metadata?.role) === 'user') ? 'user' : 'admin',
        hasPassword: true,
        created_at: u.created_at,
      }));
      return json({ users });
    }

    if (action === 'create') {
      const { email, password, name = '', dept = '', role = 'user' } = p;
      if (!email || !password) return json({ error: 'email + password required' }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // auto-confirm: usable immediately, no email link
        user_metadata: { name, dept },
        app_metadata: { role: role === 'admin' ? 'admin' : 'user' },
      });
      if (error) throw error;
      return json({ ok: true, id: data.user?.id, email });
    }

    if (action === 'reset-password') {
      let { id, email, password } = p;
      if (!password) return json({ error: 'password required' }, 400);
      if (!id && email) id = await findIdByEmail(admin, email);
      if (!id) return json({ error: 'user not found' }, 404);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw error;
      return json({ ok: true, id });
    }

    if (action === 'delete') {
      let { id, email } = p;
      if (!id && email) id = await findIdByEmail(admin, email);
      if (!id) return json({ error: 'user not found' }, 404);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      return json({ ok: true, id });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
