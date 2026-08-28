// Metro（Expo のバンドラ）の設定。
//
// expo-sqlite は Web 版で WebAssembly (.wasm) を読み込む。
// Metro は既定で .wasm を扱えず、次のように解決に失敗する:
//
//   Unable to resolve module ./wa-sqlite/wa-sqlite.wasm
//
// ファイル自体は node_modules に存在しており、拡張子を
// 「資材 (asset)」として登録すれば解決できる。
//
// なお、この不具合は Web の静的描画でのみ現れ、
// iOS / Android の動作には影響しない。
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

module.exports = config;
