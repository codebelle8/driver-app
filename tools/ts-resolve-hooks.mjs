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

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBBED.has(specifier)) {
      return { url: 'node-stub:' + specifier, shortCircuit: true };
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
    if (url.startsWith('node-stub:')) {
      return { format: 'module', source: '', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
