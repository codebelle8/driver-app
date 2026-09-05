'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import type { BulkLabels } from '@/lib/i18n/dictionaries';

/**
 * 選んだぶんをまとめて消す。
 *
 * **なぜ要るか**
 *   仮画像は75枚あり、実写真が届いたら入れ替えていく。1枚ずつ
 *   「削除 → 確かめる」を繰り返すと、確かめの札が枚数ぶん出る。
 *   数が多いほど、札は読まれずに押される。まとめて一度尋ねるほうが、
 *   一回あたりの確かめが実際に読まれる。
 *
 * **消す処理は増やさない**
 *   1件用の server action がそのまま複数を受け取る（getAll）。
 *   件数ごとに別の処理を持つと、権限の確認と操作履歴の記録を
 *   二重に書くことになる。
 *
 * **送る form は一覧の外に置く**
 *   一覧の中には行ごとの form（1件削除、並べ替え）が既にある。
 *   包むと form の入れ子になり、HTML として成立しない。
 *   隠した form を隣に置き、決まった時点で submit する。
 *
 * **選んでいる状態は context で配る**
 *   施設の画面には入口が複数あり、入口ごとに写真と注意事項の一覧が
 *   並ぶ。一覧の数だけこの部品が置かれるため、置き場所を一つに
 *   まとめると互いの選択が混ざる。
 */

type Selection = {
  on: boolean;
  picked: ReadonlySet<string>;
  toggle: (id: string) => void;
  /** どの一覧か。検査から選び分けるための目印に使う。 */
  name: string;
};

/** 選んでいない状態。包まれていないところと、枠を出さないときに使う。 */
const OFF: Selection = {
  on: false,
  picked: new Set<string>(),
  toggle: () => {},
  name: '',
};

const SelectionContext = createContext<Selection>(OFF);

export function BulkDelete({
  /**
   * どの一覧か（entry-point / caution / photo）。
   *
   * 画面には入口ごとに写真と注意事項の一覧が並ぶ。目印を振らないと、
   * 検査からどの一覧の「選択」なのかを選び分けられない。
   */
  name,
  action,
  /** facility_id など、id 以外に送るもの */
  extra,
  /** 一覧に出ているものの id。すべて選ぶときに使う。 */
  ids,
  labels,
  /**
   * 閲覧だけのときは false。
   *
   * 選べても消せない状態にしないため。押せるように見えるものが
   * 押せないのは、壊れていると受け取られる。
   */
  enabled = true,
  children,
}: {
  name: string;
  action: (formData: FormData) => Promise<void>;
  extra: Record<string, string>;
  ids: string[];
  labels: BulkLabels;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  /*
    一覧に無くなった id は数えない。

    消したあとも選んだままだと、「削除 (n)」の件数が実際と食い違う。
    状態そのものを書き換えず、使うときに絞る。描画の途中で
    状態を変えると、余計な描き直しを呼ぶ。
  */
  const alive = new Set(ids);
  const live = [...picked].filter((id) => alive.has(id));

  /*
    毎回作り直している。

    useMemo で包むこともできるが、下にぶら下がるのはチェック欄が
    数個だけで、描き直しの費用より依存の書き方を誤る危険のほうが大きい。
  */
  const value: Selection = {
    name,
    on,
    picked: new Set(live),
    toggle: (id: string) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
  };

  const allPicked = ids.length > 0 && live.length === ids.length;
  const exit = () => {
    setOn(false);
    setPicked(new Set());
  };

  /*
    枠を出さないときも、選んでいない状態を配る。

    1件しか無いなら選ぶ手間のほうが多いので枠は出さないが、
    そのまま children を返すと、中の BulkCheck が一つ外側の
    枠を拾ってしまう。施設の画面では入口の一覧の中に写真と
    注意事項の一覧が入っており、写真が1枚だけのときに
    その写真のチェックが「入口を選ぶ」側へ入っていた。
  */
  if (!enabled || ids.length < 2) {
    return <SelectionContext.Provider value={OFF}>{children}</SelectionContext.Provider>;
  }

  return (
    <SelectionContext.Provider value={value}>
      <div
        data-testid={`bulk-${name}`}
        className="flex items-center justify-end gap-4 text-xs"
      >
        {on ? (
          <>
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(ids))}
              className="text-text-muted transition-colors hover:text-text"
            >
              {allPicked ? labels.unselectAll : labels.selectAll}
            </button>
            <button
              type="button"
              disabled={live.length === 0}
              onClick={() => setAsking(true)}
              className={
                'transition-colors ' +
                (live.length === 0
                  ? 'cursor-not-allowed text-text-faint opacity-50'
                  : 'font-semibold text-danger hover:opacity-80')
              }
            >
              {labels.deleteSelected.replace('{count}', String(live.length))}
            </button>
            <button
              type="button"
              onClick={exit}
              className="text-text-muted transition-colors hover:text-text"
            >
              {labels.selectCancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOn(true)}
            className="text-text-muted transition-colors hover:text-text"
          >
            {labels.select}
          </button>
        )}
      </div>

      {children}

      {/*
        送るための form。一覧の外に置く。
        中に置くと、行ごとの form と入れ子になる。
      */}
      <form ref={form} action={action} className="hidden">
        {Object.entries(extra).map(([name, v]) => (
          <input key={name} type="hidden" name={name} value={v} />
        ))}
        {live.map((id) => (
          <input key={id} type="hidden" name="id" value={id} />
        ))}
      </form>

      <ConfirmDialog
        open={asking}
        heading={labels.heading}
        message={labels.confirmMany.replace('{count}', String(live.length))}
        note={labels.noUndo}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          /*
            submit してから選択を解く。

            解いてから submit すると、隠し入力が先に消えて
            0件を送ることになる。
          */
          form.current?.requestSubmit();
          exit();
        }}
      />
    </SelectionContext.Provider>
  );
}

/**
 * 1つぶんの選択欄。
 *
 * 選んでいる最中はチェック、そうでなければ渡されたもの（1件削除の
 * ボタンなど）をそのまま出す。同じ場所を入れ替えるので、
 * 選択に入っても行の形が崩れない。
 *
 * children を受け取る形にしてあるのは、置き場所を決めるのが
 * 呼ぶ側だから。写真は札の右下、注意事項は行の右端と、
 * 一覧ごとに納まりが違う。
 */
export function BulkCheck({
  id,
  label,
  children,
}: {
  id: string;
  /** 読み上げ用。何を選んでいるのか。 */
  label: string;
  children?: ReactNode;
}) {
  const { on, picked, toggle, name } = useContext(SelectionContext);
  if (!on) return <>{children}</>;

  return (
    <input
      type="checkbox"
      data-testid={`bulk-check-${name}`}
      checked={picked.has(id)}
      onChange={() => toggle(id)}
      aria-label={label}
      className="size-4 cursor-pointer accent-accent"
    />
  );
}
