/**
 * お知らせ。
 *
 * **なぜ要るか**
 *   車寄せは変わる。工事で入口が閉鎖される、夜間の動線が変わる。
 *   ドライバーが前回の記憶のまま向かって現地で困るのが、
 *   このアプリで最も避けたい事態にあたる。
 *
 * **どこから作るか**
 *   新しい表は作らず、既に端末へ取り込んでいるものから組み立てる。
 *     いま効いている注意事項 … cautions（時間帯・曜日の条件つき）
 *     新しく増えた施設       … catalog.ts が取り込みのたびに控える差分
 *
 *   操作履歴 (audit_logs) のほうが「何が変わったか」まで分かるが、
 *   あれは管理者向けの記録で、アプリからは読めないようにしてある。
 *   読めるようにすると、誰がいつ何をしたかが外へ出る。
 *
 * **「更新されました」をやめた理由**（2026-09-04）
 *   以前は facilities.updated_at を見て「案内の内容が更新されました」を
 *   出していた。ところがデータを一括で入れ直すと全件の更新日時が同じに
 *   なり、**一度も見たことのない施設について30件が並ぶ**状態になった。
 *   実際に193件の取り込みでそうなった。
 *
 *   updated_at は「中身が変わった」ことを示さない。表記の統一や住所の
 *   補完でも動く。乗務員の方が知りたいのは進入方法が変わったことだが、
 *   それを updated_at から区別する手立てが無い。
 *
 *   代わりに「新しく増えた施設」を出す。これは端末が前回持っていた
 *   一覧と比べて確実に判別でき、誤って出ることがない。
 *
 * **「案内が変わりました」を入れ直した**（ご指示 2026-09-14）
 *   日時ではなく、**中身そのものを突き合わせる。** 端末が前回持って
 *   いた値と今回の値を比べ、違うものだけを出す。値が変わっていなければ、
 *   何度入れ直してもお知らせは出ない。上の事故はこれで起きなくなる。
 *
 *   見るのは乗務員に関わるものだけ（進入方法・座標・高さ制限・屋根・
 *   24時間・入口の増減・施設名・住所）。英語表記や並び順では出さない。
 *   **何が変わったかまで伝える。** 「更新されました」だけでは、開いて
 *   何を確かめればよいのか分からない。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { daysLeft, endsAt, type Account } from './account';
import {
  getAddedFacilities,
  getChangedCategories,
  getChangedFacilities,
  type CategoryChange,
  type ChangeKind,
} from './catalog';
import { isActiveNow } from './cautions';
import { fetchCautionsWithFacility, fetchFacilitiesByIds } from './facilities';
import type { Locale } from './i18n/dictionaries';
import { facilityName as pickName } from './localized';
import type { CautionSeverity } from './types';

/** 読んだお知らせの控え */
const READ_KEY = 'kn_notices_read';

/**
 * 控えておく上限。
 *
 * 際限なく貯めると、端末に残す量が増え続ける。
 * 古いものは一覧から落ちるため、控えも同じだけあれば足りる。
 */
const READ_LIMIT = 300;

export type NoticeKind = 'caution' | 'added' | 'trial' | 'changed' | 'category';

export interface Notice {
  id: string;
  kind: NoticeKind;
  /** 施設に紐づく知らせだけが持つ。無料期間の知らせは持たない。 */
  facilityId?: string;
  facilityName?: string;
  /** 無料期間の知らせだけが持つ。残りの日数。 */
  daysLeft?: number;
  /** 同上。お支払い済みの期間か（文面を変える）。 */
  paid?: boolean;
  /** 画面に出す本文 */
  /**
   * 本文。注意事項はそのまま出す。
   * 新しく増えた施設は決まった一言なので、画面側が辞書から引く。
   */
  body?: string;
  /** 案内が変わった知らせだけが持つ。何が変わったか。 */
  changes?: ChangeKind[];
  /** カテゴリの知らせだけが持つ */
  categoryName?: string;
  categoryChange?: CategoryChange;
  /** 並べ替えと「新着」の判定に使う */
  at: string;
  severity?: CautionSeverity;
}

/**
 * 無料期間の終わりが近いことの知らせ。
 *
 * **2日前と1日前だけ出す。**
 *   ご指示による。毎日出すと読まなくなり、切れた日にも読み飛ばされる。
 *   2回に絞れば、どちらも目に入る。
 *
 * **お支払い済みの方にも出す**（ご指示 2026-09-15）。
 *   お支払いいただいた期間にも終わりがある。切れる前に一度もお伝えせず、
 *   ある日突然使えなくなるのでは、無料期間のときと同じ不親切になる。
 *
 *   ただし**期限を持たない方には出さない。** この欄を設ける前から
 *   「ご利用中」だった方が当てはまる。払った方に払えと言うのが、
 *   いちばんしてはいけないこと。
 *
 * **1件ずつ別の知らせにする。**
 *   id に残りの日数を入れてある。2日前を読んでも、1日前はまた
 *   未読として出る。同じ id にすると、一度読んだきり二度と出ない。
 */
