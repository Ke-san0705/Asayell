# アサエール 開発設計書 v2（ラウンド2: Supabase差し替え・2端末対応）2026-11-28

前提：ラウンド1（localStorage版P0）は完了・公開済み（https://ke-san0705.github.io/Asayell/ ）。設計v1（docs/design-v1.md）の体験・画面・制約はそのまま維持し、データ保存だけを差し替える。

## 1. 目的
- 別端末から応援を投稿できるようにする（仕様の受け入れテスト T02・T06 の完全実施）
- SW富士4th のヒアリングで「送る側」の体験を検証できる状態にする

## 2. 保存先の決定（2026-11-28 本人決定）
- 計算無双の Supabase プロジェクト（ref: yyeaeewfqamdtiprshdd、東京）に相乗りする
- テーブル・関数はすべて `asayell_` 接頭辞で分離し、計算無双のランキングには一切触れない
- 接続値（Project URL と anon key）は公開クライアント用の値であり、クライアント設定として保持する。service_role キーは使わない

## 3. DB設計（SQLは Muse 作成・リポジトリに配置済み）
- ファイル: `supabase/migrations/20261128000000_asayell_foundation.sql`
- テーブル: `asayell_goals` / `asayell_messages`。RLS有効化し、anon への直接ポリシーは付けない（テーブル直接アクセス不可）
- アクセスは全て RPC（security definer）経由：
  - `asayell_create_goal(nickname, title, detail, wake_at, support_token, owner_token)` → 作成した goal を返す。文字数制約を DB 側でも検証
  - `asayell_get_goal_for_support(support_token)` → 応援画面用に goal の公開項目のみ返す（メッセージは返さない）
  - `asayell_post_message(support_token, sender, body)` → 投稿。body 1〜150文字を検証
  - `asayell_get_owner_goal(owner_token)` → goal 情報＋応援件数＋解禁済みかを返す（本文は返さない）
  - `asayell_get_owner_messages(owner_token, demo)` → 解禁後（または demo=true のとき）だけ本文を返す。解禁前は空
- 適用は本人が Supabase SQL Editor で SQL を実行する（1回のみ）

## 4. クライアント実装（Codex）
- `SupabaseRepository` を実装し、既存の `AsayellRepository` インターフェースに合わせる。アクセスは REST の RPC 呼び出し（`POST /rest/v1/rpc/<fn>`、apikey + Authorization ヘッダ）。supabase-js の追加は不要（軽量維持）
- データソースは環境変数 `VITE_ASAYELL_REPOSITORY`（`supabase` / `local`）で切り替え、デフォルトは `supabase`。接続値は `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（未設定時は相乗りプロジェクトの公開値をフォールバックとして設定ファイルに保持）
- GitHub Pages のビルドでも同じ設定が効くこと（フォールバック値で動作する）
- デモモードは従来どおり受信画面の導線から使い、RPC の demo 引数で解禁を再現する。本人トークンを持つ人だけが読める点は変わらない

## 5. 受入条件
- T02: 端末Aで目標登録 → 応援URLを端末Bで開いて投稿 → 端末Aの受信画面（解禁後／デモ）で読める
- T06: 応援URLからはメッセージ本文が読めない。解禁前は本人でも本文が読めない（デモ除く）
- ラウンド1の受け入れ（T01・T03・T04・T05）が Supabase モードでも引き続き通る
- テスト・lint・build 合格

## 6. 評価ルーブリック
設計v1 §9 と同一（体験の成立25／仕様適合性25／UI20／コード品質・保守性15／テスト・堅牢性15、総合85以上・各項目70%以上）。不合格条件に「service_role キーの使用」「テーブルへの直接アクセス（RPC経由でない）」「計算無双の既存テーブル・関数への変更」を追加する。

## 7. Issue分解
- R2-01: SupabaseRepository 実装とデータソース切替（前提：SQL適用。未適用でも実装は進め、検証は適用後）
- R2-02: 2端末統合テスト（T02・T06）と公開確認（前提：R2-01 と SQL 適用）
