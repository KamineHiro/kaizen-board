# 業務改善ボード（仮称）

日々の困りごとをその場で溜め、チームで返信し合える改善ボード。AIは裏方で難易度タグだけ付ける。

詳しい背景・要件は [requirements.md](./requirements.md)、画面・DB・RLS設計は [design.md](./design.md)、実装タスクの進捗は [tasks.md](./tasks.md) を参照。

## セットアップ

前提: Node.js 20.9以上（22 LTS推奨）、Docker（ローカルSupabaseの起動に使用）。

```bash
npm install

# ローカルSupabase（Postgres + Auth等）をDockerで起動
npx supabase start
```

`supabase start` の出力に表示される `API_URL` / `ANON_KEY` を `.env.local` に設定する（`.env.local.example` をコピーして使う）。

```bash
cp .env.local.example .env.local
```

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start の出力から>
ANTHROPIC_API_KEY=<Anthropic Consoleで発行したキー>
```

`ANTHROPIC_API_KEY` が無くても他の画面は動くが、`/capture` からの投稿時（AI難易度判定）はエラーになる。

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。未ログイン時は自動的に `/login` へリダイレクトされる。

### ローカルDBをスキーマ変更後に作り直す

マイグレーション（`supabase/migrations/`）やシード（`supabase/seed.sql`）を変更したら、以下でローカルDBを作り直す。

```bash
npx supabase db reset
```

## 認証・権限モデル

越境事故（他社のデータが見える/書き込める）を構造的に防ぐことを最優先に設計している。触る前に以下を把握しておくこと。詳細は [design.md §3](./design.md)。

- **`public.users` 行の作成経路は `accept_invite()`（SECURITY DEFINER関数）一本のみ。** `users` への直接INSERTを許可するRLSポリシーは存在しない（意図的に撤去済み）。新しいサインアップ手段を足すときも、この関数を経由させること。
- **`role` / `company_id` はユーザー入力から一切取らない。** `company_invites`（招待コード）テーブルの該当行から `accept_invite()` が決定する。サインアップフォームに「会社選択」や「role選択」を足すのは越境の再発になるため厳禁。
- **越境防止はRLSポリシーだけでなく、テーブルGRANTとの二層で担保している。** `supabase/migrations/20260711000005_table_grants.sql` で `authenticated` ロールに対し、各テーブルのRLSポリシーと過不足なく一致する最小のGRANT（SELECT/INSERT等）のみを付与している。新しいテーブルを足すときはRLSポリシーだけでなくGRANTも必ずセットで書くこと（GRANTが無いとRLS以前に "permission denied for table" で弾かれ、逆にRLSだけ書いてGRANTを既存の広い付与に頼ると想定外の権限が漏れる）。
- **シードでsupporterを`auth.users`に直接投入する際は、`confirmation_token`等のtext列をNULLではなく空文字列で埋めること。** NULLのままだとGoTrueが `Database error querying schema` でログイン不能になる（`sql: Scan error ... converting NULL to string is unsupported`）。`supabase/seed.sql` を参照。

越境アクセスのテストは `supabase/tests/rls_cross_tenant.sh` で実行できる（`supabase start` 済みで `supabase/seed.sql` が投入されている状態が前提）。

```bash
bash supabase/tests/rls_cross_tenant.sh
```

design.md §3.4 の11項目（自社/他社間のissues・commentsのselect/insert、supporterの横断閲覧、招待コードの検証・越境防止）をGoTrue認証→PostgREST→RPCという実クライアントと同じHTTP経路で検証し、PASS/FAILを表示する。

## 環境変数

| 変数名 | 用途 | 参照元 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのAPI URL | `src/lib/supabase/client.ts` / `server.ts`、`src/proxy.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseの匿名（anon）キー。クライアントにも露出するがRLSで保護される | 同上 |
| `ANTHROPIC_API_KEY` | AI難易度判定に使うAnthropic APIキー。サーバー専用（`NEXT_PUBLIC_`を付けない） | `src/lib/anthropic.ts` |

いずれも `.env.local`（gitignore対象）に設定する。キー名のみ `.env.local.example` に記載している。

## ディレクトリ構成

主要ファイルの役割はファイル冒頭のコメントを参照。全体像は [design.md §5](./design.md) を参照。

```
src/
  app/          # 画面・Route Handler（App Router）
  lib/supabase/ # Supabaseクライアント（ブラウザ用・サーバー用）
  lib/anthropic.ts # AI難易度判定
  components/   # 共有UIコンポーネント
  proxy.ts      # 認証ガード（Next.js 16のmiddleware→proxyリネーム対応）
supabase/
  migrations/   # DBスキーマ・RLSポリシー
  seed.sql      # 開発用シード（サンプル企業・初回supporter・招待コード）
  tests/        # RLS越境アクセステスト
```
