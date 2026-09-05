import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  DEFAULT_LOCALE,
  dictionaries,
  isLocale,
  type Dictionary,
  type Locale,
} from './dictionaries';

/**
 * いま選ばれている言語を配る。
 *
 * **端末に覚える**
 *   選び直すたびに聞き直すのでは使い物にならない。配色の設定と
 *   同じ場所（端末の中）へ残す。サーバーへは送らない。
 *
 * **端末の設定から推し量らない**
 *   最初は日本語で出す。利用者は日本のドライバーで、端末が英語
 *   設定のまま日本語で使っている方も多い。推し量って外すより、
 *   決まった言語から始めて、変えたい方だけが変えるほうが確実。
 *
 * **読み終えるまで描かない**
 *   端末から読むのは非同期で、待たずに描くと日本語が一瞬出てから
 *   英語へ入れ替わる。配色の切り替えで同じちらつきが起きたため、
 *   同じ作りにしている。
 */

const KEY = 'kn_locale';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** 端末から読み終えたか */
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  ready: false,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (!alive) return;
        if (isLocale(saved)) setLocaleState(saved);
      })
      .catch(() => {
        /* 読めなくても既定の言語で動く */
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    // 書き込みは待たない。失敗しても、この起動の間は選んだ言語で動く。
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, ready }}>
      {children}
    </LocaleContext.Provider>
  );
}

/** いまの言語と、切り替える手立て */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** いまの言語の文言 */
export function useT(): Dictionary {
  return dictionaries[useContext(LocaleContext).locale];
}
