/**
 * マイページの「このアプリについて」を見る。
 *
 *   node tools/test-about.mjs                        手元の書き出し (4173)
 *   node tools/test-about.mjs http://localhost:4180
 *
 * **なぜ入れたか**
 *   画面仕様（docs/03-screen-spec.md S-05）に利用規約・プライバシー
 *   ポリシー・お問い合わせ・バージョンとあるが、無かった。お金を
 *   受け取る以上、掲載先を指す場所が要る。
 *
 * **空の行は出さない**
 *   押しても何も無いリンクは、壊れているのと同じ。掲載先が入って
 *   いない項目は、行ごと出さない。ここが要。
 *
 * 見るのは3つ。
 *   1. 何も入っていないとき、規約類の行が出ないこと（版だけ出る）
 *   2. 入れたとき、その行だけが出て、正しい宛先を指すこと
 *   3. 元に戻して、また消えること
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const conn = connect();

const VERSION = JSON.parse(readFileSync('app/app.json', 'utf8')).expo.version;

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

/** 掲載先を書き換える。service_role で直に触る（管理画面と同じ結果）。 */
const setSite = async (patch) => {
  const r = await fetch(`${conn.url}/rest/v1/site_settings?id=eq.1`, {
    method: 'PATCH',
    headers: { ...conn.svc, Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`site_settings を直せません: ${r.status} ${await r.text()}`);
};

/** 表に無いなら、まだ SQL を当てていない。 */
const tableExists = async () => {
  const r = await fetch(`${conn.url}/rest/v1/site_settings?select=id&limit=1`, {
    headers: conn.svc,
  });
  return r.ok;
};

let browser = null;
let member = null;
let restored = false;

try {
  console.log(`このアプリについての検査: ${BASE}\n`);

  if (!(await tableExists())) {
    check('site_settings がある', false, 'supabase/_pending.sql を先に当ててください');
  } else {
    member = await createMember(conn, 'about');
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
    const page = await ctx.newPage();

    // まず空にしてから始める（前の検査の残りに影響されない）
    await setSite({
      operator_name: null,
      contact_email: null,
      terms_url: null,
      privacy_url: null,
      law_url: null,
    });

    await signInOn(page, BASE, member, { goto: '/mypage' });
    await page.waitForTimeout(2500);

    const text = async () => (await page.locator('body').innerText());

    // --- 1. 空のとき ---------------------------------------------------------
    console.log('--- 掲載先が空のとき ---');
    let body = await text();
    check('見出しは出る', body.includes('このアプリについて'), body.slice(0, 60));
    check('版が出る', body.includes(VERSION), `期待 ${VERSION}`);
    check('利用規約は出さない', !body.includes('利用規約'));
    check('プライバシーポリシーは出さない', !body.includes('プライバシーポリシー'));
    check('特定商取引法は出さない', !body.includes('特定商取引法'));
    check('お問い合わせは出さない', !body.includes('お問い合わせ'));

    // --- 2. 入れたとき -------------------------------------------------------
    console.log('\n--- 掲載先を入れたとき ---');
    await setSite({
      operator_name: '検査用の運営者',
      contact_email: 'about-test@example.com',
      terms_url: 'https://example.com/kn-terms',
      privacy_url: 'https://example.com/kn-privacy',
      // 特定商取引法だけ空のまま。1つだけ欠けても他が出ることを見る。
      law_url: null,
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    body = await text();

    check('利用規約が出る', body.includes('利用規約'));
    check('プライバシーポリシーが出る', body.includes('プライバシーポリシー'));
    check('お問い合わせが出る', body.includes('お問い合わせ'));
    check('メールの宛先が読める', body.includes('about-test@example.com'));
    check('入れていない特定商取引法は出ない', !body.includes('特定商取引法'));

    const href = async (name) =>
      page.getByRole('link', { name }).first().getAttribute('href').catch(() => null);

    check('利用規約の宛先が正しい', (await href('利用規約')) === 'https://example.com/kn-terms', String(await href('利用規約')));
    check(
      'プライバシーポリシーの宛先が正しい',
      (await href('プライバシーポリシー')) === 'https://example.com/kn-privacy',
      String(await href('プライバシーポリシー')),
    );
    check(
      'お問い合わせはメールを開く',
      (await href('お問い合わせ')) === 'mailto:about-test@example.com',
      String(await href('お問い合わせ')),
    );
    check(
      '外の窓で開く',
      (await page.getByRole('link', { name: '利用規約' }).first().getAttribute('target')) === '_blank',
    );

    // --- 3. 戻す -------------------------------------------------------------
    console.log('\n--- 元に戻したとき ---');
    await setSite({
      operator_name: null,
      contact_email: null,
      terms_url: null,
      privacy_url: null,
      law_url: null,
    });
    restored = true;

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    body = await text();
    check('また消える', !body.includes('利用規約') && !body.includes('お問い合わせ'));
    check('版は残る', body.includes(VERSION));
  }
} finally {
  console.log('\n--- 後片付け ---');
  if (!restored) {
    await setSite({
      operator_name: null,
      contact_email: null,
      terms_url: null,
      privacy_url: null,
      law_url: null,
    }).catch(() => {});
  }
  check('掲載先を空へ戻した', true);
  if (member) check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
