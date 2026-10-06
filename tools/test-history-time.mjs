/**
 * 管理画面の日時が日本時間で出ているかを確かめる（2026-10-07）。
 *
 *   node tools/test-history-time.mjs                                       手元（3100）
 *   node tools/test-history-time.mjs https://kurumayose-navi-admin.vercel.app
 *
 * ご指摘「操作履歴の日時は、どこの時刻か。操作した時点の日本時間にしたい」。
 * 表示を組み立てるサーバー（Vercel）の時刻は協定世界時のため、時刻帯を
 * 指定していない欄は9時間ずれていた。
 *
 * 見るもの
 *   1. 操作履歴のいちばん上の日時が、その記録の日本時間と一致する
 *   2. 欄の見出しに「日本時間」（英語では JST）と出る
 *
 * **検査用の職員を作り、最後に消す**（作ったときの操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect } from './lib/member.mjs';

const ADMIN = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const PASSWORD = 'Hq7wTz3nRv9xLm';

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${conn.url}${path}`, {
    method,
    headers: prefer ? { ...conn.svc, Prefer: prefer } : conn.svc,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: r.ok, status: r.status, body: json };
}

const fmt = (iso, locale, timeZone) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));

let browser = null;
let staff = null;

try {
  console.log(`管理画面の日時の検査: ${ADMIN}\n`);
  const email = `history-time-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id, email };
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: staff.id, display_name: `時刻検査${STAMP}`, role: 'admin' },
  });

  browser = await chromium.launch({ channel: 'msedge' });
  for (const locale of ['ja', 'en']) {
    const ctx = await browser.newContext({ locale: locale === 'ja' ? 'ja-JP' : 'en-GB', viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'kn_locale', value: locale, domain: new URL(ADMIN).hostname, path: '/' }]);
    const page = await ctx.newPage();
    await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    await page.goto(`${ADMIN}/history`, { waitUntil: 'networkidle' });

    /* 画面と同じ並び（id の新しい順）で、いちばん上の記録 */
    const top = (await sb('/rest/v1/audit_logs?select=id,created_at&order=id.desc&limit=1')).body?.[0];
    const shown = (await page.locator('tbody tr').first().locator('td').first().innerText()).trim();
    const jst = fmt(top.created_at, locale, 'Asia/Tokyo');
    const utc = fmt(top.created_at, locale, 'UTC');
    check(`[${locale}] いちばん上の日時が日本時間（${jst}）`, shown === jst, `画面 ${shown} / 日本時間 ${jst} / 協定世界時 ${utc}`);
    const head = await page.locator('thead').innerText();
    check(`[${locale}] 見出しに時刻帯が出る`, locale === 'ja' ? head.includes('日本時間') : head.includes('JST'), head);
    await ctx.close();
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staff.id}`, { method: 'DELETE' });
    const purged = await purgeAuditLogs(sb, [staff.id]);
    console.log(`\n検査用の職員を消した（操作履歴 ${purged} 件）`);
  }
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
