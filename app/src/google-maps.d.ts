/**
 * Google マップの型を読み込む。
 *
 * @types/google.maps は global の `google` を宣言するが、
 * tsconfig の include が src 配下の .ts/.tsx に限られているため
 * 自動では拾われない。ここで明示する。
 */
/// <reference types="google.maps" />
