import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocked } from '@/components/plan-gate';
import { useAccount } from '@/lib/account-context';
import { useT } from '@/lib/i18n/context';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 無料期間が終わっていることの説明。設定の画面の先頭に出す。
 *
 * **なぜ理由を書くか**
 *   突然「探す」が消えると、壊れたのだと受け取られる。壊れたと
 *   思った方は、直るのを待つ。待っているあいだ、お支払いは起きない。
 *
 * **確かめる釦を置く**
 *   入金の確認は人が行う。お振込みから反映まで間が空く。
 *   その間、利用者にできることが何も無いと、もう一度振り込む方が出る。
 *   押せば最新の状態を見に行く。
 */
export function PlanLock() {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const router = useRouter();
  const locked = useLocked();
  const { refresh } = useAccount();
  const [checking, setChecking] = useState(false);

  if (!locked) return null;

  return (
    <View style={s.box} accessibilityRole="alert">
      <View style={s.head}>
        <Ionicons name="lock-closed" size={18} color={c.warn} />
        <Text style={s.title}>{t.account.lockedTitle}</Text>
      </View>

      <Text style={s.body}>{t.account.lockedBody}</Text>

      <Pressable
        onPress={() => router.push('/plan')}
        accessibilityRole="button"
        accessibilityLabel={t.account.lockedAction}
        style={s.button}
      >
        <Text style={s.buttonText}>{t.account.lockedAction}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.accentText} />
      </Pressable>

      {/* お振込みが済んだ方が、自分で確かめられるようにする。 */}
      <Pressable
        onPress={async () => {
          setChecking(true);
          await refresh();
          setChecking(false);
        }}
        disabled={checking}
        accessibilityRole="button"
        style={s.plain}
      >
        <Text style={s.plainText}>
          {checking ? t.account.lockedChecking : t.account.lockedCheck}
        </Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: {
      marginBottom: SPACE.md,
      padding: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.warnSoft,
      borderWidth: 1,
      borderColor: c.warn,
      gap: SPACE.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    title: { flex: 1, fontSize: TEXT.body, fontWeight: '800', color: c.text },
    body: { fontSize: TEXT.sub, color: c.text, lineHeight: 20 },
    button: {
      marginTop: SPACE.xs,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.xs,
      paddingVertical: SPACE.md,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accent,
    },
    buttonText: { fontSize: TEXT.body, fontWeight: '800', color: c.accentText },
    plain: { alignSelf: 'center', paddingVertical: SPACE.xs, paddingHorizontal: SPACE.md },
    plainText: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk },
  });
