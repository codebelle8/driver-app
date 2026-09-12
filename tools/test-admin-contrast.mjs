/**
 * 管理画面の文字が、地に埋もれていないかを測る。
 *
 *   node tools/test-admin-contrast.mjs                          手元
 *   node tools/test-admin-contrast.mjs https://kurumayose-navi-admin.vercel.app
 *
 * **なぜ要るか**
 *   アプリ側には同じ検査（tools/test-contrast.mjs）があったのに、
 *   **管理画面には一度も当てていなかった。** 配色を替えるたびに
 *   アプリだけを測って「問題なし」としていた。
 *
 *   2026-09-13 に初めて当てたところ、暗い表示の9画面すべてで
 *   読みにくい文字が見つかった（年号・必須の印・状態の札）。
 *   片方だけを測っていると、もう片方は必ず取り残される。
 *
 * **どう測るか**
 *   画面にある文字をすべて拾い、その文字色と、実際に後ろにある地の色
 *   （透けている親をさかのぼって見つける）から WCAG の比を出す。
 *
 *     ふつうの文字 … 4.5:1
 *     大きい文字   … 3.0:1（24px 以上、または太字で 18.66px 以上）
 *
 *   記号は SVG で描かれており、文字としては拾われない。記号の見えかたは
 *   別の決まり（WCAG 1.4.11、3:1）で、ここでは測らない。
 *
 * **使い捨てのアカウントを作って、最後に消す。**
 *   発注元の実アカウントは使わない。操作履歴も消す。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const raw = process.argv[2] ?? 'http://localhost:3000';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const HOST = new URL(BASE).hostname;

const NL = String.fromCharCode(10);

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(NL)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'ui-admin-contrast@kurumayose.invalid';
const PASSWORD = 'Qh7mVt2sXe4bNr';

const sb = async (path, { method = 'GET', body, prefer } = {}) => {
  const r = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { ok: r.ok, body: b };
};

/**
 * 承知のうえで基準を割っているもの。
 *
 * **空にしておくこと。** ここへ足すのは、色そのものを発注元から
 * 指定されていて、調整では届かないと分かっている場合だけにする。
 * 広く網をかけると、新しく壊れたものまで通してしまう。
 *
 * 形式: { 配色: 'dark' | 'light', 文字: 'rgb(r, g, b)', 理由: '…' }
 */
const ALLOWED = [];

let pass = 0;
let knownCount = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(detail);
  }
};

/** 画面の中の、埋もれている文字を数え上げる */
const MEASURE = () => {
  /* rgb(...) / rgba(...) を、正規表現を使わずに読む */
  const parse = (css) => {
    const i = css.indexOf('(');
    if (i < 0) return null;
    const p = css.slice(i + 1, css.indexOf(')')).split(',').map((x) => parseFloat(x));
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  /* 透けている色を、後ろの色へ重ねる */
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const bad = [];
  const seen = new Set();

  for (const el of document.querySelectorAll('*')) {
    /* 自分の直下に文字があるものだけ（親で二重に数えない） */
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .trim();
    if (!own) continue;

    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;

    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;

    /* 透けているもの（出入りの途中）は、一瞬の状態を測ることになる */
    let o = 1;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      o *= Number(getComputedStyle(p).opacity);
    }
    if (o < 0.9) continue;

    const fg = parse(s.color);
    if (!fg || fg.a < 0.5) continue;

    /* 実際に後ろにある地を探す */
    let bg = null;
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0.5) { bg = c; break; }
    }
    if (!bg) continue;

    const size = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;

    const r = ratio(over(fg, bg), bg);
    if (r >= need) continue;

    const key = own.slice(0, 24) + '|' + s.color + '|' + s.backgroundColor;
    if (seen.has(key)) continue;
    seen.add(key);

    bad.push({
      文: own.slice(0, 26),
      比: Number(r.toFixed(2)),
      要: need,
      文字: s.color,
      地: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
    });
  }
  return bad;
};

let browser = null;
let userId = null;

try {
  console.log(`管理画面の文字の読みやすさの検査: ${BASE}${NL}`);

  /* --- 使い捨ての管理者を作る --- */
  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });
  const made = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = made.body?.id;
  if (!userId) {
    throw new Error(`検証用のアカウントを作れません: ${JSON.stringify(made.body).slice(0, 200)}`);
  }
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: 'UI検証用管理者', role: 'admin' },
  });

  /* 施設の詳細も見る。地図の指し先と写真の差し替えはここにしか出ない */
  const one = await sb('/rest/v1/facilities?select=id&limit=1');
  const facilityId = Array.isArray(one.body) && one.body[0] ? one.body[0].id : null;

  const SCREENS = [
    ['ダッシュボード', '/'],
    ['施設一覧', '/facilities'],
    ...(facilityId ? [['施設の詳細', `/facilities/${facilityId}`]] : []),
    ['カテゴリ', '/categories'],
    ['会員', '/members'],
    ['お知らせ', '/push'],
    ['アカウント', '/accounts'],
    ['操作履歴', '/history'],
    ['サイト設定', '/site'],
  ];

  browser = await chromium.launch();

  for (const theme of ['dark', 'light']) {
    console.log(`--- ${theme === 'dark' ? '暗い表示' : '明るい表示'} ---`);
    const ctx = await browser.newContext({
      locale: 'ja-JP',
      viewport: { width: 1280, height: 900 },
    });
    await ctx.addCookies([
      { name: 'kn_theme', value: theme, domain: HOST, path: '/' },
      { name: 'kn_locale', value: 'ja', domain: HOST, path: '/' },
    ]);
    const page = await ctx.newPage();

    const judge = (name, found) => {
      const allowed = found.filter((b) =>
        ALLOWED.some((x) => x.配色 === theme && x.文字 === b.文字),
      );
      const bad = found.filter((b) => !allowed.includes(b));
      knownCount += allowed.length;
      check(
        `${name}${allowed.length ? `（承知のうえ ${allowed.length} 件）` : ''}`,
        bad.length === 0,
        bad
          .map((b) => `        「${b.文}」 ${b.比}:1（要 ${b.要}） 文字 ${b.文字} / 地 ${b.地}`)
          .join(NL),
      );
    };

    /* ログイン画面も測る。ここにも年号と必須の印がある */
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    judge('ログイン', await page.evaluate(MEASURE));

    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });

    for (const [name, path] of SCREENS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800);
      judge(name, await page.evaluate(MEASURE));
    }
    await ctx.close();
  }
} finally {
  console.log(`${NL}--- 後片付け ---`);
  if (browser) await browser.close();
  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const gone = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    const purged = await purgeAuditLogs(sb, [userId]);
    check(`検査で作ったアカウントを消した（操作履歴 ${purged} 件）`, gone.ok);
  }
  if (knownCount > 0) {
    console.log(`${NL}  承知のうえで基準を割っているもの: ${knownCount} 件`);
    for (const x of ALLOWED) console.log(`    ${x.文字}（${x.配色}）… ${x.理由}`);
  }
  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
