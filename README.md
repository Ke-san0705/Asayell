# アサエール (ASAYELL)

「誰かのエールが、明日を楽しみに変える。」

夢・目標と起床予定時刻を登録すると、仲間からの応援メッセージが翌朝に届くWebアプリ。
Startup Weekend 富士 4th で考案されたプロトタイプを、GitHub Issue駆動のAI開発（Codex実装／Gemini評価／Claude統括）で開発中。

## 仕様
- 正本仕様: Startup Weekend 富士 4th プロトタイプ開発仕様書 v0.1（2026-11-27）
- 開発設計: [docs/design-v2.md](docs/design-v2.md) / [ラウンド1の画面・体験](docs/design-v1.md)

## 現在のスコープ（ラウンド2）
- Supabase RPC で目標とエールを保存し、別の端末から応援できます。
- 画面: 目標登録 / 共有 / 応援投稿 / 翌朝の受信（デモモード付き）

## 開発

Node.js 24 を使用します。

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

開発サーバーでは `/Asayell/` を開きます。

- 既定のデータソースは Supabase です。接続先を指定する場合は `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` に公開クライアント用の値を設定します。未設定時はアプリ内の公開設定を使います。
- Supabase モードで登録・投稿・受信を行うには、接続先に [基盤 SQL](supabase/migrations/20261128000000_asayell_foundation.sql) を適用しておきます。
- ブラウザ内で完結させる場合は `VITE_ASAYELL_REPOSITORY=local` を指定します。`npm run test:e2e` は local モードと、RPC 応答をテスト内で再現する Supabase モードの両方で実行します。Supabase モードの応援投稿は、登録側とストレージを共有しないブラウザコンテキストで行います。

## GitHub Pages

初回はリポジトリの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択します。以降、`main` への更新で `dist/` を公開します。共有・応援・受信の URL を直接開くと、GitHub Pages の `404.html` を経由して各画面が表示されます。

公開サイトで T01〜T06 を確認する場合は、次のコマンドを実行します。

```sh
npx playwright install chromium
ASAYELL_TEST_PAGES=1 npm run test:e2e
```

公開サイトのテストは Supabase に検証用の目標とエールを作成します。後で削除できるよう、実行ログの `Supabase acceptance goal id` を記録してください。T02 の本文受信はデモモードで確認します。
