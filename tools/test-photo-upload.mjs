/**
 * 写真の貼り付けが、実機なみの大きさでも通るかを確かめる。
 *
 *   node tools/test-photo-upload.mjs https://kurumayose-navi-admin.vercel.app
 *
 * **なぜ要るか**
 *   「写真の貼り付けが上手く行きませんでした」とご報告をいただいた
 *   （2026-09-14）。調べたところ、**保存の受け口が受け取れる大きさ
 *   （既定 1MB）を超えていた。** いまのスマートフォンの写真は 3〜12MB
 *   あり、超えると「An unexpected response was received from the
 *   server」とだけ出て終わる。何が悪いのか分からない。
 *
 *   ブラウザ側で縮めてから送るようにした（lib/shrink-image.ts）。
 *   **縮まなくなったら、また同じことが起きる。** ここで見張る。
 *
 * **小さい写真と、大きい写真の両方を送る**
 *   小さいほうだけでは、上限に当たらず気づけない。
 *   雑音で作るのは、圧縮が効かず実機の写真に近い大きさになるため。
 *
 * **発注元の施設は触らない。** 下書きの施設を自分で作り、最後に消す。
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const sharp = createRequire(import.meta.url)('./../admin/node_modules/sharp');

const raw = process.argv[2] ?? 'http://localhost:3000';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const HOST = new URL(BASE).hostname;
const NL = String.fromCharCode(10);

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
};

const env = {};
for (const l of readFileSync('admin/.env.local', 'utf8').split(NL)) {
  const t = l.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'ui-photo-check@kurumayose.invalid';
const PASSWORD = 'Cf7jNm4wTr8xQz';
const h = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};
const get = async (p) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { headers: h });
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
};
const send = async (p, { method = 'POST', body, prefer } = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, {
    method,
    headers: { ...h, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
};

/**
 * 写真を作る。
 *
 * 雑音で埋めるのは、圧縮が効かず**実機の写真に近い大きさ**になるため。
 * 単色や図形で作ると数十KBに縮んでしまい、上限に当たらない。
 */
