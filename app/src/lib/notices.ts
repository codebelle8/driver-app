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
 *   進入方法の変更は、管理画面から注意事項として書けば伝わる。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAddedFacilities } from './catalog';
import { isActiveNow } from './cautions';
import { fetchCautionsWithFacility, fetchFacilitiesByIds } from './facilities';
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

export type NoticeKind = 'caution' | 'added';

export interface Notice {
  id: string;
  kind: NoticeKind;
  facilityId: string;
  facilityName: string;
  /** 画面に出す本文 */
  body: string;
  /** 並べ替えと「新着」の判定に使う */
  at: string;
  severity?: CautionSeverity;
}

/**
 * お知らせを組み立てる。
 *
 * 注意事項を先に置く。いま現地で効いている条件のほうが、
 * 「更新されました」より切迫しているため。
 */
export async function fetchNotices(): Promise<Notice[]> {
  const withFacility = await fetchCautionsWithFacility();

  const cautions: Notice[] = withFacility
    .filter(({ caution }) => isActiveNow(caution))
    .map(({ caution, facility }) => ({
      id: 'c:' + caution.id,
      kind: 'caution' as const,
      facilityId: facility.id,
      facilityName: facility.name,
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
      facilityName: byId.get(a.id)!.name,
      body: '新しく追加されました。',
      at: a.at,
    }))
    // 新しいものを先に
    .reverse();

  return [...cautions, ...added];
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
