import { TaxiLoader } from '@/components/taxi-loader';
import { getDictionary } from '@/lib/i18n/server';

/**
 * 画面の読み込み中に表示される。
 * タクシーが左端から右端へ走り切るまでが、そのまま読み込み時間になる。
 */
export default async function Loading() {
  const t = await getDictionary();
  return <TaxiLoader label={t.common.loading} />;
}
