/**
 * 注意事項が「いま」該当するかを判定する。
 *
 * なぜ時間帯で分けるか:
 *   運転中に読む情報は少ないほど安全。「17〜20時は送迎バスが停車する」は
 *   14時のドライバーには不要な情報で、目立たせると本当に必要な注意が
 *   埋もれる。該当するものだけを強調し、他は畳んで置く。
 */
import type { Caution } from './types';

/** 'HH:MM:SS' を、その日の 0 時からの分数へ */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** JavaScript の 0=日曜 を ISO 8601 の 1=月曜…7=日曜 へ */
function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * いまこの注意事項が該当するか。
 *
 * 時刻が未設定なら常時該当。
 * `time_from > time_to` の場合は日をまたぐ（例 22:00〜05:00）。
 */
export function isActiveNow(
  // 実際に見るのは時間帯と曜日だけ。必要な分だけ受け取れるようにしておくと、
  // お知らせのように別の形で持っている行からも判定できる。
  caution: Pick<Caution, 'time_from' | 'time_to' | 'weekdays'>,
  now: Date = new Date(),
): boolean {
  const { time_from, time_to, weekdays } = caution;

  const minutes = now.getHours() * 60 + now.getMinutes();
  let effectiveDay = isoWeekday(now);

  if (time_from && time_to) {
    const from = toMinutes(time_from);
    const to = toMinutes(time_to);

    if (from <= to) {
      if (minutes < from || minutes >= to) return false;
    } else {
      // 日をまたぐ時間帯。深夜側にいる場合、その注意事項は
      // 「前日の夜に始まったもの」なので、曜日は前日で判定する。
      const inEvening = minutes >= from;
      const inMorning = minutes < to;
      if (!inEvening && !inMorning) return false;
      if (inMorning) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        effectiveDay = isoWeekday(yesterday);
      }
    }
  }

  // 空配列は「全曜日」
  if (weekdays.length > 0 && !weekdays.includes(effectiveDay)) return false;

  return true;
}

/** いま該当するものを先に、それ以外を後ろにして返す */
export function splitByActive(
  cautions: Caution[],
  now: Date = new Date(),
): { active: Caution[]; inactive: Caution[] } {
  const active: Caution[] = [];
  const inactive: Caution[] = [];
  for (const c of cautions) {
    (isActiveNow(c, now) ? active : inactive).push(c);
  }
  return { active, inactive };
}

const WEEKDAY_LABEL: Record<number, string> = {
  1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日',
};

/** 「平日 17:00–20:00」のような、適用条件の短い説明 */
export function describeSchedule(caution: Caution): string | null {
  const parts: string[] = [];

  if (caution.weekdays.length > 0 && caution.weekdays.length < 7) {
    const days = [...caution.weekdays].sort();
    const isWeekdays = days.join(',') === '1,2,3,4,5';
    const isWeekend = days.join(',') === '6,7';
    parts.push(
      isWeekdays ? '平日' : isWeekend ? '土日' : days.map((d) => WEEKDAY_LABEL[d]).join('・'),
    );
  }

  if (caution.time_from && caution.time_to) {
    parts.push(`${caution.time_from.slice(0, 5)}–${caution.time_to.slice(0, 5)}`);
  }

  return parts.length ? parts.join(' ') : null;
}
