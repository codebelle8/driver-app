/**
 * 管理画面が、細い画面で横にはみ出していないかを見る。
 *
 *   node tools/test-admin-sp.mjs                       本番を検査
 *   node tools/test-admin-sp.mjs http://localhost:3000 手元を検査
 *
 * **なぜ要るか**
 *   横へはみ出した画面は「切れている」としか見えない。読めないうえ、
 *   指で横へ送らないと続きが出ない。左の柱を入れた際、本文の側が
 *   縮めるようになっているかを確かめていなかった。
 *
 * **どう見るか**
 *   目で見ない。documentElement の scrollWidth と clientWidth を
 *   比べる。1px でも広ければ、そこに横送りが出ている。
 *   はみ出しているときは、犯人（幅が画面を超えている要素）も出す。
 *
 * 検証用の管理者を1人作り、最後に必ず消す。操作履歴も残さない。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const BASE = (process.argv[2] ?? 'https://kurumayose-navi-admin.vercel.app').replace(/\/$/, '');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = 'ui-sp-check@kurumayose.invalid';
const PASSWORD = 'Rk7vNq2wXe5tGa';

/** 細い順に見る。320px は今も現役の端末（iPhone SE 第1世代）。 */
const WIDTHS = [320, 360, 390];
const PATHS = ['/', '/facilities', '/categories', '/members', '/push', '/accounts', '/history', '/site'];

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
};

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

let userId = null;
let browser = null;

try {
  console.log(`管理画面の細い画面の検査: ${BASE}\n`);

  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = created.body?.id;
  if (!userId) throw new Error(`アカウント作成に失敗: ${JSON.stringify(created.body)}`);

  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: 'UI検証用管理者', role: 'admin' },
  });

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 780 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  check('検証用の管理者で入れた', true);

  /**
   * はみ出しを測る。
   *
   * 併せて犯人も拾う。「はみ出している」だけでは直せない。
   * 画面より広い要素のうち、いちばん外側のものが原因に近い。
   */
  const overflow = () =>
    page.evaluate(() => {
      /*
        外枠が overflow-hidden のため、はみ出しても document は
        広がらない。**切り取られるだけ**で、指で送っても続きは出ない。
        だから scrollWidth ではなく、要素の右端が画面を越えているかを見る。
      */
      const view = document.documentElement.clientWidth;
      const wide = [];
      for (const el of document.querySelectorAll('body *')) {
        /*
          記号（SVG）の中身は数えない。図形は自前の viewBox の中で
          切り取られる決まりで、外へ出ることはない。数えると、
          本当のはみ出しが埋もれる。
        */
        if (el instanceof SVGElement) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= view + 1) continue;

        /*
          横へ送れる箱の中にあるなら、切れていない。

          表は自前の overflow-x-auto の中で送れる作りにしてある。
          そこまで咎めると、直しようのない不合格が並ぶだけになる。
          咎めるのは、**送っても出てこないもの**だけ。
        */
        let reachable = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') {
            reachable = true;
            break;
          }
        }
        if (!reachable) {
          wide.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60),
            right: Math.round(r.right),
            w: Math.round(r.width),
          });
        }
      }
      const over = wide.length ? Math.round(Math.max(...wide.map((w) => w.right)) - view) : 0;
      return { over, wide: wide.slice(0, 4) };
    });

  for (const width of WIDTHS) {
    console.log(`\n--- ${width}px ---`);
    await page.setViewportSize({ width, height: 780 });

    for (const path of PATHS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const { over, wide } = await overflow();
      check(
        `${path} が横にはみ出していない`,
        over <= 0,
        over > 0
          ? `${over}px はみ出し / ${wide.map((w) => `${w.tag}.${w.cls} 右端${w.right}px 幅${w.w}px`).join(' | ')}`
          : '',
      );
    }
  }
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();

  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    check('検証用アカウントを消した', r.ok);
  }

  const purged = await purgeAuditLogs(sb, [userId]);
  console.log(`  削除    検証で残した操作履歴 ${purged} 件`);

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
