/**
 * 仮画像を作り、施設へ登録する。
 *
 *   node tools/make-placeholder-photos.mjs <施設コード>
 *   node tools/make-placeholder-photos.mjs HTL-0001
 *
 * なぜ要るか:
 *   写真は現地で撮影するもので、開発の段階では揃わない。
 *   何も入っていないと「写真機能が未実装」に見えてしまい、
 *   実際には動いている部分まで疑われる。
 *
 *   仮画像だと一目で分かる見た目にしてある。実写真と紛れて
 *   「差し替え忘れ」が起きないようにするため。
 *   データベース側の is_placeholder にも印を付けるので、
 *   差し替えが必要な写真を後から一覧で抽出できる。
 */
import { readFileSync } from 'node:fs';

import sharp from 'sharp';

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

const FACILITY_CODE = process.argv[2];
if (!FACILITY_CODE) {
  console.error('\n  施設コードを指定してください（例: HTL-0001）\n');
  process.exit(1);
}

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

/** 撮影予定の写真の種類。管理画面の分類と対応している。 */
const PLACEHOLDERS = [
  { kind: 'approach', label: '進入路', caption: '進入路（撮影後に差し替わります）' },
  { kind: 'dropoff', label: '車寄せ', caption: '車寄せ（撮影後に差し替わります）' },
  { kind: 'diagram', label: '進入案内図', caption: '進入案内図（作成後に差し替わります）' },
];

/**
 * 仮画像を作る。
 *
 * 実写真と紛れないよう、斜線と「仮画像」の文字を入れる。
 * 暗い配色にしているのは、アプリが夜間の車内を想定した
 * 暗い画面であり、白い画像だけが浮くのを避けるため。
 */
async function makeImage(label) {
  const width = 1200;
  const height = 800;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="stripe" width="28" height="28"
                 patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="#1d262a"/>
          <rect width="14" height="28" fill="#222c31"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#stripe)"/>
      <rect x="40" y="40" width="${width - 80}" height="${height - 80}"
            fill="none" stroke="#3d4c53" stroke-width="3" stroke-dasharray="16 12"/>
      <text x="50%" y="44%" text-anchor="middle"
            font-family="sans-serif" font-size="86" font-weight="bold" fill="#e8edef">
        ${label}
      </text>
      <text x="50%" y="56%" text-anchor="middle"
            font-family="sans-serif" font-size="40" fill="#9aa8ae">
        仮画像
      </text>
      <text x="50%" y="65%" text-anchor="middle"
            font-family="sans-serif" font-size="30" fill="#6b7a81">
        現地撮影後に差し替わります
      </text>
    </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

// --- 対象を調べる -------------------------------------------------------------

const facility = await rest(
  `/facilities?select=id,code,name&code=eq.${FACILITY_CODE}`,
);
if (!facility.body?.length) {
  console.error(`\n  施設 ${FACILITY_CODE} が見つかりません。\n`);
  process.exit(1);
}
const { id: facilityId, name } = facility.body[0];

const entryPoints = await rest(
  `/entry_points?select=id,code,name&facility_id=eq.${facilityId}&order=sort_order`,
);
if (!entryPoints.body?.length) {
  console.error(`\n  ${name} に入口が登録されていません。\n`);
  process.exit(1);
}

console.log(`${name}（${FACILITY_CODE}）に仮画像を登録します\n`);

let added = 0;
for (const ep of entryPoints.body) {
  for (const [index, spec] of PLACEHOLDERS.entries()) {
    const image = await makeImage(spec.label);
    const path = `${FACILITY_CODE}/${ep.code}/${spec.kind}-placeholder.jpg`;

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

    if (!upload.ok) {
      console.error(`  失敗  ${path} — ${upload.status} ${(await upload.text()).slice(0, 120)}`);
      continue;
    }

    // 同じ写真を二重に登録しないよう、先に消してから入れる
    await rest(`/photos?storage_path=eq.${encodeURIComponent(path)}`, { method: 'DELETE' });

    const row = await rest('/photos', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        entry_point_id: ep.id,
        kind: spec.kind,
        storage_path: path,
        caption: spec.caption,
        is_placeholder: true,
        sort_order: index,
      },
    });

    if (row.ok) {
      added++;
      console.log(`  登録  ${ep.code} ${ep.name} — ${spec.label}（${(image.length / 1024).toFixed(0)}KB）`);
    } else {
      console.error(`  失敗  ${path} — ${JSON.stringify(row.body).slice(0, 140)}`);
    }
  }
}

console.log(`\n${added} 枚を登録しました。`);
console.log('アプリで一覧を下へ引くと反映されます。');
console.log('差し替えが必要な写真は、管理画面で「仮画像」の印が付いています。');
