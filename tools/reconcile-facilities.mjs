/**
 * クライアント様の一覧と、登録済みのデータを突き合わせて直す。
 *
 *   node tools/reconcile-facilities.mjs            違いを出すだけ
 *   node tools/reconcile-facilities.mjs --apply    直す
 *
 * なぜ必要か:
 *   最初にいただいた画像は解像度が低く、座標や施設名を目で読み取った。
 *   その後、拡大した画像をいただいたため、読み違いを洗い出して直す。
 *
 * 下の表がクライアント様の一覧そのままの写しで、これを正とする。
 * 列は  管理番号 | 施設名 | よみ | 車寄せ | 座標1 | 座標2または注記 | 別名
 *   ・施設名はいただいた表記のまま。当方で正式名称へ直さない。
 *     一覧と画面が1対1で対応していないと、確認の際に照合できなくなる。
 *     正式名称は別名に入れるため、検索は従来どおり届く。
 *   ・注記もいただいた文面のまま。当方で言い換えると解釈が混ざる。
 *     「地下駐車場B2Fから27F」を「27階へお上がりください」と書き換えると、
 *     27階が受付なのか通路なのか、原文にない意味を足すことになる。
 */
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

/* いただいた一覧の写し。行の順序も一覧のとおり。 */
const SHEET = `
東京駅・銀座
HTL-0001 | 帝国ホテル東京 | ていこくほてるとうきょう | 有 | 35°40'22.0"N 139°45'27.4"E | 35°40'20.7"N 139°45'33.4"E |
HTL-0002 | ザ・ペニンシュラ東京 | ざぺにんしゅらとうきょう | 有 | 35°40'29.3"N 139°45'36.1"E | 35°40'30.1"N 139°45'37.1"E |
HTL-0008 | ブルガリホテル東京 | ぶるがりほてるとうきょう | 有 | 35°40'42.9"N 139°46'08.3"E | | ブルガリ ホテル 東京
HTL-0003 | マンダリンオリエンタルホテル | まんだりんおりえんたるほてる | 有 | 35°41'14.0"N 139°46'21.4"E | | マンダリン オリエンタル 東京
HTL-0009 | シャングリ・ラ ホテル 東京 | しゃんぐりらほてるとうきょう | 有 | 35°40'54.4"N 139°46'10.9"E | 通路奥から地下へ | シャングリ・ラ 東京
HTL-0010 | フォーシーズンズホテル丸の内 | ふぉーしーずんずほてるまるのうち | 無 | 35°40'40.8"N 139°46'02.5"E | | フォーシーズンズホテル丸の内 東京
HTL-0011 | フォーシーズンズホテル東京大手町 | ふぉーしーずんずほてるとうきょうおおてまち | 有 | 35°41'17.4"N 139°45'49.1"E | |
HTL-0012 | アスコット丸の内東京 | あすこっとまるのうちとうきょう | 有 | 35°41'10.9"N 139°45'47.0"E | |
HTL-0004 | アマン東京 | あまんとうきょう | 有 | 35°41'08.5"N 139°45'57.2"E | |
HTL-0013 | オークウッド プレミアム東京 | おーくうっどぷれみあむとうきょう | 有 | 35°40'56.9"N 139°46'12.8"E | 夜間は地下入口閉鎖の為、1階 | オークウッドプレミア東京
HTL-0014 | パレスホテル東京 | ぱれすほてるとうきょう | 有 | 35°41'07.3"N 139°45'40.6"E | |
HTL-0015 | 東京ステーションホテル | とうきょうすてーしょんほてる | 有 | 35°40'51.1"N 139°45'56.0"E | |
HTL-0016 | 星のや東京 | ほしのやとうきょう | 有 | 35°41'19.7"N 139°45'51.4"E | |
HTL-0017 | 丸ノ内ホテル | まるのうちほてる | 有 | 35°40'59.2"N 139°46'00.3"E | |
HTL-0018 | コートヤード・バイ・マリオット 東京ステーション | こーとやーどばいまりおっととうきょうすてーしょん | 有 | 35°40'40.5"N 139°46'13.1"E | B2F・エレベーターホールから1F | コートヤード・バイ・マリオット東京ステーション
HTL-0019 | 第一ホテル東京 | だいいちほてるとうきょう | 有 | 35°40'07.8"N 139°45'27.4"E | |
HTL-0020 | メルキュール東京日比谷 | めるきゅーるとうきょうひびや | 無 | 35°40'09.6"N 139°45'29.8"E | |
HTL-0021 | ホテルメトロポリタン丸の内 | ほてるめとろぽりたんまるのうち | 有 | 35°41'00.3"N 139°46'08.9"E | 地下駐車場B2Fから27F |
HTL-0022 | 三井ガーデンホテル日本橋プレミア | みついがーでんほてるにほんばしぷれみあ | 無 | 35°41'17.3"N 139°46'23.8"E | |
HTL-0005 | ACホテル・バイ・マリオット 東京 | えーしーほてるばいまりおっととうきょう | 無 | 35°40'06.4"N 139°45'55.6"E | | ACホテル・バイ・マリオット東京銀座
HTL-0023 | エディション銀座 | えでぃしょんぎんざ | 無 | 35°40'21.3"N 139°46'02.8"E | | ザ・エディション銀座
HTL-0024 | レム日比谷 | れむひびや | 無 | 35°40'20.9"N 139°45'34.2"E | |
HTL-0025 | コートヤード・マリオット 銀座東武ホテル | こーとやーどまりおっとぎんざとうぶほてる | 無 | 35°40'05.6"N 139°45'54.6"E | | コートヤード・マリオット銀座東武ホテル
HTL-0026 | アロフト・バイ・マリオット 東京銀座 | あろふとばいまりおっととうきょうぎんざ | 無 | 35°40'08.1"N 139°45'57.1"E | | アロフト・バイ・マリオット東京銀座
HTL-0027 | 三井ガーデンホテル銀座プレミア | みついがーでんほてるぎんざぷれみあ | 無 | 35°40'01.2"N 139°45'45.6"E | |
HTL-0028 | ミマル東京銀座イースト | みまるとうきょうぎんざいーすと | 無 | 35°40'22.8"N 139°46'22.6"E | | MIMARU東京 銀座EAST
HTL-0029 | ハイアット セントリック 銀座東京 | はいあっとせんとりっくぎんざとうきょう | 無 | 35°40'13.7"N 139°45'43.9"E | | ハイアット セントリック 銀座 東京
HTL-0030 | 東京エディション虎ノ門 | とうきょうえでぃしょんとらのもん | 有 | 35°39'54.2"N 139°44'45.9"E | 通路スロープから地下へ |
HTL-0007 | 銀座クレストン | ぎんざくれすとん | 有 | 35°40'01.2"N 139°46'42.0"E | | ホテル銀座クレストン
渋谷
HTL-0006 | 渋谷エクセルホテル東急 | しぶやえくせるほてるとうきゅう | 有 | 35°39'27.3"N 139°41'47.7"E | 通路スロープを上がり、通路一番奥へ |
HTL-0031 | 渋谷東急REIホテル | しぶやとうきゅうれいほてる | 無 | 35°39'36.8"N 139°42'08.0"E | エントランス正面がバス停の為、その前後の停車 |
HTL-0032 | ホテルインディゴ | ほてるいんでぃご | 有 | 35°39'35.5"N 139°41'47.6"E | 通路奥 | ホテルインディゴ東京渋谷
HTL-0033 | 東急ステイ青山プレミア | とうきゅうすていあおやまぷれみあ | 無 | 35°40'07.5"N 139°43'00.0"E | | 東急ステイ渋谷
HTL-0034 | トランクホテル CAT STREET(TRUNK) | とらんくほてるきゃっとすとりーと | 無 | 35°39'51.0"N 139°42'13.3"E | | トランクホテル キャットストリート
HTL-0035 | ハイアット ハウス(Hyatt House) | はいあっとはうす | 有 | 35°39'19.4"N 139°42'11.3"E | 通路奥 | ハイアットハウス東京渋谷
`;