async function makePhoto(px, path) {
  const height = Math.round(px * 0.75);
  const buf = Buffer.allocUnsafe(px * height * 3);
  for (let i = 0; i < buf.length; i += 1) buf[i] = (Math.random() * 256) | 0;
  const jpeg = await sharp(buf, { raw: { width: px, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
  writeFileSync(path, jpeg);
  return jpeg.length;
}

const SMALL = '.photo-check-small.jpg';
const BIG = '.photo-check-big.jpg';

let browser = null;
let adminId = null;
let facilityId = null;

try {
  console.log(`写真の貼り付けの検査: ${BASE}${NL}`);

  const smallSize = await makePhoto(900, SMALL);
  const bigSize = await makePhoto(4200, BIG);
  console.log(
    `  用意  小 ${(smallSize / 1024).toFixed(0)} KB / 大 ${(bigSize / 1024 / 1024).toFixed(2)} MB${NL}`,
  );
  check('実機なみの大きさの写真を用意できた', bigSize > 3 * 1024 * 1024,
    `${(bigSize / 1024 / 1024).toFixed(2)} MB`);

  /* 下書きの施設を作る。下書きならアプリには出ない。 */
  const cat = (await get('categories?select=id&limit=1'))?.[0];
  const fac = await send('facilities', {
    prefer: 'return=representation',
    body: {
      code: `ZZP-${String(Math.floor(1000 + Math.random() * 8999))}`,
      name: '写真の検査用（自動で消えます）',
      name_kana: 'けんさ',
      category_id: cat?.id,
      prefecture: '東京都',
      address_line: '検査町',
      status: 'draft',
      sort_order: 9997,
    },
  });
  facilityId = fac?.[0]?.id ?? null;
  if (!facilityId) throw new Error(`施設を作れません: ${JSON.stringify(fac).slice(0, 200)}`);
  await send('entry_points', {
    body: { facility_id: facilityId, code: 'A', kind: 'dropoff', name: '検査用', sort_order: 1 },
  });

  const users = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: h })).json();
  const stale = (users.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await fetch(`${SB}/auth/v1/admin/users/${stale.id}`, { method: 'DELETE', headers: h });
  adminId = (await (await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  })).json()).id;
  await send('admin_profiles', {
    body: { user_id: adminId, display_name: '写真の検査', role: 'admin' },
  });

  browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  const page = await ctx.newPage();

  /* 画面が落ちたら、それも記録する。写真の失敗はここに出ていた。 */
  const crashes = [];
  page.on('pageerror', (e) => crashes.push(String(e).slice(0, 140)));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });

  /*
    この施設に紐づく写真の数。

    **入口に付けた写真は facility_id を持たない。** 施設の欄だけを
    数えると常に0になる。入口の id も集めて数える。
  */
  const countPhotos = async () => {
    const eps = (await get(`entry_points?select=id&facility_id=eq.${facilityId}`)) ?? [];
    const ids = eps.map((e) => e.id);
    const mine = ((await get(`photos?select=id&facility_id=eq.${facilityId}`)) ?? []).length;
    if (ids.length === 0) return mine;
    const onEntries =
      ((await get(`photos?select=id&entry_point_id=in.(${ids.join(',')})`)) ?? []).length;
    return mine + onEntries;
  };

  for (const [label, path, want] of [
    ['小さい写真', SMALL, 1],
    ['大きい写真（実機なみ）', BIG, 2],
  ]) {
    crashes.length = 0;
    await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    /* 追加の枠だけを狙う。差し替えの枠にも file の入力がある。 */
    const form = page.locator('form:has(select[name="kind"]):has(input[type="file"])').first();
    await form.locator('input[type="file"]').first().setInputFiles(path);
    await page.waitForTimeout(1500);

    const sending = await form.locator('input[type="file"]').first().evaluate((el) => {
      const f = el.files?.[0];
      return f ? Math.round(f.size / 1024) : null;
    });
    if (label.startsWith('大きい')) {
      check(
        `送る前にブラウザの中で縮んでいる（${(bigSize / 1024).toFixed(0)} KB → ${sending} KB）`,
        typeof sending === 'number' && sending < bigSize / 1024 / 2,
        `${sending} KB`,
      );
    }

    await form.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(12000);

    const n = await countPhotos();
    check(`${label}を貼り付けられる`, n === want, `登録 ${n} 枚（${want} 枚のはず）`);
    check(`${label}で画面が落ちない`, crashes.length === 0, crashes.join(' / '));
  }
} finally {
  console.log(`${NL}--- 後片付け ---`);
  if (browser) await browser.close();
  for (const f of [SMALL, BIG]) {
    try { unlinkSync(f); } catch { /* 無ければよい */ }
  }
  /*
    消す前に、ぶら下がっている行の id を控える。
    施設を消すと入口も写真も一緒に消え、そのたびに記録が1件ずつ増える。
    id を知らないと、あとで拾えない。
  */
  const touched = [facilityId, adminId].filter(Boolean);
  if (facilityId) {
    for (const table of ['entry_points', 'photos']) {
      const kids = await get(`${table}?select=id&facility_id=eq.${facilityId}`);
      for (const k of Array.isArray(kids) ? kids : []) touched.push(k.id);
    }
    await send(`entry_points?facility_id=eq.${facilityId}`, { method: 'DELETE' });
    await send(`facilities?id=eq.${facilityId}`, { method: 'DELETE' });
    const left = await get(`facilities?select=id&id=eq.${facilityId}`);
    check('検査で作った施設を消した', Array.isArray(left) && left.length === 0);
  }
  if (adminId) {
    await fetch(`${SB}/rest/v1/audit_logs?actor_id=eq.${adminId}`, { method: 'DELETE', headers: h });
    await fetch(`${SB}/rest/v1/admin_profiles?user_id=eq.${adminId}`, { method: 'DELETE', headers: h });
    await fetch(`${SB}/auth/v1/admin/users/${adminId}`, { method: 'DELETE', headers: h });
  }

  /*
    自動で書かれた記録を消す。**いちばん最後。**
    上の削除そのものが、また記録を作るため。
    actor_id で消す方法では、service_role の操作（actor_id が空）が
    残る。触った行の id で消す。
  */
  const goneLogs = await purgeAuditLogs(
    async (path, init = {}) => {
      const r = await fetch(`${SB}${path}`, {
        method: init.method ?? 'GET',
        headers: { ...h, ...(init.prefer ? { Prefer: init.prefer } : {}) },
      });
      const t = await r.text();
      let b = null;
      try {
        b = t ? JSON.parse(t) : null;
      } catch {
        b = t;
      }
      return { ok: r.ok, body: b };
    },
    touched,
  );
  console.log(`  片付け  操作履歴を ${goneLogs} 件消しました`);

  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
