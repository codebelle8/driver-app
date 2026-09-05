/**
 * 短い知らせ。「複製しました」「共有できませんでした」など。
 *
 * **確かめの札とは別のものにしている**
 *   札（confirm.ts）は、進むか戻るかを決めてもらうためのもの。
 *   こちらは終わったことを伝えるだけで、押す先がない。
 *   同じ形にすると、閉じるために一手が要る。片手で使う場面では
 *   その一手が邪魔になる。
 *
 * **ブラウザの alert をやめた理由**
 *   出てくるのはブラウザが作る枠で、アプリの配色にも書体にも
 *   従わない。座標を写した直後に白い枠が画面の中央を塞ぐのは、
 *   夜間の車内では具合が悪い。押さないと消えないのも重い。
 *
 * **入れ物だけを持つ**
 *   見た目は components/notice-toast.tsx が描く。
 *   呼ぶ側は関数を一つ呼ぶだけで済ませたい。
 */

export type NoticeTone = 'ok' | 'error';

export type Notice = {
  /** 何が起きたか。一行で。 */
  title: string;
  /** 添える内容。写した中身など。無くてよい。 */
  body?: string;
  tone: NoticeTone;
  /** 同じ知らせでも出し直せるようにする通し番号 */
  seq: number;
};

type Listener = (notice: Notice | null) => void;

let listener: Listener | null = null;
let waiting: Notice | null = null;
let seq = 0;

/**
 * 出し口を登録する。NoticeToast からのみ呼ぶ。
 * 戻り値を呼ぶと登録を外す。
 */
export function attachNoticeHost(next: Listener): () => void {
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

export function notify(title: string, body?: string, tone: NoticeTone = 'ok'): void {
  const notice: Notice = { title, body, tone, seq: ++seq };

  /*
    出し口がまだ無ければ持っておく。

    捨ててしまうと、押したのに何も起きない画面になる。
    無言で終わるより、一拍遅れて出るほうがまだ分かる。
  */
  if (!listener) {
    waiting = notice;
    return;
  }
  listener(notice);
}