/** 35°40'22.0"N の形を度へ直す */
function dms(text) {
  const n = text.split(/[^0-9.]+/).filter(Boolean).map(Number);
  return n[0] + n[1] / 60 + n[2] / 3600;
}

/** 「35°40'22.0"N 139°45'27.4"E」を2つの数へ */
function pair(text) {
  const half = text.trim().split(/ +/);
  return { lat: dms(half[0]), lng: dms(half[1]) };
}

/** 座標の形をしているか。していなければ注記として扱う。 */
function looksLikeCoords(text) {
  return text.includes('N ') && text.includes('E');
}

const rows = [];
let area = '';
for (const line of SHEET.split('\n')) {
  const s = line.trim();
  if (!s) continue;
  if (!s.includes('|')) {
    area = s;
    continue;
  }
  const col = s.split('|').map((v) => v.trim());
  const second = col[5] ?? '';
  rows.push({
    area,
    code: col[0],
    name: col[1],
    kana: col[2],
    hasDropoff: col[3] === '有',
    coordA: pair(col[4]),
    coordB: looksLikeCoords(second) ? pair(second) : null,
    note: looksLikeCoords(second) ? '' : second,
    alias: col[6] ?? '',
  });
}

// --- 接続 ---------------------------------------------------------------------

const env = {};
for (const l of readFileSync('admin/.env.local', 'utf8').split('\n')) {
  const m = l.match(/^ *([A-Z0-9_]+) *= *(.*) *$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + '/rest/v1' + path, {
    method,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

const facilities = (await rest('/facilities?select=*&order=code')).body ?? [];
const entryPoints = (await rest('/entry_points?select=*&order=code')).body ?? [];

const facByCode = new Map(facilities.map((f) => [f.code, f]));
const epsByFac = new Map();
for (const e of entryPoints) {
  if (!epsByFac.has(e.facility_id)) epsByFac.set(e.facility_id, []);
  epsByFac.get(e.facility_id).push(e);
}

// --- 突き合わせ ---------------------------------------------------------------

/** 座標の差を m で。読み違いの大きさが直感で分かるようにする。 */
function metres(a, b) {
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** 未調査の断り書き。これが入っているものは「注記なし」と同じ扱い。 */
const PLACEHOLDER = '現地調査前です。座標のみ登録されています。到着後の進入方法は追ってお知らせします。';

/*
  進入路が2種類ある施設の呼び名。

  クライアント様のご回答（2026-08-30）:
    「進入路が２種類ある施設はナビポイント２か所座標があります。」

  つまり2つ目の座標は「同じ進入路の別地点」ではなく、
  別の進入路そのものにあたる。乗務員の方はどちらを使うか選ぶことになるため、
  1つ目と2つ目が対等に並ぶ呼び名にする。
*/
function routeName(base, index) {
  return `${base}（進入路 ${index}）`;
}

/** 2つ目の進入路の説明。現地の詳細は未調査。 */
const SECOND_ROUTE_TEXT =
  '進入路が2種類あるうちの2つ目です。現地調査前のため、進入方法は追ってお知らせします。';

const plan = [];
let same = 0;

for (const row of rows) {
  const f = facByCode.get(row.code);
  if (!f) {
    console.error('  該当なし ' + row.code);
    continue;
  }

  const eps = (epsByFac.get(f.id) ?? []).sort((a, b) => a.code.localeCompare(b.code));
  const diffs = [];

  if (f.name !== row.name) diffs.push({ kind: '施設名', now: f.name, next: row.name });
  if (f.name_kana !== row.kana) diffs.push({ kind: 'よみ', now: f.name_kana, next: row.kana });

  const wantKind = row.hasDropoff ? 'dropoff' : 'entrance';
  const baseName = row.hasDropoff ? '車寄せ' : 'エントランス';
  // 進入路が2種類あるときだけ、1つ目にも番号を付けて対等に並べる
  const wantEpName = row.coordB ? routeName(baseName, 1) : baseName;

  const a = eps[0];
  if (a) {
    if (a.kind !== wantKind) {
      diffs.push({
        kind: '車寄せの有無',
        now: a.kind === 'dropoff' ? '車寄せあり' : '車寄せなし',
        next: (row.hasDropoff ? '車寄せあり' : '車寄せなし') + '（一覧は「' + (row.hasDropoff ? '有' : '無') + '」）',
      });
    }
    // 進入口の呼び名も一覧の言い方に揃える。
    // 施設によって「正面車寄せ」「車寄せ」が混ざると、同じものを指しているのか
    // 別のものなのかが読み手に伝わらない。
    if (a.name !== wantEpName) {
      diffs.push({ kind: '進入口の呼び名', now: a.name, next: wantEpName });
    }
    const d = metres({ lat: a.nav_lat, lng: a.nav_lng }, row.coordA);
    if (d > 1) {
      diffs.push({
        kind: '座標1',
        now: a.nav_lat.toFixed(6) + ', ' + a.nav_lng.toFixed(6),
        next:
          row.coordA.lat.toFixed(6) + ', ' + row.coordA.lng.toFixed(6) +
          '  （' + Math.round(d) + 'm ずれていました）',
      });
    }
    const wantNote = row.note || null;
    const nowNote = a.approach_text === PLACEHOLDER ? null : a.approach_text;
    if (wantNote !== nowNote) {
      diffs.push({ kind: '進入路の注記', now: nowNote ?? '（なし）', next: wantNote ?? '（なし）' });
    }
  }

  const b = eps[1];
  if (row.coordB && b) {
    if (b.name !== routeName(baseName, 2)) {
      diffs.push({ kind: '2点目の呼び名', now: b.name, next: routeName(baseName, 2) });
    }
    const d = metres({ lat: b.nav_lat, lng: b.nav_lng }, row.coordB);
    if (d > 1) {
      diffs.push({
        kind: '座標2',
        now: b.nav_lat.toFixed(6) + ', ' + b.nav_lng.toFixed(6),
        next:
          row.coordB.lat.toFixed(6) + ', ' + row.coordB.lng.toFixed(6) +
          '  （' + Math.round(d) + 'm ずれていました）',
      });
    }
  } else if (row.coordB && !b) {
    diffs.push({ kind: '座標2', now: '（未登録）', next: '追加します' });
  } else if (!row.coordB && b) {
    diffs.push({ kind: '座標2', now: '登録あり', next: '一覧に無いため削除します' });
  }

  if (diffs.length === 0) {
    same++;
    continue;
  }
  plan.push({ row, f, eps, diffs, wantKind, wantEpName, baseName });
}

console.log('一覧 ' + rows.length + ' 件を突き合わせました');
console.log('  一致 ' + same + ' 件 / 要修正 ' + plan.length + ' 件');
console.log('');

for (const p of plan) {
  console.log(p.row.code + '  ' + p.row.name);
  for (const d of p.diffs) {
    console.log('    ' + d.kind);
    console.log('        現在 ' + d.now);
    console.log('        一覧 ' + d.next);
  }
  console.log('');
}

// --- 反映 ---------------------------------------------------------------------

if (!APPLY) {
  console.log('確認のみで終了しました。直すには --apply を付けてください。');
} else {
  console.log('直します...');
  console.log('');
  let n = 0;
  for (const p of plan) {
    const { row, f, eps, wantKind, wantEpName, baseName } = p;

    // 当方が付けた正式名称は別名として残す。検索は従来どおり届かせる。
    const aliases = new Set(f.aliases ?? []);
    if (row.alias) aliases.add(row.alias);
    if (f.name !== row.name) aliases.add(f.name);
    aliases.delete(row.name);

    const r1 = await rest('/facilities?id=eq.' + f.id, {
      method: 'PATCH',
      body: { name: row.name, name_kana: row.kana, aliases: [...aliases] },
    });
    if (!r1.ok) {
      console.error('  失敗 ' + row.code + ' 施設 ' + JSON.stringify(r1.body));
      continue;
    }

    const r2 = await rest('/entry_points?id=eq.' + eps[0].id, {
      method: 'PATCH',
      body: {
        kind: wantKind,
        name: wantEpName,
        nav_lat: row.coordA.lat,
        nav_lng: row.coordA.lng,
        approach_text: row.note || PLACEHOLDER,
      },
    });
    if (!r2.ok) {
      console.error('  失敗 ' + row.code + ' 進入口A ' + JSON.stringify(r2.body));
      continue;
    }

    if (row.coordB) {
      const body = {
        kind: wantKind,
        name: routeName(baseName, 2),
        nav_lat: row.coordB.lat,
        nav_lng: row.coordB.lng,
        approach_text: SECOND_ROUTE_TEXT,
        sort_order: 2,
      };
      if (eps[1]) {
        await rest('/entry_points?id=eq.' + eps[1].id, { method: 'PATCH', body });
      } else {
        await rest('/entry_points', {
          method: 'POST',
          body: { ...body, facility_id: f.id, code: f.code + '-B' },
        });
      }
    } else if (eps[1]) {
      await rest('/entry_points?id=eq.' + eps[1].id, { method: 'DELETE' });
    }

    n++;
    console.log('  直しました  ' + row.code + '  ' + row.name);
  }
  console.log('');
  console.log(n + ' 件を直しました。座標が動いたものは住所も引き直してください:');
  console.log('  node tools/fill-addresses.mjs --apply');
}
