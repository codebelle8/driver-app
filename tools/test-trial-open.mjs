/**
 * 試験提供の期間は、無料期間が過ぎても使えることを確かめる（2026-10-07）。
 *
 *   node tools/test-trial-open.mjs                                     手元（アプリ 4291・管理画面 3100）
 *   node tools/test-trial-open.mjs https://kurumayose-navi.vercel.app https://kurumayose-navi-admin.vercel.app
 *
 * ご指示「試験提供の期間なので、無料期間が終わっても使えるように」。
 * 利用規約 第4条第6項に合わせる。
 *
 *   アプリ（試験提供の期間中）
 *     0. 無料期間の途中の方は、これまでどおり「無料期間 残り…」（見え方を変えない）
 *     1. 無料期間が過ぎていても締め出されない
 *     2. 設定に「試験提供の期間中のため、無料でお使いいただけます」
 *     3. お支払いの画面に試験提供の案内。料金の選択を出さない
 *   管理画面
 *     4. サイト設定の「試験提供の期間中」に印が入っている
 *     5. 会員の一覧に「試験提供の期間中のため…」の一行
 *     6. 印を外して保存すると、データベースが外れる。無料期間を過ぎていた方に、
 *        その日から1か月の無料期間が付く（利用規約 第4条第7項。2026-10-12）
 *        → 締め出されず「無料期間 残り…」。保存のお知らせに何名に付けたかが出て、
 *        操作履歴に外した職員と人数が残る
 *     7. その1か月も過ぎれば、締め出される（有料の提供のときの姿）
 *     8. 印を戻して保存すると、データベースが戻る → アプリがまた使える
 *
 * **6〜7 は本番の全体に効く切り替え。** 外すと絞られる本物の会員がいる
 * ときは飛ばす（tools/lib/trial.mjs）。外したら必ず戻す。
 *
 * **検査用の会員・職員を作り、最後に消す**（操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';
import { getTrialOpen, setTrialOpen, wouldLockReal } from './lib/trial.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3100').replace(/\/$/, '');
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

/** 探す画面を開いて、設定の画面へ移されたか（絞られているか） */
async function lockedOn(page) {
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.waitForTimeout(1500);
  return new URL(page.url()).pathname.startsWith('/mypage');
}

let browser = null;
let member = null;
let staff = null;
let before = null;

