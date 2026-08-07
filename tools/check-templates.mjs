/**
 * data/templates 配下の入力シートを検証する。
 *
 *   node tools/check-templates.mjs [施設CSV] [進入口CSV]
 *
 * クライアント様から返送されたシートの検証にもそのまま使う。
 * 管理画面の一括インポート (A-07) は、このロジックをサーバー側に移植して使う。
 */
import { readFileSync } from 'node:fs';

const FACILITIES = process.argv[2] ?? 'data/templates/01_facilities.csv';
const ENTRY_POINTS = process.argv[3] ?? 'data/templates/02_entry_points.csv';

const CATEGORIES = ['ホテル', 'レジデンス', '商業施設', 'オフィスビル', '病院', '駅・空港'];
const KINDS = ['車寄せ', 'エントランス', '駐車場入口', 'バス乗降場', '関係者用'];

const FACILITY_HEADERS = [
  '施設コード', '施設名', '施設名かな', '別名・略称', 'カテゴリ',
  '郵便番号', '都道府県', '市区町村', '住所', '施設概要', '備考',
];
const ENTRY_HEADERS = [
  '施設名', '進入口記号', '区分', '名称', '進入方法の説明', '進入元の道路・方向',
  'ナビ緯度', 'ナビ経度', '停車位置緯度', '停車位置経度', '高さ制限cm', '屋根', '24時間',
  '注意事項1', '注意1_開始時刻', '注意1_終了時刻', '注意1_曜日',
  '注意事項2', '注意2_開始時刻', '注意2_終了時刻', '注意2_曜日', '備考',
];

