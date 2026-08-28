import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './theme';

/**
 * 表示テーマの管理。
 *
 * 管理画面と同じく「明るい／暗い」の二択にしている。
 * 端末の設定に従う第三の選択肢を置かないのは、走行前の短い時間に
 * 三択を出すと迷う要因になるため。初回だけ端末の設定を引き継ぐ。
 *
 * 端末に保存する理由:
 *   このアプリは夜間の車内で使われる。夜に暗い表示へ切り替えた人が、
 *   翌晩も明るい画面をまた消す羽目になっては意味がない。
 */
export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'kn_theme';

interface ThemeContextValue {
  theme: ThemeName;
  colors: Palette;
  toggle: () => void;
  /** 保存済みの設定を読み終えたか。読み込み前は端末の設定で描く。 */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // 端末の設定を初期値にする。保存済みの設定があれば後で上書きする。
  const [theme, setTheme] = useState<ThemeName>(system === 'light' ? 'light' : 'dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!alive) return;
        if (saved === 'light' || saved === 'dark') setTheme(saved);
      })
      // 読めなくても既定の配色で動く。ここで止める理由がない。
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: ThemeName = current === 'dark' ? 'light' : 'dark';
      // 保存の完了を待たずに切り替える。待つと「押したのに変わらない」
      // という印象になる。保存に失敗しても表示は正しく切り替わる。
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, colors: palettes[theme], toggle, ready }),
    [theme, toggle, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 配色を取り出す。画面はこれだけを使う。 */
export function useTheme(): Palette {
  const ctx = useContext(ThemeContext);
  // 万一 Provider の外で呼ばれても、暗い配色で描いて画面を壊さない
  return ctx?.colors ?? palettes.dark;
}

/** 切り替えボタンなど、テーマそのものを扱う箇所で使う */
export function useThemeControl(): Pick<ThemeContextValue, 'theme' | 'toggle' | 'ready'> {
  const ctx = useContext(ThemeContext);
  return ctx ?? { theme: 'dark', toggle: () => {}, ready: true };
}
