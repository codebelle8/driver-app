import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { attachNoticeHost, type Notice } from '@/lib/notice';
import { RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 短い知らせの帯。
 *
 * **押さなくても消える**
 *   伝えるだけの内容なので、閉じる操作を求めない。片手で使う
 *   場面では、その一手が邪魔になる。押せば早く消える。
 *
 * **下に出す**
 *   上には画面ごとの見出しがある。知らせが見出しを隠すと、
 *   いま何の画面にいるのかが一瞬わからなくなる。
 *   親指の届く側でもあるので、消したいときにも都合がよい。
 *
 * **読み上げにも回す**
 *   目で追わずに使う方には、帯が出たことも消えたことも伝わらない。
 *   出た時点で読み上げへ渡す。
 */

/** 出ている時間。写した中身を目で確かめられる程度。 */
const HOLD_MS = 3600;
/** 出入りにかける時間 */
const FADE_MS = 220;

export function NoticeHost() {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;

  useEffect(() => attachNoticeHost(setNotice), []);

  useEffect(() => {
    if (!notice) return;

    if (Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(
        notice.body ? `${notice.title}。${notice.body}` : notice.title,
      );
    }

    /*
      useNativeDriver は false のまま。

      web には端末側の動かす仕組みが無く、true にすると値だけが
      進んで画面が動かない。上の写真の入れ替えで実際に起きた。
    */
    fade.setValue(0);
    lift.setValue(12);
    Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: false }).start();
    Animated.timing(lift, { toValue: 0, duration: FADE_MS, useNativeDriver: false }).start();

    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: false }).start(
        ({ finished }) => {
          // 途中で次の知らせが来ていたら、消さずに譲る
          if (finished) setNotice((now) => (now?.seq === notice.seq ? null : now));
        },
      );
    }, HOLD_MS);

    return () => clearTimeout(timer);
  }, [notice, fade, lift]);

  if (!notice) return null;

  const bad = notice.tone === 'error';

  return (
    // 画面の操作を邪魔しない。帯そのものだけが押せる。
    <View style={s.layer} pointerEvents="box-none">
      <Animated.View style={[s.wrap, { opacity: fade, transform: [{ translateY: lift }] }]}>
        <Pressable
          style={s.card}
          onPress={() => setNotice(null)}
          accessibilityRole="button"
          accessibilityLabel={fill(t.common.closeWith, { title: notice.title })}
        >
          <Ionicons
            name={bad ? 'alert-circle' : 'checkmark-circle'}
            size={20}
            color={bad ? c.danger : c.accent}
          />
          <View style={s.text}>
            <Text style={s.title} numberOfLines={2}>
              {notice.title}
            </Text>
            {!!notice.body && (
              <Text style={s.body} numberOfLines={2}>
                {notice.body}
              </Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      // 下の並び（携帯のタブ）に被らない高さ
      paddingBottom: 96,
      paddingHorizontal: SPACE.lg,
    },
    wrap: { width: '100%', maxWidth: 420 },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.md,
      backgroundColor: c.surface,
      borderRadius: RADIUS.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingVertical: SPACE.md,
      paddingHorizontal: SPACE.lg,
      boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
    },
    text: { flex: 1, gap: 2 },
    title: { fontSize: 14, fontWeight: '600', color: c.text },
    body: { fontSize: 12, lineHeight: 17, color: c.textMuted },
  });
}
