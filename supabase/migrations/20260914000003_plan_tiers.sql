-- =============================================================================
-- 料金の刻みを4つにする
--
-- ご指示（2026-09-14）
--     1か月   4,000円
--     3か月  11,000円
--     6か月  21,000円
--     1年    40,000円
--
-- これまでは 1か月 と 1年 の2つだけで、列の制約もその2つに縛ってあった。
-- 増やした値を書き込めるように、制約を張り替える。
--
-- **金額はここに入れない。** 画面の但し書き（「◯か月ぶん」など）と
-- 一緒に変わるため、アプリ側の1か所（app/src/lib/plans.ts）で持つ。
-- ここが持つのは「どの刻みを選んだか」だけ。
--
-- **すでに選ばれている値は残る。**
--   monthly と yearly は引き続き通る。選び直していただく必要は無い。
-- =============================================================================

alter table public.driver_profiles
  drop constraint if exists driver_profiles_plan_check;

alter table public.driver_profiles
  add constraint driver_profiles_plan_check
  check (plan is null or plan in ('monthly', 'quarterly', 'half', 'yearly'));
