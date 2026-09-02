/**
 * アプリの設定。
 *
 * app.json の内容を Expo から受け取り、鍵だけを環境変数から差し込む。
 *
 * **なぜ app.json に直接書かないか**
 *   app.json は Git に入る。Google の鍵を書けば、リポジトリを見た人
 *   全員が使える状態になる。鍵は .env.local に置き、ここで注入する。
 *
 *   （アプリに埋め込まれる以上、解析すれば取り出せる点は変わらない。
 *     防御は Google Cloud 側の API 制限と割り当て上限が担う。
 *     ここで避けているのは「リポジトリ経由の流出」という別経路。）
 */
module.exports = ({ config }) => {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return config;

  return {
    ...config,
    android: {
      ...config.android,
      config: { ...config.android?.config, googleMaps: { apiKey: key } },
    },
    ios: {
      ...config.ios,
      config: { ...config.ios?.config, googleMapsApiKey: key },
    },
  };
};
