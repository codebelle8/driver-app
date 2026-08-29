import { ComingSoon } from '@/components/coming-soon';

export default function HistoryScreen() {
  return (
    <ComingSoon
      icon="time"
      title="履歴"
      body={'調べた施設を新しい順に並べます。\n同じ施設へ何度も向かう際の呼び出しに使います。'}
    />
  );
}
