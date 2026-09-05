import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { RADIUS } from '@/theme';
import { useTheme, useThemeControl } from '@/theme-context';

/**
 * 明るい／暗いの切り替え。管理画面と同じ二択にしている。
 *
 * 記号は「押すとどうなるか」を示す。暗い表示のときは太陽（明るくする）、
 * 明るい表示のときは月（暗くする）。現在の状態ではなく行き先を出すほうが、
 * 一目で用途が分かる。
 */
export function ThemeToggle() {
  const c = useTheme();
  const { theme, toggle } = useThemeControl();

  const t = useT();
  const next = theme === 'dark' ? t.mypage.light : t.mypage.dark;

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={[styles.button, { borderColor: c.border }]}
      accessibilityRole="button"
      accessibilityLabel={fill(t.mypage.themeSwitch, { next })}
    >
      <Ionicons
        name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'}
        size={20}
        color={c.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
