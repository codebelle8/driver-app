/**
 * 検査用の会員を作って、片付けるところまで。
 *
 * **なぜ共通にするか**
 *   起動時にログインを求める作りへ変えたため、どの検査も先にログインが
 *   要るようになった。同じ手順を検査ごとに書くと、片方だけ直る。
 *
 * **後片付けまでが検査**
 *   発注元の本番に、検査で作った会員を残さない。以前、検査で作った
 *   操作履歴を190件ほど残してしまったことがある。繰り返さない。
 */
import { readFileSync } from 'node:fs';

/** .env から読む。値は画面に出さない。 */
export function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** 接続先と鍵をまとめて用意する */
export function connect() {
  const app = readEnv('app/.env.local');
  const admin = readEnv('admin/.env.local');
  const url = app.EXPO_PUBLIC_SUPABASE_URL;
  const anon = app.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const service = admin.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error('接続先または鍵がありません');

  return {
    url,
    anon,
    svc: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
  };
}

/**
 * 検査用の会員を作る。
 *
 * example.com は規格で予約された、誰にも届かない領域。
 * 万一メールが飛んでも、実在の誰かへは届かない。
 */
export async function createMember({ url, svc }, tag = 'test') {
  const email = `kn-${tag}-${Date.now()}@example.com`;
  const password = `kn-${tag}-password-2026`;

  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await r.json();
  if (!body.id) throw new Error(`会員を作れません: ${JSON.stringify(body).slice(0, 160)}`);
  return { userId: body.id, email, password };
}

/** 作った会員を消す。残っていないことも確かめて返す。 */
export async function removeMember({ url, svc }, member) {
  if (!member?.userId) return true;
  await fetch(`${url}/auth/v1/admin/users/${member.userId}`, { method: 'DELETE', headers: svc });
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: svc });
  const j = await r.json();
  return !(j.users ?? []).some((u) => u.email === member.email);
}

/** 導入映像が出ていたら飛ばす */
export async function skipIntro(page) {
  const s = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
  if (await s.count()) await s.first().click().catch(() => {});
  await page.waitForTimeout(900);
}

/**
 * 起動時の入口からログインする。
 *
 * 起動したときに出る入口は、アカウントの画面と同じ入力を使っている。
 * どちらから入っても同じ手順で通る。
 */
export async function signInOn(page, base, member, { goto = '/' } = {}) {
  await page.goto(`${base}${goto}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);

  const field = page.getByLabel(/メールアドレス|Email address/);
  if ((await field.count()) === 0) return; // すでに入っている

  await field.fill(member.email);
  await page.getByLabel(/^(パスワード|Password)$/).fill(member.password);
  await page.getByRole('button', { name: /^(ログイン|Sign in)$/ }).last().click();
  await page.waitForTimeout(6000);
  await skipIntro(page);
}
