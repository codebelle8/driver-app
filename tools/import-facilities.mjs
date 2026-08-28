/**
 * 入力シート（CSV）から施設・進入口・注意事項を本番 Supabase へ取り込む。
 *
 *   node tools/import-facilities.mjs            確認のみ（何も書き込まない）
 *   node tools/import-facilities.mjs --apply    実際に書き込む
 *
 * 既定を「確認のみ」にしている理由:
 *   クライアント様からいただいたシートは表記ゆれや欠損を含むのが普通で、
 *   気づかないまま取り込むと本番のデータが壊れる。まず全件を検査して
 *   問題を一覧で出し、納得してから --apply する流れを強制している。
 *
 * 読み込むファイル:
 *   data/import/01_facilities.csv
 *   data/import/02_entry_points.csv   （無ければ施設のみ取り込む）
 *
 * 書き込みに service_role キーを使う理由:
 *   一括投入は管理者本人の操作であり、RLS を通す必要がない。
 *   このスクリプトは開発者の手元でのみ実行され、ブラウザへは配信されない。
 */
import { existsSync, readFileSync } from 'node:fs';

import { dmsToDecimal, isInJapan } from './dms.mjs';

const APPLY = process.argv.includes('--apply');
const FACILITIES_CSV = 'data/import/01_facilities.csv';
const ENTRY_POINTS_CSV = 'data/import/02_entry_points.csv';