export function trialNotice(account: Account | null, now: Date = new Date()): Notice | null {
  if (!account) return null;
  /* 停止中の方には出さない。払う先ではなく、ご連絡いただく先が要る。 */
  if (account.status === 'blocked') return null;

  /* 期限を持たない方には出さない（endsAt が null） */
  const at = endsAt(account);
  if (!at) return null;

  const left = daysLeft(account, now);
  if (left !== 1 && left !== 2) return null;

  const end = new Date(at).getTime();
  if (Number.isNaN(end)) return null;

  return {
    id: `t:${at}:${left}`,
    kind: 'trial',
    daysLeft: left,
    paid: account.status === 'active',
    /* 知らせが効き始めた時刻。並べ替えと「何時間前」に使う。 */
    at: new Date(end - left * 86_400_000).toISOString(),
  };
}

/**
 * お知らせを組み立てる。
 *
 * 無料期間の知らせを先頭に置く。現地の注意より切迫している。
 * 期限を過ぎると設定より先へ進めなくなるため、見落とすと仕事が止まる。
 *
 * 次に注意事項。いま現地で効いている条件のほうが、
 * 「更新されました」より切迫しているため。
 */
/**
 * @param locale 施設名の言語。お知らせの一覧でも英語で読めるようにする。
 */
export async function fetchNotices(
  locale: Locale = 'ja',
  account: Account | null = null,
): Promise<Notice[]> {
  const withFacility = await fetchCautionsWithFacility();

  const cautions: Notice[] = withFacility
    .filter(({ caution }) => isActiveNow(caution))
    .map(({ caution, facility }) => ({
      id: 'c:' + caution.id,
      kind: 'caution' as const,
      facilityId: facility.id,
      facilityName: pickName(facility, locale),
      body: caution.body,
      // 注意事項は「いま効いている」ことが要点で、いつ書かれたかは問わない
      at: new Date().toISOString(),
      severity: caution.severity,
    }));

  const appeared = await getAddedFacilities();
  const byId = await fetchFacilitiesByIds(appeared.map((a) => a.id));

  const added: Notice[] = appeared
    // 増えたあとに消された施設は控えに残る。名前が引けないものは出さない。
    .filter((a) => byId.has(a.id))
    .map((a) => ({
      // 気づいた時刻まで含める。同じ施設が消えて再び増えたら別の1件。
      id: 'a:' + a.id + ':' + a.at,
      kind: 'added' as const,
      facilityId: a.id,
      facilityName: pickName(byId.get(a.id)!, locale),
      /* 文言は画面側で引く。ここは言語を知らない。 */
      at: a.at,
    }))
    // 新しいものを先に
    .reverse();

  /*
    案内の中身が変わった施設。ご指示 2026-09-14。

    **新着より前に置く。** 行ったことのある施設の入り方が変わったほうが、
    まだ行ったことのない施設が増えたことより切迫している。
  */
  const modified = await getChangedFacilities();
  const modById = await fetchFacilitiesByIds(modified.map((c) => c.id));

  const changed: Notice[] = modified
    // 変わったあとに消された施設は控えに残る。名前が引けないものは出さない。
    .filter((c) => modById.has(c.id))
    .map((c) => ({
      // 気づいた時刻まで含める。また変われば別の1件として未読に戻る。
      id: 'u:' + c.id + ':' + c.at,
      kind: 'changed' as const,
      facilityId: c.id,
      facilityName: pickName(modById.get(c.id)!, locale),
      changes: c.kinds,
      /* 文言は画面側で引く。ここは言語を知らない。 */
      at: c.at,
    }))
    // 新しいものを先に
    .reverse();

  /*
    カテゴリの変わり目。ご指示 2026-09-14。

    施設に紐づかないため、押したときの行き先は探す画面になる。
    施設のお知らせより後ろに置く。向かう先の判断は変えないため。
  */
  const catChanges = await getChangedCategories();
  const categories: Notice[] = catChanges
    .map((c) => ({
      id: 'g:' + c.id + ':' + c.at,
      kind: 'category' as const,
      categoryName: c.name,
      categoryChange: c.change,
      at: c.at,
    }))
    .reverse();

  const trial = trialNotice(account);

  return [...(trial ? [trial] : []), ...cautions, ...changed, ...added, ...categories];
}

/** これまでに読んだお知らせの控え */
export async function getRead(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(READ_KEY);
  if (!raw) return new Set();
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? new Set(list.map(String)) : new Set();
  } catch {
    // 壊れていたら控えを捨てる。全件が未読に戻るだけで、害はない。
    return new Set();
  }
}

/** 1件を読んだことにする */
export async function markRead(id: string): Promise<void> {
  const read = await getRead();
  if (read.has(id)) return;
  read.add(id);
  const list = [...read].slice(-READ_LIMIT);
  await AsyncStorage.setItem(READ_KEY, JSON.stringify(list));
}

/** まとめて読んだことにする（一覧の「すべて既読」） */
export async function markAllRead(ids: string[]): Promise<void> {
  const read = await getRead();
  for (const id of ids) read.add(id);
  const list = [...read].slice(-READ_LIMIT);
  await AsyncStorage.setItem(READ_KEY, JSON.stringify(list));
}

/**
 * まだ読んでいない件数。
 *
 * 読んだ分だけ減り、新しく出たものが増える。
 * 開いただけでまとめて既読にはしない。どれを見たのかが分からなくなるため。
 */
export function countUnread(notices: Notice[], read: Set<string>): number {
  return notices.filter((n) => !read.has(n.id)).length;
}
