import fs from 'node:fs';
export const URL_ = 'https://ixymtbrvtysikhuitfta.supabase.co';
export const KEY = 'sb_publishable_QHMgOMOWHLTPhjW5S07Ryg_WqfaY0aR';
const creds = JSON.parse(fs.readFileSync(new URL('./creds.json', import.meta.url)));
export async function signIn(who) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify(creds[who]) });
  const j = await r.json(); if (!r.ok) throw new Error('signin ' + JSON.stringify(j)); return j;
}
export const rest = async (s, method, path, body, extra = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json', Prefer: 'return=representation', ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
export const fn = async (s, name, body, qs = '') => {
  const r = await fetch(`${URL_}/functions/v1/${name}${qs}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${s?.access_token ?? KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
