/**
 * 取り消せない操作の前に、一度受け止める。
 *
 * **なぜ要るか**
 *   消す操作は元に戻せない。指が滑って触れただけで消えるのは、
 *   走行前の慌ただしい場面ではとくに起こりやすい。
 *
 * **ブラウザの confirm をやめた**
 *   以前は window.confirm と Alert.alert を使っていた。動きはするが、
 *   出てくるのはブラウザや端末の作った灰色の枠で、アプリの配色とも
 *   書体とも揃わない。暗い配色で使っている最中に白い枠が出ると、
 *   夜間の車内では目が眩む。文言の並び順も決められず、
 *   「はい／いいえ」の位置が環境ごとに入れ替わる。
 *
 * **ここは入れ物だけを持つ**
 *   見た目は components/confirm-dialog.tsx が描く。呼ぶ側は関数を
 *   一つ呼ぶだけで済ませたいので、画面の外から頼めるようにしてある。
 *   画面ごとに状態を持たせると、行の中・見出しの中・一覧の外と
 *   呼び出す場所が散らばるぶんだけ同じ組み立てが増える。
 */

export type ConfirmRequest = {
  /** 見出し。何を消すのか。 */
  title: string;
  /** 本文。何件を、どこから消すのか。 */
  message: string;
  /**
   * 添える一言。既定は「元には戻せません。」
   *
   * 本文の末尾に続けて書いていたところ、折り返しが
   * 「元に／は戻せません」の位置に落ちて読みにくかった。
   * 行を分ければ、どの幅でも語の途中で切れない。
   * 呼ぶ側ごとに書き方が揺れるのも防げる。
   */
  note: string;
  /** 消す側の文言。「削除する」「外す」など。 */
  yes: string;
  onYes: () => void;
};

/** 取り消せないことを伝える一言。既定の文面。 */
export const NO_UNDO = '元には戻せません。';

type Listener = (request: ConfirmRequest | null) => void;

let listener: Listener | null = null;
/** 出し口が用意される前に頼まれたぶん。用意でき次第すぐ出す。 */
let waiting: ConfirmRequest | null = null;

/**
 * 出し口を登録する。ConfirmHost からのみ呼ぶ。
 * 戻り値を呼ぶと登録を外す。
 */
export function attachConfirmHost(next: Listener): () => void {
  listener = next;
  if (waiting) {
    const held = waiting;
    waiting = null;
    next(held);
  }
  return () => {
    if (listener === next) listener = null;
  };
}

export function confirmDelete(options: {
  title: string;
  message: string;
  /** 既定は「元には戻せません。」 */
  note?: string;
  /** 既定は「削除する」 */
  yes?: string;
  onYes: () => void;
}): void {
  const request: ConfirmRequest = {
    title: options.title,
    message: options.message,
    note: options.note ?? NO_UNDO,
    yes: options.yes ?? '削除する',
    onYes: options.onYes,
  };

  /*
    出し口がまだ無ければ持っておく。

    捨ててしまうと、押したのに何も起きない画面になる。
    無言で消えるより、一拍遅れて出るほうがまだ分かる。
  */
  if (!listener) {
    waiting = request;
    return;
  }
  listener(request);
}
