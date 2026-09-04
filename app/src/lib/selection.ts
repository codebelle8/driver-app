/**
 * 一覧から複数を選ぶ状態。
 *
 * 履歴とお気に入りで同じ作りになるため、ここへまとめる。
 * 片方だけ直して、もう片方が古いまま残るのを避ける。
 *
 * **選ぶ状態と、普段の状態を分ける**
 *   常に選択の丸を出すと、1件開きたいだけの人にも余計な操作が増える。
 *   「選択」を押したときだけ選ぶ状態に入る。
 *
 * **一覧が変わったら選択を捨てる**
 *   消したあとや取り込み直したあと、選んだ id が一覧に無くなることがある。
 *   残っていると「3件選択中」と出ているのに何も消えない、という状態になる。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface Selection {
  /** いま選ぶ状態か */
  on: boolean;
  /** 選ばれている id */
  picked: Set<string>;
  /** 選ぶ状態へ入る／出る */
  toggleMode: () => void;
  /** 選ぶ状態から出て、選択も捨てる */
  exit: () => void;
  /** 1件の選択を切り替える */
  toggle: (id: string) => void;
  /** すべて選ぶ／すべて外す */
  toggleAll: () => void;
  /** すべて選ばれているか */
  allPicked: boolean;
}

export function useSelection(ids: string[]): Selection {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  /*
    一覧から消えた id を落とす。

    ids は毎回新しい配列で来るため、中身を文字列にして見比べる。
    参照で見ると、中身が同じでも毎回落としに行くことになる。
  */
  const key = ids.join(',');
  useEffect(() => {
    setPicked((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(ids);
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // key が変わったときだけ見直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const exit = useCallback(() => {
    setOn(false);
    setPicked(new Set());
  }, []);

  const toggleMode = useCallback(() => {
    setOn((v) => {
      if (v) setPicked(new Set());
      return !v;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allPicked = ids.length > 0 && picked.size === ids.length;

  const toggleAll = useCallback(() => {
    setPicked((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [ids]);

  return useMemo(
    () => ({ on, picked, toggleMode, exit, toggle, toggleAll, allPicked }),
    [on, picked, toggleMode, exit, toggle, toggleAll, allPicked],
  );
}