// --- 接続情報 ---------------------------------------------------------------

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
if (!BASE || !KEY) {
  console.error('admin/.env.local に URL / SUPABASE_SERVICE_ROLE_KEY がありません');
  process.exit(1);
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// --- CSV の読み取り ---------------------------------------------------------

/**
 * RFC 4180 準拠の CSV を配列の配列へ。
 * 単純な split(',') では `"1,2,3"` のような引用符付きの値を壊すため自前で解く。
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  // BOM と改行コードのゆれを先に潰す
  const s = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      // 引用符は「項目の先頭」に来たときだけ囲みとして扱う。
      // 項目の途中に現れる " は文字そのもの（度分秒の秒記号 35°40'22.0"N）。
      // ここを区別しないと、クライアント様の座標表記でCSV全体がずれる。
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 見出し行を鍵にした連想配列の配列にする。空行は捨てる。 */
function readSheet(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r, index) => {
      const obj = { __line: index + 2 };
      header.forEach((h, i) => {
        obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
}

// --- 表記の対応表 -----------------------------------------------------------

const CATEGORY_BY_LABEL = {
  ホテル: 'hotel',
  レジデンス: 'residence',
  商業施設: 'commercial',
  オフィスビル: 'office',
  オフィス: 'office',
  病院: 'hospital',
  '駅・空港': 'station',
  駅: 'station',
  空港: 'station',
};

const KIND_BY_LABEL = {
  車寄せ: 'dropoff',
  エントランス: 'entrance',
  駐車場入口: 'parking_entrance',
  バス乗降場: 'bus_stop',
  関係者用: 'service',
};

/** 「あり」「可」「はい」などを真偽値へ。空欄は null（未回答）。 */
function toBool(value) {
  const v = value.trim();
  if (v === '') return null;
  if (/^(あり|可|はい|yes|true|○|◯|о)$/i.test(v)) return true;
  if (/^(なし|不可|いいえ|no|false|×|✕|-)$/i.test(v)) return false;
  return null;
}

/** 「17:00」「17時」→ 「17:00:00」。空欄は null。 */
function toTime(value) {
  const v = value.trim();
  if (v === '') return null;
  const m = v.match(/^(\d{1,2})\s*[:：時]\s*(\d{1,2})?/);
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, '0');
  const mm = String(Number(m[2] ?? 0)).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

/** 「1,2,3,4,5」→ [1,2,3,4,5]。空欄は []（全曜日）。 */
function toWeekdays(value) {
  return value
    .split(/[,、\s]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

/** 十進度でも度分秒でも受け取る。 */
function toCoord(value) {
  const v = value.trim();
  if (v === '') return null;
  return dmsToDecimal(v);
}

// --- 検査 -------------------------------------------------------------------

const problems = [];
function problem(where, message) {
  problems.push({ where, message });
}

if (!existsSync(FACILITIES_CSV)) {
  console.error(
    `\n  ${FACILITIES_CSV} がありません。\n` +
      `  data/templates/01_facilities.csv を data/import/ へ複製し、\n` +
      `  クライアント様からいただいた内容を記入してください。\n`,
  );
  process.exit(1);
}

const facilityRows = readSheet(FACILITIES_CSV);
const entryRows = existsSync(ENTRY_POINTS_CSV) ? readSheet(ENTRY_POINTS_CSV) : [];

console.log(`施設シート    ${facilityRows.length} 行`);
console.log(`進入口シート  ${entryRows.length} 行`);
if (!existsSync(ENTRY_POINTS_CSV)) {
  console.log('  （進入口シートは未配置。施設のみ取り込みます）');
}
console.log('');

const categories = await rest('categories?select=id,code,code_prefix');
const categoryByCode = new Map(categories.map((c) => [c.code, c]));

/** 既存施設。同じ施設名があれば新規作成せず更新する。 */
const existing = await rest('facilities?select=id,code,name');
const existingByName = new Map(existing.map((f) => [f.name, f]));
const usedCodes = new Set(existing.map((f) => f.code));

/** 分類ごとの次の連番を決める */
function nextCode(prefix) {
  for (let n = 1; n <= 9999; n++) {
    const code = `${prefix}-${String(n).padStart(4, '0')}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  throw new Error(`${prefix} の採番が上限に達しました`);
}

const facilities = [];
const seenNames = new Set();

for (const row of facilityRows) {
  const where = `施設シート ${row.__line}行目`;
  const name = row['施設名'] ?? '';
  if (!name) {
    problem(where, '施設名が空です');
    continue;
  }
  if (seenNames.has(name)) {
    problem(where, `施設名「${name}」がシート内で重複しています`);
    continue;
  }
  seenNames.add(name);

  const categoryLabel = row['カテゴリ'] ?? '';
  const categoryCode = CATEGORY_BY_LABEL[categoryLabel];
  if (!categoryCode) {
    problem(
      where,
      `${name}: カテゴリ「${categoryLabel || '（空欄）'}」が不明です` +
        `（ホテル / レジデンス / 商業施設 / オフィスビル / 病院 / 駅・空港）`,
    );
    continue;
  }
  const category = categoryByCode.get(categoryCode);

  // 必須項目の欠損。ここが埋まらない行は取り込まない。
  const missing = [];
  if (!row['施設名かな']) missing.push('施設名かな');
  if (!row['都道府県']) missing.push('都道府県');
  if (!row['住所']) missing.push('住所');
  if (missing.length) {
    problem(where, `${name}: ${missing.join(' / ')} が未記入です`);
    continue;
  }

  const known = existingByName.get(name);
  const code = row['施設コード'] || known?.code || nextCode(category.code_prefix);

  facilities.push({
    __where: where,
    __isNew: !known,
    id: known?.id,
    code,
    name,
    name_kana: row['施設名かな'],
    aliases: (row['別名・略称'] ?? '')
      .split(/[;；]/)
      .map((a) => a.trim())
      .filter(Boolean),
    category_id: category.id,
    postal_code: row['郵便番号'] || null,
    prefecture: row['都道府県'],
    city: row['市区町村'] || null,
    address_line: row['住所'],
    summary: row['施設概要'] || null,
    note_internal: row['備考'] || null,
  });
}

// --- 進入口 -----------------------------------------------------------------

const entries = [];
const facilityNames = new Set(facilities.map((f) => f.name));

for (const row of entryRows) {
  const where = `進入口シート ${row.__line}行目`;
  const facilityName = row['施設名'] ?? '';

  if (!facilityNames.has(facilityName) && !existingByName.has(facilityName)) {
    problem(
      where,
      `施設名「${facilityName || '（空欄）'}」が施設シートに見つかりません` +
        `（表記を完全に一致させてください）`,
    );
    continue;
  }

  const code = (row['進入口記号'] ?? '').toUpperCase();
  if (!/^[A-Z]$/.test(code)) {
    problem(where, `${facilityName}: 進入口記号は英大文字1文字にしてください（現在「${row['進入口記号']}」）`);
    continue;
  }

  const kind = KIND_BY_LABEL[row['区分'] ?? ''];
  if (!kind) {
    problem(
      where,
      `${facilityName} ${code}: 区分「${row['区分'] || '（空欄）'}」が不明です` +
        `（車寄せ / エントランス / 駐車場入口 / バス乗降場 / 関係者用）`,
    );
    continue;
  }

  if (!row['名称']) {
    problem(where, `${facilityName} ${code}: 名称が未記入です`);
    continue;
  }

  const navLat = toCoord(row['ナビ緯度'] ?? '');
  const navLng = toCoord(row['ナビ経度'] ?? '');
  if ((navLat === null) !== (navLng === null)) {
    problem(where, `${facilityName} ${code}: ナビ座標が緯度・経度の片方だけです`);
    continue;
  }
  if (navLat !== null && !isInJapan(navLat, navLng)) {
    problem(
      where,
      `${facilityName} ${code}: ナビ座標 ${navLat}, ${navLng} が日本国内ではありません` +
        `（緯度と経度が入れ替わっていませんか）`,
    );
    continue;
  }
  if (navLat === null) {
    // 座標が無くても取り込む。管理画面の地図で後から指定できる。
    problem(`［警告］${where}`, `${facilityName} ${code}: ナビ座標が未記入です（後から地図で指定できます）`);
  }

  const dropLat = toCoord(row['停車位置緯度'] ?? '');
  const dropLng = toCoord(row['停車位置経度'] ?? '');
  if ((dropLat === null) !== (dropLng === null)) {
    problem(where, `${facilityName} ${code}: 停車位置座標が緯度・経度の片方だけです`);
    continue;
  }

  const height = Number(row['高さ制限cm'] ?? '');

  const cautions = [];
  for (const n of [1, 2]) {
    const body = row[`注意事項${n}`] ?? '';
    if (!body) continue;
    const from = toTime(row[`注意${n}_開始時刻`] ?? '');
    const to = toTime(row[`注意${n}_終了時刻`] ?? '');
    if ((from === null) !== (to === null)) {
      problem(where, `${facilityName} ${code}: 注意事項${n} の時刻が開始・終了の片方だけです`);
      continue;
    }
    cautions.push({
      body,
      severity: 'warn',
      time_from: from,
      time_to: to,
      weekdays: toWeekdays(row[`注意${n}_曜日`] ?? ''),
      sort_order: n,
    });
  }

  entries.push({
    __where: where,
    __facilityName: facilityName,
    __cautions: cautions,
    code,
    kind,
    name: row['名称'],
    approach_text: row['進入方法の説明'] || null,
    approach_from: row['進入元の道路・方向'] || null,
    nav_lat: navLat,
    nav_lng: navLng,
    dropoff_lat: dropLat,
    dropoff_lng: dropLng,
    height_limit_cm: Number.isFinite(height) && height > 0 ? height : null,
    is_roofed: toBool(row['屋根'] ?? ''),
    is_24h: toBool(row['24時間'] ?? ''),
    note_internal: row['備考'] || null,
    sort_order: code.charCodeAt(0) - 65,
  });
}

// --- 結果の報告 -------------------------------------------------------------

const blocking = problems.filter((p) => !p.where.startsWith('［警告］'));
const warnings = problems.filter((p) => p.where.startsWith('［警告］'));

if (problems.length) {
  console.log('確認が必要な点:\n');
  for (const p of blocking) console.log(`  取込不可  ${p.where}\n            ${p.message}`);
  for (const p of warnings) console.log(`  警告      ${p.where.replace('［警告］', '')}\n            ${p.message}`);
  console.log('');
}

const newCount = facilities.filter((f) => f.__isNew).length;
console.log(`取り込める施設   ${facilities.length} 件（新規 ${newCount} / 更新 ${facilities.length - newCount}）`);
console.log(`取り込める進入口 ${entries.length} 件`);
if (blocking.length) console.log(`取り込めない行   ${blocking.length} 件`);

if (!APPLY) {
  console.log('\n確認のみで終了しました。書き込むには --apply を付けて実行してください。');
  // process.exit() を使わないのは、fetch の接続が残ったまま強制終了すると
  // Windows で libuv の警告が出るため。終了コードだけ立てて自然に終える。
  process.exitCode = blocking.length ? 1 : 0;
} else if (blocking.length) {
  console.log('\n取り込めない行があるため中止しました。上の指摘を解消してください。');
  process.exitCode = 1;
} else {
  await writeAll();
}

// --- 書き込み ---------------------------------------------------------------

async function writeAll() {
  console.log('\n書き込みます...\n');

  const idByName = new Map(existing.map((f) => [f.name, f.id]));

  for (const f of facilities) {
    const { __where, __isNew, id, ...payload } = f;
    if (id) {
      await rest(`facilities?id=eq.${id}`, { method: 'PATCH', body: payload });
      idByName.set(f.name, id);
      console.log(`  更新  ${payload.code}  ${payload.name}`);
    } else {
      const [created] = await rest('facilities', {
        method: 'POST',
        body: payload,
        prefer: 'return=representation',
      });
      idByName.set(f.name, created.id);
      console.log(`  新規  ${created.code}  ${created.name}`);
    }
  }

  for (const e of entries) {
    const { __where, __facilityName, __cautions, ...payload } = e;
    const facilityId = idByName.get(__facilityName);
    if (!facilityId) continue;

    // (facility_id, code) に一意制約があるため、そこで衝突したら更新する
    const [saved] = await rest('entry_points?on_conflict=facility_id,code', {
      method: 'POST',
      body: { ...payload, facility_id: facilityId },
      prefer: 'resolution=merge-duplicates,return=representation',
    });

    // 注意事項は自然な鍵を持たないため、入れ直す
    await rest(`cautions?entry_point_id=eq.${saved.id}`, { method: 'DELETE' });
    if (__cautions.length) {
      await rest('cautions', {
        method: 'POST',
        body: __cautions.map((c) => ({ ...c, entry_point_id: saved.id })),
      });
    }
    console.log(`  進入口 ${__facilityName} ${payload.code}  ${payload.name}`);
  }

  console.log('\n取り込みが完了しました。');
  console.log('管理画面で内容を確認し、問題なければ公開状態へ切り替えてください。');
}
