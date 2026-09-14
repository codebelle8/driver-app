import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const NL = String.fromCharCode(10);
const env = {};
for (const l of readFileSync('admin/.env.local', 'utf8').split(NL)) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim(); }
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = 'https://kurumayose-navi-admin.vercel.app', HOST = 'kurumayose-navi-admin.vercel.app';
const A = 'ui-repro@kurumayose.invalid', P = 'Ux5rTn9wQe3zVb';
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const j = async (p) => (await fetch(`${SB}/rest/v1/${p}`, { headers: h })).json();
let aid = null, browser = null, epId = null, before = null;
try {
  const f = (await j("facilities?select=id,name&name=like.*帝国*"))[0];
  const ep = (await j(`entry_points?select=*&facility_id=eq.${f.id}&order=sort_order&limit=1`))[0];
  epId = ep.id; before = ep.approach_text;
  console.log('対象:', f.name, '入口', ep.code, '／ いまの説明:', JSON.stringify(before).slice(0, 50));

  const users = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: h })).json();
  const st = (users.users ?? []).find((x) => x.email === A);
  if (st) await fetch(`${SB}/auth/v1/admin/users/${st.id}`, { method: 'DELETE', headers: h });
  aid = (await (await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email: A, password: P, email_confirm: true }) })).json()).id;
  await fetch(`${SB}/rest/v1/admin_profiles`, { method: 'POST', headers: h, body: JSON.stringify({ user_id: aid, display_name: '再現', role: 'admin' }) });

  browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [画面のエラー]', m.text().slice(0, 160)); });
  page.on('pageerror', (e) => console.log('  [落ちた]', String(e).slice(0, 160)));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', A); await page.fill('input[name="password"]', P);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  await page.goto(`${BASE}/facilities/${f.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const mark = '現地調査前です。';
  const form = page.locator('form:has([name="approach_text"])').first();
  console.log('入口の枠の数:', await page.locator('form:has([name="approach_text"])').count());
  await form.locator('[name="approach_text"]').first().fill(mark);
  const btn = form.locator('button[type="submit"]').filter({ hasText: '保存' });
  console.log('この枠の保存の釦:', JSON.stringify(await btn.allInnerTexts()));
  await btn.first().click();
  await page.waitForTimeout(4000);

  const after = (await j(`entry_points?select=approach_text,updated_at&id=eq.${epId}`))[0];
  console.log('保存後の控え:', JSON.stringify(after.approach_text).slice(0, 60));
  console.log('結果:', after.approach_text === mark ? '**保存できた**' : '**保存できていない**');
  const msg = await form.evaluate((el) => el.innerText.replace(/[ 　]+/g, ' ').split(String.fromCharCode(10)).filter((x) => x.trim()).slice(0, 4).join(' / '));
  console.log('画面:', msg.slice(0, 200));
} finally {
  if (browser) await browser.close();
  if (epId && before !== null) {
    const now = (await j(`entry_points?select=approach_text&id=eq.${epId}`))[0]?.approach_text;
    if (now !== before) {
      await fetch(`${SB}/rest/v1/entry_points?id=eq.${epId}`, { method: 'PATCH', headers: h, body: JSON.stringify({ approach_text: before }) });
      console.log('元へ戻しました');
    } else console.log('変わっていないので、戻す必要なし');
  }
  if (aid) { await fetch(`${SB}/rest/v1/audit_logs?actor_id=eq.${aid}`, { method: 'DELETE', headers: h }); await fetch(`${SB}/rest/v1/admin_profiles?user_id=eq.${aid}`, { method: 'DELETE', headers: h }); await fetch(`${SB}/auth/v1/admin/users/${aid}`, { method: 'DELETE', headers: h }); }
}
