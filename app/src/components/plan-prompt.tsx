import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { choosePlan, daysLeft, isExpired } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { notify } from '@/lib/notice';
import { PLANS, monthsSaved, perMonth, yen, type PlanId } from '@/lib/plans';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 無料期間が終わったあとの、料金のご案内。
 *
 * **たたんで出し、押すと開く**
 *   ご指示による。開いた先は1つだけ選ぶ形。並べて置くだけだと、
 *   どちらを選んだのかが分からないまま申し込みの釦を押すことになる。
 *
 * **止めない**
 *   期間が切れても、今までどおり使える。お支払いの受け口がまだ無く、
 *   使えなくしたうえで「方法は追ってご連絡」では、ただ使えないだけになる。
 *   受け口ができた時点で、締めるかどうかを決める。
 *
 * **まだ請求は起きない**
 *   ここで控えるのは「どちらをご希望か」だけ。画面にもそう書く。
 *   書かずに「申し込む」とだけ置くと、支払ったつもりの方が出る。
 *
 * 置き場所は3つ。
 *   banner … 探す画面の上。切れている方にだけ出る。たたんで出す。
 *   panel  … 節の中へ差し込む。たたんで出す。
 *   page   … お支払いの画面。最初から開いており、たたむ釦も出さない。
 *            そこを見に来た方に、もう一手を求める理由がない。
 */
export function PlanPrompt({
  variant = 'banner',
  style,
}: {
  variant?: 'banner' | 'panel' | 'page';
  /*
    外側の余白は呼ぶ側が決める。

    包む View を呼ぶ側に置くと、出すものが無いときにも余白だけが残り、
    画面に理由のない隙間ができる。出さないときは何も描かない。
  */
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const { account, refresh } = useAccount();

  const isPage = variant === 'page';
  const [open, setOpen] = useState(isPage);
  const [picked, setPicked] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState(false);

  if (!account) return null;

  const over = isExpired(account);
  const left = daysLeft(account.trialEndsAt);

  /*
    探す画面では、切れるまで出さない。

    毎日開く画面に「あと28日」を出し続けても、読まなくなるだけで、
    切れた日にも読み飛ばされる。
  */
  if (variant === 'banner' && !over) return null;
  /*
    お支払い済みの方には、催促を出さない。
    ただしお支払いの画面では、選び直せるように出しておく。
  */
  if (account.status === 'active' && !isPage) return null;

  const chosen = account.plan;

  async function onSubmit() {
    if (!account || !picked || busy) return;
    setBusy(true);
    const r = await choosePlan(account.userId, picked);
    setBusy(false);
    if (r.ok) {
      await refresh();
      setOpen(false);
      notify(t.plan.chosen, t.plan.chosenBody);
    }
  }

  const name = (id: PlanId) => (id === 'monthly' ? t.plan.monthly : t.plan.yearly);

  return (
    <View style={[s.box, over ? s.boxOver : s.boxSoft, isPage && s.boxPage, style]}>
      {!isPage && (
      <View style={s.head}>
        <Ionicons
          name={over ? 'alert-circle' : 'time-outline'}
          size={18}
          color={over ? c.warn : c.textMuted}
        />
        <View style={s.headText}>
          <Text style={s.title}>{over ? t.plan.title : fill(t.plan.bodyLeft, { n: left })}</Text>
          {chosen ? (
            <Text style={s.body}>{fill(t.plan.current, { name: name(chosen) })}</Text>
          ) : (
            over && <Text style={s.body}>{t.plan.body}</Text>
          )}
        </View>
      </View>
      )}

      {isPage && <Text style={s.title}>{t.plan.choiceTitle}</Text>}

      {!open && (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={s.openButton}>
          <Text style={s.openText}>{chosen ? t.plan.change : t.plan.open}</Text>
          <Ionicons name="chevron-down" size={16} color={c.accent} />
        </Pressable>
      )}

      {open && (
        <View style={s.choices} accessibilityRole="radiogroup">
          {PLANS.map((p) => {
            const on = picked === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPicked(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={name(p.id)}
                style={[s.choice, on && s.choiceOn]}
              >
                <Ionicons
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={on ? c.accent : c.borderStrong}
                />
                <View style={s.choiceBody}>
                  <Text style={s.choiceName}>{name(p.id)}</Text>
                  <Text style={s.choicePrice}>
                    {p.id === 'monthly'
                      ? fill(t.plan.priceMonth, { yen: yen(p.yen) })
                      : fill(t.plan.priceYear, { yen: yen(p.yen) })}
                  </Text>
                  {p.id === 'yearly' && (
                    <Text style={s.choiceNote}>
                      {fill(t.plan.perMonth, { yen: yen(perMonth(p)) })}
                      {'　'}
                      {fill(t.plan.saved, { n: monthsSaved() })}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}

          <Text style={s.notYet}>{t.plan.notYet}</Text>

          <Pressable
            onPress={onSubmit}
            disabled={!picked || busy}
            accessibilityRole="button"
            style={[s.submit, (!picked || busy) && s.submitOff]}
          >
            <Text style={s.submitText}>{t.plan.choose}</Text>
          </Pressable>

          {!isPage && (
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={s.closeRow}>
              <Text style={s.closeText}>{t.plan.close}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: {
      borderRadius: RADIUS.md,
      borderWidth: 1,
      padding: SPACE.md,
      gap: SPACE.sm,
    },
    boxOver: { backgroundColor: c.warnSoft, borderColor: c.warn },
    /* お支払いの画面では、地の色に馴染ませる。催促の黄色は使わない。 */
    boxPage: { backgroundColor: c.surface, borderColor: c.border },
    boxSoft: { backgroundColor: c.surface, borderColor: c.border },

    head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
    headText: { flex: 1, gap: 2 },
    title: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    body: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },

    openButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.xs,
      height: 44,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.accent,
    },
    openText: { fontSize: TEXT.body, fontWeight: '700', color: c.accent },

    choices: { gap: SPACE.sm },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    choiceOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    choiceBody: { flex: 1, gap: 1 },
    choiceName: { fontSize: TEXT.sub, fontWeight: '700', color: c.textMuted },
    choicePrice: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text },
    choiceNote: { fontSize: TEXT.small, color: c.accent, fontWeight: '700' },

    notYet: { fontSize: TEXT.small, color: c.textMuted },

    submit: {
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
    },
    submitOff: { opacity: 0.45 },
    submitText: { fontSize: TEXT.title, fontWeight: '800', color: c.accentText },

    closeRow: { alignItems: 'center', paddingVertical: SPACE.xs },
    closeText: { fontSize: TEXT.sub, fontWeight: '700', color: c.textMuted },
  });
