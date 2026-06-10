// =====================================================================
// client-ip — Supabase Edge Function (Deno)
// Returns the caller's real public IP address, read from the request
// headers that Supabase's edge sets (x-forwarded-for / x-real-ip).
//
// WHY: digital signatures need a trustworthy IP for the audit trail
// (IPO-grade compliance). The browser cannot read its own public IP, so
// we bounce a tiny request through the edge and echo the IP back.
//
// DEPLOY:
//   supabase functions deploy client-ip
//
// No secrets. No auth required (it only reveals the caller's own IP).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = (xff.split(',')[0] || '').trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  return new Response(JSON.stringify({ ip }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
