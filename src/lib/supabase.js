import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env.local and fill in your Supabase project values.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } }
});

// ---------- Auth (HR login) -----------------------------------------------
// HR ใช้ username สั้น ๆ (HR01/HR02/HR03) — map เป็นอีเมลภายในเพื่อใช้กับ
// Supabase Auth (email/password). โดเมน @jchr-global.com ไม่ต้องส่งเมลจริง
// (สร้าง user แบบ Auto Confirm ใน Supabase dashboard)
const LOGIN_DOMAIN = 'jchr-global.com';
export function usernameToEmail(u) {
  const s = String(u || '').trim();
  return s.includes('@') ? s.toLowerCase() : `${s.toLowerCase()}@${LOGIN_DOMAIN}`;
}
export function actorFromSession(session) {
  const email = session?.user?.email || '';
  return email ? email.split('@')[0].toUpperCase() : 'HR';
}

// actor used for audit / created_by / updated_by — derived from logged-in user
let _actor = 'HR';
export function getActor() { return _actor; }
supabase.auth.getSession().then(({ data }) => { _actor = actorFromSession(data.session); });
supabase.auth.onAuthStateChange((_event, session) => { _actor = actorFromSession(session); });

export async function signIn(username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username), password
  });
  if (error) throw error;
  _actor = actorFromSession(data.session);
  return data.session;
}
export async function signOut() { await supabase.auth.signOut(); }
export async function getSession() { const { data } = await supabase.auth.getSession(); return data.session; }
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// ---------- CRUD helpers ---------------------------------------------------

export async function listCandidates() {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCandidate(payload) {
  const actor = getActor();
  const { data, error } = await supabase
    .from('candidates')
    .insert({ ...payload, created_by: actor, updated_by: actor })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCandidate(id, patch) {
  const actor = getActor();
  const { data, error } = await supabase
    .from('candidates')
    .update({ ...patch, updated_by: actor })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCandidate(id) {
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Storage (resume / signed docs / pre-boarding uploads) ----------
// Bucket "recruitment" (private). Path convention: {candidateId}/step{n}/{filename}

const BUCKET = 'recruitment';

export async function uploadFile(candidateId, step, file) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${candidateId}/step${step}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name, size: file.size, step, uploadedAt: new Date().toISOString(), uploadedBy: getActor() };
}

export async function getSignedUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

// ---------- Email (Microsoft 365 Graph via Edge Function) ------------------
// Calls the server-side "send-email" function. Secrets (M365 client secret)
// live ONLY in the Edge Function env — never in the browser.
// payload: { to:[], cc?:[], subject, body, attachments?:[{name,path}] }

export async function sendEmail(payload) {
  const { data, error } = await supabase.functions.invoke('send-email', { body: payload });
  if (error) throw error;
  return data;
}

// ---------- Realtime -------------------------------------------------------

export function subscribeCandidates(onChange) {
  const channel = supabase
    .channel('candidates-room')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'candidates' },
      (payload) => onChange(payload)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
