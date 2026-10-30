/**
 * 調査員はアプリを無料で使えるか（2026-10-05）。
 *
 *   node tools/test-surveyor-free.mjs                                     手元（アプリ 4291・管理画面 3100）
 *   node tools/test-surveyor-free.mjs https://app.kurumayosenavi.com https://admin.kurumayosenavi.com
 *
 * 有料化のあとも、管理画面で「調査員」として登録されている方は無料で使える
 * （発注元のご回答 2026-10-04）。調査員を止めれば、無料も外れる。
 *
 * 見るもの（無料期間を切らした状態で）
 *   1. 調査員は締め出されない（探す画面を使える）
 *   2. 設定・お支払いの画面に「無料（調査員）」と出て、料金の選択も振込先も出ない
 *   3. 通常の会員は、これまでどおり締め出される（比べるため）
 *   4. 調査員を止めると、無料が外れて締め出される
 *   5. 管理画面の会員の一覧で「無料（調査員）」と出て、入金の確認の釦が出ない
 *
 * **有料の提供のときの姿で見る。** 試験提供の期間中（2026-10-07〜）は、だれも
 * 締め出されないため、3・4 が確かめられない。検査のあいだだけ試験提供を外し、
 * 最後に必ず戻す。外すと絞られる本物の会員がいるときは、外さずに止める
 * （tools/lib/trial.mjs）。
 *
 * **検査用の職員・会員を作り、最後に消す**（操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';
import { getTrialOpen, setTrialOpen, wouldLockReal } from './lib/trial.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = Date.now();
const PASSWORD = 'Hq7wTz3nRv9xLm';
const PAST = '2026-01-01T00:00:00Z';

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
    headers: { ...conn.svc, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
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

/** 職員を作る（管理画面にもアプリにも、このメールアドレスで入れる） */
async function makeStaff(role) {
  const email = `free-${role}-${STAMP}@kurumayose.invalid`;
  const r = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true },
  });
  const id = r.body?.id;
  if (!id) throw new Error(`職員を作れません: ${JSON.stringify(r.body).slice(0, 160)}`);
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: id, display_name: `無料検査・${role}`, role },
  });
  return { userId: id, email, password: PASSWORD };
}

/** 無料期間を切らす */
const expire = (userId) =>
  sb(`/rest/v1/driver_profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: { trial_ends_at: PAST, status: 'trial' },
  });

/** 探す画面を開き、締め出されたか（設定へ移されたか）を返す */
async function lockedOut(page) {
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.waitForTimeout(1500);
  return page.url().includes('/mypage');
}

let browser = null;
let surveyor = null;
let member = null;
let admin = null;
let trialBefore = null;

try {
  console.log(`調査員の無料の検査: アプリ ${APP} ／ 管理画面 ${ADMIN}\n`);
  trialBefore = await getTrialOpen(conn);
  if (trialBefore) {
    const real = await wouldLockReal(conn);
    if (real > 0) throw new Error(`試験提供を外すと絞られる本物の会員が ${real} 名いるため、検査しない`);
    await setTrialOpen(conn, false);
  }
  surveyor = await makeStaff('surveyor');
  admin = await makeStaff('admin');
  member = await createMember(conn, 'notfree');
  browser = await chromium.launch({ channel: 'msedge' });

  /* =================================================================== */
  console.log('--- アプリ：調査員 ---');
  /* =================================================================== */
  const sCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const sPage = await sCtx.newPage();
  const errors = [];
  sPage.on('pageerror', (e) => errors.push(e.message));
  await signInOn(sPage, APP, surveyor);
  await expire(surveyor.userId);

  check('無料期間を切らしても、調査員は締め出されない', !(await lockedOut(sPage)), sPage.url());

  await sPage.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await sPage.waitForTimeout(3000);
  const mypage = await sPage.locator('body').innerText();
  check('設定に「調査員のため無料でお使いいただけます」と出る', mypage.includes('調査員のため無料でお使いいただけます'),
    mypage.slice(0, 200));
  check('締めた理由（無料期間が終了しました）は出ない', !mypage.includes('無料期間が終了しました'));

  await sPage.goto(`${APP}/plan`, { waitUntil: 'networkidle' });
  await sPage.waitForTimeout(3000);
  const plan = await sPage.locator('body').innerText();
  check('お支払いの画面に「無料（調査員）」と出る', plan.includes('無料（調査員）'), plan.slice(0, 200));
  check('お支払いが要らないことを書いてある', plan.includes('お支払いの手続きは要りません'));
  check('料金の選択を出さない', (await sPage.locator('[role="radiogroup"]').count()) === 0);
  check('振込先を出さない', !plan.includes('お振込先'));
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));

  /* =================================================================== */
  console.log('\n--- アプリ：通常の会員（比べるため） ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await signInOn(page, APP, member);
    await expire(member.userId);
    check('通常の会員は、無料期間が切れると締め出される', await lockedOut(page), page.url());
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 管理画面：会員の一覧 ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
    const page = await ctx.newPage();
    await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', admin.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);

    /* 調査員の行を探す（ページを送りながら） */
    let row = null;
    for (let p = 1; p <= 10 && !row; p++) {
      await page.goto(`${ADMIN}/members${p > 1 ? `?page=${p}` : ''}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const hit = page.locator('tr', { hasText: surveyor.email });
      if (await hit.count()) row = hit.first();
      else if (!(await page.locator('body').innerText()).includes('次へ')) break;
    }
    check('会員の一覧に、調査員の行がある', !!row);
    if (row) {
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      check('「無料（調査員）」と出る', text.includes('無料（調査員）'), text);
      check('期限切れとして扱わない', !text.includes('超過'), text);
      check('入金の確認の釦を出さない', (await row.getByRole('button', { name: '入金を確認した' }).count()) === 0, text);
    }
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 調査員を止める ---');
  /* =================================================================== */
  await sb(`/rest/v1/admin_profiles?user_id=eq.${surveyor.userId}`, {
    method: 'PATCH',
    body: { is_active: false },
  });
  check('止めた調査員は、無料が外れて締め出される', await lockedOut(sPage), sPage.url());
  await sCtx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  /* 試験提供を外したまま終わらせない */
  if (trialBefore !== null && (await getTrialOpen(conn)) !== trialBefore) {
    const back = await setTrialOpen(conn, trialBefore);
    console.log(`  試験提供の期間を元（${trialBefore}）に戻した: ${back ? 'はい' : 'いいえ（要確認）'}`);
  }
  for (const s of [surveyor, admin].filter(Boolean)) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${s.userId}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${s.userId}`, { method: 'DELETE' });
  }
  const gone = await removeMember(conn, member);
  const purged = await purgeAuditLogs(sb, [surveyor?.userId, admin?.userId, member?.userId]);
  console.log(`\n検査用の職員・会員を消した: ${gone ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
