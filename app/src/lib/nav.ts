/**
 * 端末のナビアプリを、指定した座標へ案内する状態で開く。
 *
 * 渡すのは建物の代表地点ではなく `nav_lat / nav_lng`（進入レーンの入口）。
 * 一般の地図アプリは建物の中心を案内するため、車寄せまで数十メートル
 * ずれることがある。そのずれを解消することがこのアプリの目的そのもの。
 */
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { fill, type Dictionary } from './i18n/dictionaries';

export type NavApp = 'google' | 'yahoo' | 'apple';

export interface NavTarget {
  lat: number;
  lng: number;
  /** ナビ画面に出る目的地名。「帝国ホテル東京 正面車寄せ」など */
  label?: string;
}

/**
 * 座標を小数第6位までに丸める。
 *
 * 度分秒から変換すると `35.657583333333335` のように 15 桁になる。
 * 第6位で約 11cm の精度があり、車寄せの位置としては十分。
 * それ以上は意味を持たないうえ、URL が長くなり、
 * 受け取る側の解釈も機器によってまちまちになる。
 */
function round(value: number): string {
  return value.toFixed(6);
}

/**
 * 起動用のURLを組み立てる。
 *
 * Android と iOS で書式が違う。Android の `google.navigation:` は
 * 案内を即開始する専用の形式で、iOS の `comgooglemaps://` は
 * 経路画面を開く形式。
 */
function buildUrl(app: NavApp, target: NavTarget): string {
  const lat = round(target.lat);
  const lng = round(target.lng);
  const name = encodeURIComponent(target.label ?? '');

  if (app === 'yahoo') {
    // Yahoo! カーナビ。日本のドライバーの利用が多い。
    return `yjcarnavi://navi/select?lat=${lat}&lon=${lng}&name=${name}`;
  }

  if (app === 'apple') {
    // dirflg=d で自動車の経路
    return `maps://?daddr=${lat},${lng}&dirflg=d`;
  }

  return Platform.OS === 'android'
    ? `google.navigation:q=${lat},${lng}&mode=d`
    : `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
}

/** どのアプリも入っていない場合に開く、ブラウザ上の経路案内 */
function webFallbackUrl(target: NavTarget): string {
  const lat = round(target.lat);
  const lng = round(target.lng);
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

/**
 * ナビを開く。開けたアプリ名を返す。
 *
 * canOpenURL で事前確認しない理由:
 *   iOS は LSApplicationQueriesSchemes に列挙した scheme しか
 *   問い合わせられず、Android 11 以降も manifest の queries が要る。
 *   実際に開いてみて失敗したら次を試すほうが、設定漏れに強い。
 */
export async function openNavigation(
  target: NavTarget,
  preferred: NavApp[] = Platform.OS === 'ios'
    ? ['google', 'yahoo', 'apple']
    : ['google', 'yahoo'],
): Promise<NavApp | 'web'> {
  /*
    ブラウザでは、アプリ専用の呼び出しを試さない（ご報告 2026-09-12）。

    **ここが効いていなかった。** 以前は端末と同じ順で
    `comgooglemaps://` などを先に試していた。端末なら、入っていない
    アプリの呼び出しは失敗して次へ進む。ところが**ブラウザは、知らない
    形式の呼び出しを黙って捨てる。例外も出ない。** そのため最初の
    試行が「成功した」ことになり、地図が開かないまま終わっていた。

    押しても何も起きない、という形で出る。このアプリは PWA として
    配っている（docs/08-distribution.md）ので、**ほぼ全員がこちらを
    通る。**

    ブラウザには web の地図を直に渡す。ここから先は、端末に地図の
    アプリが入っていれば、ブラウザがそちらへ引き継ぐ。
  */
  if (Platform.OS === 'web') {
    await Linking.openURL(webFallbackUrl(target));
    return 'web';
  }

  for (const app of preferred) {
    try {
      await Linking.openURL(buildUrl(app, target));
      return app;
    } catch {
      // このアプリは入っていない。次を試す。
    }
  }

  await Linking.openURL(webFallbackUrl(target));
  return 'web';
}

/**
 * 座標を書き写せる形で複製する。
 *
 * 車載のナビ機器など、URLで受け取れない機器を使う方が一定数いる。
 * その場合は数値を手入力することになるため、控えを取れるようにしておく。
 */
export async function copyCoordinates({ lat, lng }: NavTarget): Promise<string> {
  const text = `${round(lat)}, ${round(lng)}`;
  await Clipboard.setStringAsync(text);
  return text;
}

/**
 * 施設の画面を人へ渡す。
 *
 * **座標ではなく画面の在り処を渡す**
 *   以前は座標を写していた。受け取った側が地図アプリへ貼ると、
 *   建物の中心へ案内されるだけで、進入方法の説明は届かない。
 *   このアプリで最も伝えたいものが落ちてしまう。
 *
 *   施設の画面の在り処を渡せば、相手も同じ案内を見られる。
 *
 * **渡し方は環境に任せる**
 *   ブラウザに共有の口があればそれを使う（LINE やメールへ直接渡せる）。
 *   無ければ写しに置く。どちらもできなければ、その旨を返す。
 *
 * 返り値は利用者へ出す短い言葉。
 */
export async function shareFacility(options: {
  /** 施設の名前。相手に何の話か伝わるようにする。 */
  name: string;
  /** 施設の画面の在り処 */
  url: string;
  /** 文言。呼ぶ側がいまの言語の辞書を渡す。 */
  t: Dictionary;
}): Promise<{ ok: boolean; how: 'shared' | 'copied' | 'failed'; text: string }> {
  const text = fill(options.t.navApp.shareText, { name: options.name });

  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: text, text, url: options.url });
        return { ok: true, how: 'shared', text };
      } catch {
        /*
          断られた場合もここへ来る。写しに置いて続ける。

          「共有をやめた」のか「共有できない」のかは区別できないが、
          写しに置いておけば、どちらでも手立ては残る。
        */
      }
    }
  }

  try {
    await Clipboard.setStringAsync(options.url);
    return { ok: true, how: 'copied', text: options.url };
  } catch {
    return { ok: false, how: 'failed', text: '' };
  }
}

/*
  地図アプリの呼び名は辞書（navApp）へ移した。どこからも
  引かれていなかったが、残しておくと言語を切り替えても
  日本語のまま出る作りが再び生える。
*/