/** RFC 4180 準拠の最小 CSV パーサ。引用符内のカンマ・改行を正しく扱う。 */
function parseCsv(text) {
  const src = text.replace(/^﻿/, ''); // Excel 用 BOM を除去
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function toRecords(rows, file, expectedHeaders, problems) {
  const [header, ...body] = rows;
  const missing = expectedHeaders.filter((h) => !header.includes(h));
  const extra = header.filter((h) => !expectedHeaders.includes(h));
  if (missing.length) problems.push(`${file}: 見出し行に不足があります → ${missing.join(', ')}`);
  if (extra.length) problems.push(`${file}: 想定外の列があります → ${extra.join(', ')}`);

  return body.map((cells, idx) => {
    const rec = { __line: idx + 2 };
    header.forEach((h, i) => { rec[h] = (cells[i] ?? '').trim(); });
    return rec;
  });
}

const problems = [];
const warnings = [];

const facilities = toRecords(
  parseCsv(readFileSync(FACILITIES, 'utf8')), FACILITIES, FACILITY_HEADERS, problems);
const entries = toRecords(
  parseCsv(readFileSync(ENTRY_POINTS, 'utf8')), ENTRY_POINTS, ENTRY_HEADERS, problems);

// --- 施設シート ---------------------------------------------------------------
const facilityNames = new Set();
for (const f of facilities) {
  const at = `${FACILITIES}:${f.__line}`;
  for (const required of ['施設名', '施設名かな', 'カテゴリ', '都道府県', '住所']) {
    if (!f[required]) problems.push(`${at}: 「${required}」が未入力です`);
  }
  if (f['カテゴリ'] && !CATEGORIES.includes(f['カテゴリ'])) {
    problems.push(`${at}: カテゴリ「${f['カテゴリ']}」は未定義です (${CATEGORIES.join(' / ')})`);
  }
  if (f['施設名']) {
    if (facilityNames.has(f['施設名'])) problems.push(`${at}: 施設名「${f['施設名']}」が重複しています`);
    facilityNames.add(f['施設名']);
  }
  if (f['郵便番号'] && !/^\d{3}-?\d{4}$/.test(f['郵便番号'])) {
    warnings.push(`${at}: 郵便番号の形式が想定と異なります → ${f['郵便番号']}`);
  }
  if (!f['施設概要']) warnings.push(`${at}: 施設概要が未入力です (任意)`);
}

// --- 進入口シート -------------------------------------------------------------
const seenCodes = new Map();
const facilitiesWithEntry = new Set();

const num = (v) => (v === '' ? null : Number(v));
const isTime = (v) => v === '' || /^([01]?\d|2[0-3]):[0-5]\d$/.test(v);

for (const e of entries) {
  const at = `${ENTRY_POINTS}:${e.__line}`;
  for (const required of ['施設名', '進入口記号', '区分', '名称']) {
    if (!e[required]) problems.push(`${at}: 「${required}」が未入力です`);
  }
  if (e['施設名'] && !facilityNames.has(e['施設名'])) {
    problems.push(`${at}: 施設名「${e['施設名']}」が施設シートに存在しません`);
  }
  facilitiesWithEntry.add(e['施設名']);

  if (e['進入口記号'] && !/^[A-Z]$/.test(e['進入口記号'])) {
    problems.push(`${at}: 進入口記号は英大文字1文字にしてください → ${e['進入口記号']}`);
  }
  const key = `${e['施設名']}/${e['進入口記号']}`;
  if (seenCodes.has(key)) {
    problems.push(`${at}: 進入口記号「${e['進入口記号']}」が同一施設内で重複しています`);
  }
  seenCodes.set(key, true);

  if (e['区分'] && !KINDS.includes(e['区分'])) {
    problems.push(`${at}: 区分「${e['区分']}」は未定義です (${KINDS.join(' / ')})`);
  }

  // 座標: 緯度経度は必ず対で入力する。日本国内の範囲かも確認する。
  for (const [latKey, lngKey, label] of [
    ['ナビ緯度', 'ナビ経度', 'ナビ座標'],
    ['停車位置緯度', '停車位置経度', '停車位置座標'],
  ]) {
    const lat = num(e[latKey]);
    const lng = num(e[lngKey]);
    if ((lat === null) !== (lng === null)) {
      problems.push(`${at}: ${label}は緯度と経度を両方入力してください`);
      continue;
    }
    if (lat === null) continue;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      problems.push(`${at}: ${label}が数値ではありません`);
      continue;
    }
    // 日本の陸域はおよそ 北緯20〜46 / 東経122〜154
    if (lat < 20 || lat > 46 || lng < 122 || lng > 154) {
      problems.push(`${at}: ${label}が日本の範囲外です (${lat}, ${lng})。緯度と経度が逆の可能性があります`);
    }
  }
  if (!e['ナビ緯度']) warnings.push(`${at}: ナビ座標が未設定です (公開時に必須)`);
  if (!e['進入方法の説明']) warnings.push(`${at}: 進入方法の説明が未入力です (公開時に必須)`);

  if (e['高さ制限cm'] && !(Number(e['高さ制限cm']) > 0)) {
    problems.push(`${at}: 高さ制限は正の数値で入力してください → ${e['高さ制限cm']}`);
  }
  for (const [k, allowed] of [['屋根', ['', 'あり', 'なし']], ['24時間', ['', '可', '不可']]]) {
    if (!allowed.includes(e[k])) {
      problems.push(`${at}: 「${k}」は ${allowed.filter(Boolean).join(' / ')} で入力してください → ${e[k]}`);
    }
  }

  for (const n of [1, 2]) {
    const body = e[`注意事項${n}`];
    const from = e[`注意${n}_開始時刻`];
    const to = e[`注意${n}_終了時刻`];
    const days = e[`注意${n}_曜日`];
    if (!body && (from || to || days)) {
      problems.push(`${at}: 注意事項${n}の本文が無いのに時間帯・曜日が入力されています`);
    }
    if (!isTime(from)) problems.push(`${at}: 注意${n}_開始時刻の形式が不正です (例 17:00) → ${from}`);
    if (!isTime(to)) problems.push(`${at}: 注意${n}_終了時刻の形式が不正です (例 20:00) → ${to}`);
    if ((from === '') !== (to === '')) {
      problems.push(`${at}: 注意事項${n}の時間帯は開始と終了を両方入力してください`);
    }
    if (days) {
      const parsed = days.split(/[,、]/).map((d) => d.trim());
      if (!parsed.every((d) => /^[1-7]$/.test(d))) {
        problems.push(`${at}: 注意${n}_曜日は 1〜7 のカンマ区切りで入力してください (1=月) → ${days}`);
      }
    }
  }
}

for (const name of facilityNames) {
  if (!facilitiesWithEntry.has(name)) {
    warnings.push(`${FACILITIES}: 施設「${name}」に進入口が1件も登録されていません (公開時に必須)`);
  }
}

// --- 出力 ---------------------------------------------------------------------
console.log(`施設 ${facilities.length} 件 / 進入口 ${entries.length} 件 を検証しました。\n`);

if (warnings.length) {
  console.log(`[警告 ${warnings.length}件] 登録は可能ですが、公開前に解消が必要です。`);
  warnings.forEach((w) => console.log(`  - ${w}`));
  console.log('');
}
if (problems.length) {
  console.error(`[エラー ${problems.length}件] 修正が必要です。`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log('エラーはありません。');
