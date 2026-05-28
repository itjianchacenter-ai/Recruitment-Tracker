// =====================================================================
// send-email — Supabase Edge Function (Deno)
// Sends email via Microsoft 365 Graph API from the central HR mailbox.
//
// DEPLOY:
//   supabase functions deploy send-email
//
// SET SECRETS (server-side only — never in the browser):
//   supabase secrets set M365_TENANT_ID=...        \
//                        M365_CLIENT_ID=...         \
//                        M365_CLIENT_SECRET=...     \
//                        M365_SENDER_ADDRESS=Hr.jc@jianchatea.com
//
// Entra ID (Azure AD) setup required:
//   App registration → API permissions → Microsoft Graph →
//   APPLICATION permission "Mail.Send" → Grant admin consent.
//   Recommended: limit with an Application Access Policy so this app can
//   only send as Hr.jc@jianchatea.com.
//
// REQUEST BODY (JSON):
//   { to: string[], cc?: string[], subject: string, body: string,
//     html?: boolean, attachments?: { name: string, contentBytes: string }[] }
//   (contentBytes = base64-encoded file content)
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TENANT  = Deno.env.get('M365_TENANT_ID')!;
const CLIENT  = Deno.env.get('M365_CLIENT_ID')!;
const SECRET  = Deno.env.get('M365_CLIENT_SECRET')!;
const SENDER  = Deno.env.get('M365_SENDER_ADDRESS') ?? 'Hr.jc@jianchatea.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getGraphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT,
      client_secret: SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`token error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { to = [], cc = [], subject = '', body = '', html = false, attachments = [] } = await req.json();
    if (!to.length || !subject) {
      return new Response(JSON.stringify({ error: 'to[] and subject are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getGraphToken();

    const message: Record<string, unknown> = {
      subject,
      body: { contentType: html ? 'HTML' : 'Text', content: body },
      toRecipients: to.map((addr: string) => ({ emailAddress: { address: addr } })),
      ccRecipients: cc.map((addr: string) => ({ emailAddress: { address: addr } })),
    };
    if (attachments.length) {
      message.attachments = attachments.map((a: { name: string; contentBytes: string }) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentBytes: a.contentBytes,
      }));
    }

    const send = await fetch(`https://graph.microsoft.com/v1.0/users/${SENDER}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!send.ok) throw new Error(`graph sendMail ${send.status}: ${await send.text()}`);

    return new Response(JSON.stringify({ ok: true, from: SENDER, to, cc }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
