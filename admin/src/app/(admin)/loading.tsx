import { SteeringLoader } from '@/components/steering-loader';
import { getDictionary } from '@/lib/i18n/server';

/** 画面の読み込み中に表示される。 */
export default async function Loading() {
  const t = await getDictionary();
  return <SteeringLoader label={t.common.loading} />;
}
