/**
 * クライアント様からいただいた一覧を、取り込み用の CSV に書き起こす。
 *
 *   node tools/build-client-csv.mjs
 *
 * 一覧は画像でいただいたため、ここに書き写している。
 * 直接 CSV を手で書かずスクリプトにしているのは、
 *   - 誤りが見つかったとき1か所を直せば作り直せる
 *   - 「何を当方が補ったか」がコード上に残る
 * ため。
 *
 * いただいた項目と、こちらの項目の対応:
 *   ホテル名        → 施設名
 *   車寄せ 有/無    → 区分（有=車寄せ / 無=エントランス）
 *   座標            → ナビ緯度・経度
 *   備考            → 進入方法の説明
 *
 * 「車寄せ 無」は、車を寄せる場所が無いという意味ではなく、
 * 屋根付きの車寄せが無くエントランス前での乗降になる、と解釈した。
 */
import { mkdirSync, writeFileSync } from 'node:fs';

/** ★ が付いた項目は当方の推定。クライアント様の確認が要る。 */
const HOTELS = [
  // --- 東京駅・銀座 -----------------------------------------------------------
  { area: '東京駅・銀座', name: '帝国ホテル東京', kana: 'ていこくほてるとうきょう',
    aliases: '帝国ホテル;インペリアルホテル', city: '千代田区', addr: '内幸町1-1-1',
    canopy: true, coords: [`35°40'22.0"N 139°45'27.4"E`, `35°40'20.7"N 139°45'33.4"E`],
    note: '' },
  { area: '東京駅・銀座', name: 'ザ・ペニンシュラ東京', kana: 'ざぺにんしゅらとうきょう',
    aliases: 'ペニンシュラ', city: '千代田区', addr: '有楽町1-8-1',
    canopy: true, coords: [`35°40'23.5"N 139°45'36.1"E`, `35°40'30.1"N 139°45'37.1"E`],
    note: '' },
  { area: '東京駅・銀座', name: 'ブルガリ ホテル 東京', kana: 'ぶるがりほてるとうきょう',
    aliases: 'ブルガリ', city: '中央区', addr: '★八重洲',
    canopy: true, coords: [`35°40'42.9"N 139°46'08.3"E`], note: '' },
  { area: '東京駅・銀座', name: 'マンダリン オリエンタル 東京', kana: 'まんだりんおりえんたるとうきょう',
    aliases: 'マンダリンオリエンタル', city: '中央区', addr: '日本橋室町2-1-1',
    canopy: true, coords: [`35°41'14.0"N 139°46'21.4"E`], note: '' },
  { area: '東京駅・銀座', name: 'シャングリ・ラ 東京', kana: 'しゃんぐりらとうきょう',
    aliases: 'シャングリラ', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°40'54.4"N 139°46'10.3"E`], note: '通路奥から地下へ' },
  { area: '東京駅・銀座', name: 'フォーシーズンズホテル丸の内 東京', kana: 'ふぉーしーずんずほてるまるのうちとうきょう',
    aliases: 'フォーシーズンズ丸の内', city: '千代田区', addr: '★丸の内',
    canopy: false, coords: [`35°40'40.8"N 139°46'02.5"E`], note: '' },
  { area: '東京駅・銀座', name: 'フォーシーズンズホテル東京大手町', kana: 'ふぉーしーずんずほてるとうきょうおおてまち',
    aliases: 'フォーシーズンズ大手町', city: '千代田区', addr: '★大手町',
    canopy: true, coords: [`35°41'17.4"N 139°45'49.1"E`], note: '' },
  { area: '東京駅・銀座', name: 'アスコット丸の内東京', kana: 'あすこっとまるのうちとうきょう',
    aliases: 'アスコット', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°41'03.8"N 139°45'47.0"E`], note: '' },
  { area: '東京駅・銀座', name: 'アマン東京', kana: 'あまんとうきょう',
    aliases: 'アマン', city: '千代田区', addr: '大手町1-5-6',
    canopy: true, coords: [`35°41'08.5"N 139°45'57.2"E`], note: '' },
  { area: '東京駅・銀座', name: 'オークウッドプレミア東京', kana: 'おーくうっどぷれみあとうきょう',
    aliases: 'オークウッド', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°40'56.3"N 139°46'12.8"E`],
    note: '夜間は地下入口が閉鎖されるため、1階へお回りください。' },
  { area: '東京駅・銀座', name: 'パレスホテル東京', kana: 'ぱれすほてるとうきょう',
    aliases: 'パレスホテル', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°41'07.3"N 139°45'40.6"E`], note: '' },
  { area: '東京駅・銀座', name: '東京ステーションホテル', kana: 'とうきょうすてーしょんほてる',
    aliases: 'ステーションホテル', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°40'51.1"N 139°45'56.0"E`], note: '' },
  { area: '東京駅・銀座', name: '星のや東京', kana: 'ほしのやとうきょう',
    aliases: '星のや', city: '千代田区', addr: '★大手町',
    canopy: true, coords: [`35°41'19.7"N 139°45'51.4"E`], note: '' },
  { area: '東京駅・銀座', name: '丸ノ内ホテル', kana: 'まるのうちほてる',
    aliases: '', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°40'59.2"N 139°46'00.3"E`], note: '' },
  { area: '東京駅・銀座', name: 'コートヤード・バイ・マリオット東京ステーション',
    kana: 'こーとやーどばいまりおっととうきょうすてーしょん',
    aliases: 'コートヤード東京ステーション', city: '中央区', addr: '★八重洲',
    canopy: true, coords: [`35°40'40.5"N 139°46'13.1"E`],
    note: '地下2階のエレベーターホールから1階へお回りください。' },
  { area: '東京駅・銀座', name: '第一ホテル東京', kana: 'だいいちほてるとうきょう',
    aliases: '第一ホテル', city: '港区', addr: '★新橋',
    canopy: true, coords: [`35°40'07.8"N 139°45'27.4"E`], note: '' },
  { area: '東京駅・銀座', name: 'メルキュール東京日比谷', kana: 'めるきゅーるとうきょうひびや',
    aliases: 'メルキュール', city: '千代田区', addr: '★内幸町',
    canopy: false, coords: [`35°40'05.2"N 139°45'29.8"E`], note: '' },
  { area: '東京駅・銀座', name: 'ホテルメトロポリタン丸の内', kana: 'ほてるめとろぽりたんまるのうち',
    aliases: 'メトロポリタン丸の内', city: '千代田区', addr: '★丸の内',
    canopy: true, coords: [`35°41'00.3"N 139°46'08.3"E`],
    note: '地下2階の駐車場から27階へお上がりください。' },
  { area: '東京駅・銀座', name: '三井ガーデンホテル日本橋プレミア', kana: 'みついがーでんほてるにほんばしぷれみあ',
    aliases: '三井ガーデン日本橋', city: '中央区', addr: '★日本橋',
    canopy: false, coords: [`35°41'17.3"N 139°45'23.8"E`], note: '' },

  { area: '東京駅・銀座', name: 'ACホテル・バイ・マリオット東京銀座', kana: 'えーしーほてるばいまりおっととうきょうぎんざ',
    aliases: 'ACホテル銀座', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'06.4"N 139°45'55.6"E`], note: '' },
  { area: '東京駅・銀座', name: 'ザ・エディション銀座', kana: 'ざえでぃしょんぎんざ',
    aliases: 'エディション銀座', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'21.3"N 139°46'02.8"E`], note: '' },
  { area: '東京駅・銀座', name: '★読み取り不明（日比谷）', kana: 'ひびや',
    aliases: '', city: '千代田区', addr: '★日比谷',
    canopy: false, coords: [`35°40'20.3"N 139°45'34.2"E`],
    note: '★一覧の3行目。ホテル名が読み取れませんでした。ご教示ください。' },
  { area: '東京駅・銀座', name: 'コートヤード・マリオット銀座東武ホテル',
    kana: 'こーとやーどまりおっとぎんざとうぶほてる',
    aliases: '銀座東武ホテル', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'05.6"N 139°45'54.6"E`], note: '' },
  { area: '東京駅・銀座', name: 'アロフト・バイ・マリオット東京銀座', kana: 'あろふとばいまりおっととうきょうぎんざ',
    aliases: 'アロフト銀座', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'08.1"N 139°45'57.1"E`], note: '' },
  { area: '東京駅・銀座', name: '三井ガーデンホテル銀座プレミア', kana: 'みついがーでんほてるぎんざぷれみあ',
    aliases: '三井ガーデン銀座', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'01.2"N 139°45'45.6"E`], note: '' },
  { area: '東京駅・銀座', name: 'ミレニアム三井ガーデンホテル東京', kana: 'みれにあむみついがーでんほてるとうきょう',
    aliases: 'ミレニアム三井ガーデン', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'03.7"N 139°46'22.6"E`], note: '' },
  { area: '東京駅・銀座', name: 'ハイアット セントリック 銀座 東京', kana: 'はいあっとせんとりっくぎんざとうきょう',
    aliases: 'ハイアットセントリック', city: '中央区', addr: '★銀座',
    canopy: false, coords: [`35°40'13.7"N 139°45'43.9"E`], note: '' },
  { area: '東京駅・銀座', name: '東京エディション虎ノ門', kana: 'とうきょうえでぃしょんとらのもん',
    aliases: 'エディション虎ノ門', city: '港区', addr: '★虎ノ門',
    canopy: false, coords: [`35°39'54.2"N 139°44'45.9"E`], note: '通路スロープから地下へ' },
  { area: '東京駅・銀座', name: 'ホテル銀座クレストン', kana: 'ほてるぎんざくれすとん',
    aliases: '銀座クレストン', city: '中央区', addr: '★銀座',
    canopy: true, coords: [`35°40'01.2"N 139°46'42.0"E`], note: '' },

  // --- 渋谷 -------------------------------------------------------------------
  { area: '渋谷', name: '渋谷エクセルホテル東急', kana: 'しぶやえくせるほてるとうきゅう',
    aliases: 'エクセル東急;渋谷エクセル', city: '渋谷区', addr: '道玄坂1-12-2',
    canopy: true, coords: [`35°39'27.3"N 139°41'47.7"E`],
    note: '通路スロープを上がり、通路の一番奥へお進みください。' },
  { area: '渋谷', name: '渋谷東急REIホテル', kana: 'しぶやとうきゅうれいほてる',
    aliases: '東急REI', city: '渋谷区', addr: '★道玄坂',
    canopy: false, coords: [`35°39'36.8"N 139°42'08.0"E`],
    note: 'エントランス正面がバス停のため、その前後で停車してください。' },
  { area: '渋谷', name: 'ホテルインディゴ東京渋谷', kana: 'ほてるいんでぃごとうきょうしぶや',
    aliases: 'インディゴ渋谷', city: '渋谷区', addr: '★道玄坂',
    canopy: false, coords: [`35°39'35.5"N 139°41'40.6"E`], note: '通路奥' },
  { area: '渋谷', name: '東急ステイ渋谷', kana: 'とうきゅうすていしぶや',
    aliases: '東急ステイ', city: '渋谷区', addr: '★渋谷',
    canopy: false, coords: [`35°40'05.5"N 139°42'00.5"E`], note: '' },
  { area: '渋谷', name: 'トランクホテル キャットストリート', kana: 'とらんくほてるきゃっとすとりーと',
    aliases: 'TRUNK;トランクホテル', city: '渋谷区', addr: '★神宮前',
    canopy: false, coords: [`35°39'51.0"N 139°42'13.3"E`], note: '' },
  { area: '渋谷', name: 'ハイアットハウス東京渋谷', kana: 'はいあっとはうすとうきょうしぶや',
    aliases: 'ハイアットハウス', city: '渋谷区', addr: '★渋谷',
    canopy: true, coords: [`35°39'19.4"N 139°42'11.3"E`], note: '通路奥' },
];

/** CSV の1項目を安全な形にする */
function cell(value) {
  const v = String(value ?? '');
  // 度分秒の秒記号 (") が入るため、囲まずにそのまま出す。
  // 取り込み側は「項目の先頭に来た引用符」だけを囲みとして扱う。
  return v.includes(',') && !v.startsWith('"') ? `"${v}"` : v;
}

const facilityRows = [
  '施設コード,施設名,施設名かな,別名・略称,カテゴリ,郵便番号,都道府県,市区町村,住所,施設概要,備考',
];
const entryRows = [
  '施設名,進入口記号,区分,名称,進入方法の説明,進入元の道路・方向,ナビ緯度,ナビ経度,停車位置緯度,停車位置経度,高さ制限cm,屋根,24時間,注意事項1,注意1_開始時刻,注意1_終了時刻,注意1_曜日,注意事項2,注意2_開始時刻,注意2_終了時刻,注意2_曜日,備考',
];

/** 進入方法が未記入だと公開できない。現地調査前であることを明記する。 */
const PENDING = '現地調査前です。座標のみ登録されています。到着後の進入方法は追ってお知らせします。';

for (const h of HOTELS) {
  const memo = [
    `エリア: ${h.area}`,
    h.addr.startsWith('★') ? '住所は当方推定（丁目・番地は未確認）' : '',
    h.name.startsWith('★') ? '施設名が読み取れず' : '',
    'よみがなは当方で補完',
  ]
    .filter(Boolean)
    .join(' / ');

  facilityRows.push(
    [
      '',
      h.name,
      h.kana,
      h.aliases,
      'ホテル',
      '',
      '東京都',
      h.city,
      h.addr.replace('★', ''),
      '',
      memo,
    ]
      .map(cell)
      .join(','),
  );

  h.coords.forEach((pair, index) => {
    const [lat, lng] = pair.split(/\s+(?=\d+°)/);
    const code = String.fromCharCode(65 + index);
    entryRows.push(
      [
        h.name,
        code,
        // 「車寄せ 有/無」をそのまま区分に対応させる
        h.canopy ? '車寄せ' : 'エントランス',
        h.canopy
          ? index === 0 ? '正面車寄せ' : `車寄せ ${code}`
          : index === 0 ? '正面エントランス' : `エントランス ${code}`,
        h.note || PENDING,
        '',
        lat,
        lng,
        '', '', '',
        h.canopy ? 'あり' : '',
        '',
        '', '', '', '', '', '', '', '',
        index === 0 ? 'いただいた座標をそのまま使用' : '一覧の2列目の座標',
      ]
        .map(cell)
        .join(','),
    );
  });
}

mkdirSync('data/import', { recursive: true });
writeFileSync('data/import/01_facilities.csv', facilityRows.join('\n') + '\n', 'utf8');
writeFileSync('data/import/02_entry_points.csv', entryRows.join('\n') + '\n', 'utf8');

const uncertain = HOTELS.filter((h) => h.addr.startsWith('★') || h.name.startsWith('★'));
console.log(`施設 ${HOTELS.length} 件 / 進入口 ${entryRows.length - 1} 件 を書き出しました`);
console.log(`  data/import/01_facilities.csv`);
console.log(`  data/import/02_entry_points.csv`);
console.log('');
console.log(`確認が必要な施設: ${uncertain.length} 件（住所または施設名が未確定）`);
