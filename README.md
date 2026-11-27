# アサエール (ASAYELL)

「誰かのエールが、明日を楽しみに変える。」

夢・目標と起床予定時刻を登録すると、仲間からの応援メッセージが翌朝に届くWebアプリ。
Startup Weekend 富士 4th で考案されたプロトタイプを、GitHub Issue駆動のAI開発（Codex実装／Gemini評価／Claude統括）で開発中。

## 仕様
- 正本仕様: Startup Weekend 富士 4th プロトタイプ開発仕様書 v0.1（2026-11-27）
- 開発設計: [docs/design-v1.md](docs/design-v1.md)

## 現在のスコープ（ラウンド1）
- データ保存は localStorage のみ（P0先行）。データ層はインターフェースで分離し、将来 Supabase へ差し替え可能にする
- 画面: 目標登録 / 共有 / 応援投稿 / 翌朝の受信（デモモード付き）
