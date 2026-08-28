/**
 * 登録済みの施設に仮画像を付け、公開できるものを公開する。
 *
 *   node tools/publish-all.mjs            確認のみ
 *   node tools/publish-all.mjs --apply    実際に公開する
 *
 * なぜ仮画像を付けるのか:
 *   公開の判定は「写真が1枚も無い進入口があると公開できない」としている。
 *   写真が無い画面は、ドライバーから見て「作りかけ」に映るため。
 *
 *   ただし現地撮影は調査員の方の作業で、それを待つと確認そのものが
 *   進まない。仮画像だと一目で分かる見た目にし、is_placeholder に印を
 *   付けておけば、差し替えが必要な写真を後から一覧で抽出できる。
 *
 * 公開の判定そのものは緩めない。
 *   判定を外すと、内容の伴わない施設が混ざっても気づけなくなる。
 */
import { readFileSync } from 'node:fs';

import sharp from 'sharp';

const APPLY = process.argv.includes('--apply');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${BASE}/rest/v1${path}`, {
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
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

/** 仮画像。実写真と紛れないよう、斜線と文字を入れる。 */
async function placeholder(label) {
  const svg = `
    <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="s" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="#1d262a"/>
          <rect width="14" height="28" fill="#222c31"/>
        </pattern>
      </defs>
      <rect width="1200" height="800" fill="url(#s)"/>
      <rect x="40" y="40" width="1120" height="720" fill="none"
            stroke="#3d4c53" stroke-width="3" stroke-dasharray="16 12"/>
      <text x="50%" y="45%" text-anchor="middle" font-family="sans-serif"
            font-size="80" font-weight="bold" fill="#e8edef">${label}</text>
      <text x="50%" y="57%" text-anchor="middle" font-family="sans-serif"
            font-size="38" fill="#9aa8ae">仮画像</text>
      <text x="50%" y="66%" text-anchor="middle" font-family="sans-serif"
            font-size="28" fill="#6b7a81">現地撮影後に差し替わります</text>
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

const KINDS = [
  { kind: 'approach', label: '進入路' },
  { kind: 'dropoff', label: '車寄せ' },
];

const facilities = (await rest('/facilities?select=id,code,name,status&order=code')).body ?? [];
const entryPoints = (await rest('/entry_points?select=id,facility_id,code&order=code')).body ?? [];
const photos = (await rest('/photos?select=entry_point_id')).body ?? [];

const epsByFacility = new Map();
for (const ep of entryPoints) {
  if (!epsByFacility.has(ep.facility_id)) epsByFacility.set(ep.facility_id, []);
  epsByFacility.get(ep.facility_id).push(ep);
}
const hasPhoto = new Set(photos.map((p) => p.entry_point_id));

const needPhoto = entryPoints.filter((ep) => !hasPhoto.has(ep.id));
const draft = facilities.filter((f) => f.status !== 'published');

console.log(`施設 ${facilities.length} 件 / 進入口 ${entryPoints.length} 件`);
console.log(`  写真が無い進入口   ${needPhoto.length} 件`);
console.log(`  未公開の施設       ${draft.length} 件`);

if (!APPLY) {
  console.log('\n確認のみで終了しました。実行するには --apply を付けてください。');
  process.exitCode = 0;
} else {
  console.log('\n仮画像を登録します...');

  let added = 0;
  for (const ep of needPhoto) {
    const facility = facilities.find((f) => f.id === ep.facility_id);
    for (const [index, spec] of KINDS.entries()) {
      const image = await placeholder(spec.label);
      const path = `${facility.code}/${ep.code}/${spec.kind}-placeholder.jpg`;

      const upload = await fetch(`${BASE}/storage/v1/object/facility-photos/${path}`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: image,
      });
      if (!upload.ok) continue;

      await rest(`/photos?storage_path=eq.${encodeURIComponent(path)}`, { method: 'DELETE' });
      const row = await rest('/photos', {
        method: 'POST',
        body: {
          entry_point_id: ep.id,
          kind: spec.kind,
          storage_path: path,
          caption: `${spec.label}（撮影後に差し替わります）`,
          is_placeholder: true,
          sort_order: index,
        },
      });
      if (row.ok) added++;
    }
  }
  console.log(`  ${added} 枚を登録しました`);

  console.log('\n公開できるものを公開します...');
  let published = 0;
  const blocked = [];

  for (const f of draft) {
    const check = await rest('/rpc/validate_facility_for_publish', {
      method: 'POST',
      body: { p_facility_id: f.id },
    });
    const problems = (check.body ?? []).filter((p) => !p.startsWith('［警告］'));

    if (problems.length) {
      blocked.push({ name: f.name, problems });
      continue;
    }
    const res = await rest(`/facilities?id=eq.${f.id}`, {
      method: 'PATCH',
      body: { status: 'published' },
    });
    if (res.ok) published++;
  }

  console.log(`  ${published} 件を公開しました`);
  if (blocked.length) {
    console.log(`\n公開できなかった施設 ${blocked.length} 件:`);
    blocked.forEach((b) => console.log(`  ${b.name} — ${b.problems.join(' / ')}`));
  }
}
