/**
 * Node から アプリ側の TypeScript を直接読み込むための解決規則。
 *
 * なぜ要るか:
 *   アプリ側は `import { supabase } from './supabase'` のように拡張子を
 *   省いて書く。Metro（Expo のバンドラ）はこれを解決できるが、Node の
 *   ESM は拡張子を必須とするため、そのままでは読み込めない。
 *
 *   検証のためにアプリ側の書き方を変えるのは本末転倒なので、
 *   読み込む側で吸収する。
 *
 * 使い方:
 *   node --import ./tools/ts-resolve-hooks.mjs tools/test-app-data.mjs
 */
import { registerHooks } from 'node:module';

/**
 * React Native 向けの補完（polyfill）で、Node では不要なもの。
 * Node には URL が標準で入っているため、読み込みを空に差し替える。
 * 実体を読ませると React Native の大域変数を触りにいって失敗する。
 */
const STUBBED = new Set([
  'react-native-url-polyfill/auto',
  // 端末のデータベース。Node には存在しないが、読み込み時に触られる
  // わけではないため、空に差し替えれば同居する関数を検証できる。
  'expo-sqlite',
]);

/**
 * React Native 本体。Node では読めない（Flow の記法が入っている）。
 *
 * **なぜ差し替えが要るか**
 *   app/src/lib/supabase.ts が、鍵の取り替えを画面の表裏に合わせるため
 *   AppState を読み込んでいる。ここを通るだけで Node は構文で止まる。
 *   そのため、この検査は気づかれないまま動かなくなっていた。
 *
 * **最小限だけ用意する**
 *   読み込みの時点で触られるものに限る。中身のある実装は置かない。
 *   ここで動いてしまうと、検査が確かめているものが分からなくなる。
 */
const REACT_NATIVE_STUB = [
  "export const Platform = { OS: 'web', select: (o) => o.web ?? o.default };",
  'export const AppState = {',
  '  currentState: "active",',
  '  addEventListener: () => ({ remove: () => {} }),',
  '};',
  'export default { Platform, AppState };',
].join(String.fromCharCode(10));

/**
 * 端末の保存領域。Node には無い。
 *
 * Supabase の認証部品が読み込みの時点で触りにいくため、空では足りない。
 * その場限りの入れ物を用意する。**検査が終われば消える。**
 */
const ASYNC_STORAGE_STUB = [
  'const box = new Map();',
  'const store = {',
  '  getItem: async (k) => (box.has(k) ? box.get(k) : null),',
  '  setItem: async (k, v) => { box.set(k, String(v)); },',
  '  removeItem: async (k) => { box.delete(k); },',
  '  clear: async () => { box.clear(); },',
  '  getAllKeys: async () => [...box.keys()],',
  '  multiGet: async (ks) => ks.map((k) => [k, box.has(k) ? box.get(k) : null]),',
  '  multiSet: async (ps) => { for (const [k, v] of ps) box.set(k, String(v)); },',
  '  multiRemove: async (ks) => { for (const k of ks) box.delete(k); },',
  '};',
  'export default store;',
].join(String.fromCharCode(10));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBBED.has(specifier)) {
      return { url: 'node-stub:' + specifier, shortCircuit: true };
    }
    if (specifier === 'react-native') {
      return { url: 'node-stub-rn:react-native', shortCircuit: true };
    }
    if (specifier === '@react-native-async-storage/async-storage') {
      return { url: 'node-stub-store:async-storage', shortCircuit: true };
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // 相対指定に限って .ts / .tsx を補って再試行する。
      // パッケージ名まで補うと、別物を読み込む事故につながる。
      if (specifier.startsWith('.')) {
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          try {
            return nextResolve(specifier + ext, context);
          } catch {
            // 次の候補へ
          }
        }
      }
      throw error;
    }
  },

  load(url, context, nextLoad) {
    if (url.startsWith('node-stub-rn:')) {
      return { format: 'module', source: REACT_NATIVE_STUB, shortCircuit: true };
    }
    if (url.startsWith('node-stub-store:')) {
      return { format: 'module', source: ASYNC_STORAGE_STUB, shortCircuit: true };
    }
    if (url.startsWith('node-stub:')) {
      return { format: 'module', source: '', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