try {
  console.log(`試験提供の期間の検査: ${APP} / ${ADMIN}\n`);
  before = await getTrialOpen(conn);
  if (before === null) throw new Error('site_settings.trial_open がありません（20261007000001_trial_open.sql の前）');
  check('いまは試験提供の期間中（サイト設定）', before === true, String(before));

  member = await createMember(conn, 'trial');
  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInOn(page, APP, member);
  await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  check('無料期間の途中の方は、これまでどおり「無料期間 残り…」',
    (await page.locator('body').innerText()).includes('無料期間 残り'));
  /* 無料期間（1か月）が過ぎた方にする */
  await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
    method: 'PATCH',
    body: { display_name: `試験提供検査${STAMP}`, trial_ends_at: '2026-01-01T00:00:00Z' },
  });

  check('無料期間が過ぎていても締め出されない', !(await lockedOn(page)), page.url());
  await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const myText = await page.locator('body').innerText();
  check('設定に「試験提供の期間中のため、無料でお使いいただけます」',
    myText.includes('試験提供の期間中のため、無料でお使いいただけます'));
  check('設定に「無料期間は終了しました」を出さない', !myText.includes('無料期間は終了しました'));
  await page.goto(`${APP}/plan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const planText = await page.locator('body').innerText();
  check('お支払いの画面に試験提供の案内', planText.includes('いまは試験提供の期間中のため'));
  check('お支払いの画面に料金の選択を出さない', (await page.locator('[role="radiogroup"]').count()) === 0);

  /* 管理画面 */
  const email = `trial-staff-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id, email };
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: staff.id, display_name: `試験提供検査${STAMP}`, role: 'admin' } });
  const actx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
  await actx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
  const ap = await actx.newPage();
  await ap.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await ap.fill('input[name="email"]', email);
  await ap.fill('input[name="password"]', PASSWORD);
  await ap.click('button[type="submit"]');
  await ap.waitForTimeout(4000);

  await ap.goto(`${ADMIN}/members`, { waitUntil: 'networkidle' });
  check('会員の一覧に「試験提供の期間中のため…」の一行',
    (await ap.locator('body').innerText()).includes('いまは試験提供の期間中のため'));

  await ap.goto(`${ADMIN}/site`, { waitUntil: 'networkidle' });
  const box = ap.locator('input[name="trial_open"]');
  check('サイト設定に「試験提供の期間中」の欄があり、印が入っている',
    (await box.count()) === 1 && (await box.isChecked()));

  const real = await wouldLockReal(conn, [member.userId]);
  if (real > 0) {
    console.log(`  SKIP  外す・戻すの検査（外すと絞られる本物の会員が ${real} 名いるため）`);
  } else {
    await box.uncheck();
    await ap.getByRole('button', { name: '保存', exact: true }).click();
    await ap.waitForTimeout(3000);
    check('印を外して保存すると、試験提供が外れる', (await getTrialOpen(conn)) === false);
    const saved = await ap.locator('body').innerText();
    check('保存のお知らせに「1 名に、今日から1か月の無料期間を付けました」',
      saved.includes('無料期間を過ぎていた 1 名に、今日から1か月の無料期間を付けました'),
      (saved.match(/保存しました[^\n]*/) ?? [''])[0]);
    const prof = (await sb(`/rest/v1/driver_profiles?select=trial_ends_at,status&user_id=eq.${member.userId}`)).body?.[0];
    const days = prof ? (new Date(prof.trial_ends_at).getTime() - Date.now()) / 86_400_000 : 0;
    check('無料期間を過ぎていた方に、その日から1か月の無料期間が付く', days > 27 && days < 32 && prof?.status === 'trial',
      JSON.stringify(prof));
    const log = (await sb(`/rest/v1/audit_logs?select=actor_id,diff&table_name=eq.site_settings&order=id.desc&limit=1`)).body?.[0];
    check('操作履歴に、外した職員と人数が残る',
      log?.actor_id === staff.id && log?.diff?.trial_end_grant?.members === 1, JSON.stringify(log));
    check('外しても、1か月が付いた方は締め出されない', !(await lockedOn(page)), page.url());
    await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    check('「無料期間 残り…」と出る', (await page.locator('body').innerText()).includes('無料期間 残り'));

    /* その1か月も過ぎたら（有料の提供のときの姿） */
    await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
      method: 'PATCH',
      body: { trial_ends_at: '2026-01-01T00:00:00Z' },
    });
    check('その1か月も過ぎれば、締め出される', await lockedOn(page), page.url());

    await ap.goto(`${ADMIN}/site`, { waitUntil: 'networkidle' });
    await ap.locator('input[name="trial_open"]').check();
    await ap.getByRole('button', { name: '保存', exact: true }).click();
    await ap.waitForTimeout(3000);
    check('印を戻して保存すると、試験提供に戻る', (await getTrialOpen(conn)) === true);
    check('戻すと、また使える', !(await lockedOn(page)), page.url());
  }
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await actx.close();
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  /* 外したまま終わらせない */
  if (before !== null && (await getTrialOpen(conn)) !== before) {
    const back = await setTrialOpen(conn, before);
    console.log(`  試験提供の期間を元（${before}）に戻した: ${back ? 'はい' : 'いいえ（要確認）'}`);
  }
  const ids = [];
  if (staff) {
    /* 切り替えの操作履歴（record_id を持たないので、外した職員で消す） */
    await sb(`/rest/v1/audit_logs?table_name=eq.site_settings&actor_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staff.id}`, { method: 'DELETE' });
    ids.push(staff.id);
  }
  let gone = true;
  if (member) {
    gone = await removeMember(conn, member);
    ids.push(member.userId);
  }
  const purged = await purgeAuditLogs(sb, ids);
  console.log(`\n検査用の会員・職員を消した: ${gone ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
