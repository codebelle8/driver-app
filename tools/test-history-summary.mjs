/**
 * 操作履歴の「内容」が短く整っているかを確かめる（2026-10-13）。
 *
 *   node tools/test-history-summary.mjs                                       手元（3100）
 *   node tools/test-history-summary.mjs https://admin.kurumayosenavi.com
 *
 * ご指摘「管理画面の細かいところまで全部は要らない。表示を整え、長い文は略す」。
 * 写真の説明のような長い文が表の幅を取り、「操作した人」の見出しや「変更」の
 * 札が縦に折れていた。
 *
 * 見るもの（新しい順に 3 ページ）
 *   1. 「内容」の文は 31 文字以内（30 文字＋「…」）。略したものは、全文がマウスを重ねると出る
 *   2. 長い文が少なくとも 1 件あり、略されている
 *   3. 見出しと「変更」「追加」の札が 1 行に収まる
 *   4. 「対象」に英語の名前（driver_profiles など）が出ていない
 *
 * **検査用の職員を作り、最後に消す**（作ったときの操作履歴も消す）。
 */
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect } from './lib/member.mjs';

const ADMIN = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const SHOTS = new URL('./screenshots/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, SHOTS));
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

let browser = null;
let staff = null;

try {
  console.log(`操作履歴の「内容」の検査: ${ADMIN}\n`);
  const email = `history-summary-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id, email };
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: staff.id, display_name: `略記検査${STAMP}`, role: 'admin' },
  });

  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1920, height: 900 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);

  let longest = 0;
  let abbreviated = 0;
  for (let n = 1; n <= 3; n++) {
    await page.goto(`${ADMIN}/history${n > 1 ? `?page=${n}` : ''}`, { waitUntil: 'networkidle' });
    const rows = await page.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => {
        const td = tr.querySelectorAll('td');
        const main = td[4]?.querySelector('span.font-medium');
        const badge = td[3]?.firstElementChild;
        return {
          what: td[2]?.innerText.trim() ?? '',
          text: main?.textContent ?? '',
          title: main?.getAttribute('title') ?? '',
          badgeH: badge ? badge.getBoundingClientRect().height : 0,
          badgeLine: badge ? parseFloat(getComputedStyle(badge).lineHeight) || 0 : 0,
        };
      }),
    );
    const heads = await page.locator('thead th').evaluateAll((ths) =>
      ths.map((th) => ({ text: th.innerText, h: th.getBoundingClientRect().height })),
    );
    const headH = new Set(heads.map((h) => Math.round(h.h)));

    const tooLong = rows.filter((r) => Array.from(r.text).length > 31);
    check(`[${n}ページ] 「内容」の文はどれも 31 文字以内`, tooLong.length === 0, tooLong.map((r) => r.text).join(' / '));
    const cut = rows.filter((r) => r.text.endsWith('…'));
    abbreviated += cut.length;
    const badTitle = cut.filter((r) => !r.title || Array.from(r.title).length <= 30 || !r.title.startsWith(r.text.slice(0, -1)));
    check(`[${n}ページ] 略した文は、全文がマウスを重ねると出る（${cut.length} 件）`, badTitle.length === 0, JSON.stringify(badTitle));
    for (const r of rows) longest = Math.max(longest, Array.from(r.title).length);

    const tall = rows.filter((r) => r.badgeH > 30);
    check(`[${n}ページ] 「変更」「追加」の札が 1 行に収まる`, tall.length === 0, tall.map((r) => r.badgeH).join(','));
    check(`[${n}ページ] 見出しが 1 行に収まる（高さがそろう）`, headH.size === 1, heads.map((h) => `${h.text}:${h.h}`).join(' / '));
    const raw = rows.filter((r) => /^[a-z_]+$/.test(r.what));
    check(`[${n}ページ] 「対象」に英語の名前が出ない`, raw.length === 0, raw.map((r) => r.what).join(','));

    if (n === 1) await page.screenshot({ path: shot('history-summary-1920.png') });
  }
  check(`長い文（30 文字を超えるもの）が少なくとも 1 件あり、略されている（最長 ${longest} 文字）`, abbreviated > 0);

  /* スマホ幅でも、表だけが横に動き、ページ全体ははみ出さない */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ADMIN}/history`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('[スマホ幅] ページ全体が横にはみ出さない', overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: shot('history-summary-390.png') });
  await ctx.close();
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
