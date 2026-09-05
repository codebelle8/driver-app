-- =============================================================================
-- 施設データの英語欄を足す
-- =============================================================================
-- なぜ要るか:
--   アプリに日本語／英語の切り替えを入れた。画面の文言（ボタン・見出し）は
--   アプリ側の辞書で切り替わるが、施設名・住所・進入方法の説明は
--   発注元が入力したデータで、辞書には入らない。
--
--   英語表示にしても中身が日本語のままだと、
--   「画面の枠は英語、肝心の案内は日本語」という半端な状態になる。
--   ドライバーが本当に読みたいのは進入方法のほうで、そこが読めなければ
--   切り替えの意味がない。
--
-- なぜ別表ではなく列にするか:
--   扱う言語は日本語と英語の2つで、対象の項目も決まっている。
--   翻訳用の表を作ると、アプリが端末へ取り込むときに結合が要る。
--   取り込みは全件を一度に落とす作りで、結合が入ると段が増える。
--   3言語目が必要になった時点で作り直すほうが、今の複雑さより安い。
--
-- 空のままでよい:
--   すべて NULL を許す。英訳が入っていない項目は、アプリ側が
--   日本語へ落とす。193件の英訳が揃うまで英語表示を止める、
--   という作りにはしない。半分でも読めるほうが役に立つ。
-- =============================================================================

alter table public.facilities
  add column if not exists name_en text,
  add column if not exists prefecture_en text,
  add column if not exists city_en text,
  add column if not exists address_line_en text,
  add column if not exists summary_en text;

comment on column public.facilities.name_en is
  '施設名の英語表記。正式な英名があるものはそれを使う（帝国ホテル東京 → Imperial Hotel Tokyo）。';
comment on column public.facilities.address_line_en is
  '町丁目の英語表記。英語では市区町村・都道府県より先に置くため、並べ替えはアプリ側で行う。';

alter table public.entry_points
  add column if not exists name_en text,
  add column if not exists approach_text_en text,
  add column if not exists approach_from_en text;

comment on column public.entry_points.approach_text_en is
  '進入方法の説明の英語。ここがこのアプリの中心。読めなければ切り替えの意味がない。';

alter table public.cautions
  add column if not exists body_en text;

alter table public.categories
  add column if not exists name_en text;

-- 公開しているものと同じ範囲で読めるようにする。
-- 既存の行レベルの決まりは表ごとに掛かっているため、
-- 列を足しただけで新しい決まりは要らない。
