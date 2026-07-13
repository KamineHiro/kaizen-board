# タスク分解 — 業務改善ボード（仮称）

[design.md](./design.md) 承認後、この順で1タスク=1コミット相当で実装する。各タスク完了ごとに変更点を3行以内で要約し、次へ進んでよいか確認する。

## セットアップ

- [x] **T1. Next.jsプロジェクトのscaffold**
  `create-next-app@latest` で Next.js 16 / TypeScript / App Router / Tailwind / `src/` ディレクトリ構成を作成。不要なサンプルコードを削除。

- [x] **T2. Supabaseローカルプロジェクトの初期化**
  `supabase init` でローカルSupabase環境を用意。`supabase/config.toml` をコミット対象に。

- [x] **T3. DBスキーマのマイグレーション作成**
  design.md §2 のコアDDL（`companies` / `users` / `issues` / `comments` / enum）をマイグレーションファイルとして作成。ローカルSupabaseに適用して疎通確認。

- [x] **T4. RLSポリシーのマイグレーション作成**
  design.md §3.1 のヘルパー関数（`current_company_id` / `is_supporter`）と§3.3の各テーブルポリシーをマイグレーションとして作成・適用。

- [x] **T5. 開発用シード投入**
  ローカル開発・動作確認のため `companies` に数件のサンプル企業データを投入するシードスクリプト（`supabase/seed.sql`）を作成。

- [x] **T6. Supabaseクライアントのセットアップ**
  `src/lib/supabase/client.ts`（ブラウザ用）・`src/lib/supabase/server.ts`（サーバー用、cookiesベースセッション）を実装。`.env.local.example` を作成（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `ANTHROPIC_API_KEY`）。`.env.local` は`.gitignore`済みであることを確認。

## 認証基盤の是正（v1.1: 招待コード方式）

RLSレビューで、自己登録だと role/company_id を自己申告でき越境が仕様として残ることが判明（requirements.md v0.5）。
T3〜T4で作った直挿し前提の一部（`users`への直接INSERT、`companies_select`のusing(true)）を、招待コード方式に置き換える。
**T10（サインアップ画面）より前に完了させること。**

- [x] **T7. company_invitesテーブルの追加マイグレーション**
  design.md §2 の `company_invites`（`code` / `company_id` / `role` / `expires_at` / `created_by` / `created_at`、`code`はunique、使用済みフラグは持たない）をマイグレーションとして追加・適用。

- [x] **T8. 招待コード検証関数とRLS改修**
  design.md §3.2 の `accept_invite(invite_code, user_name)`（SECURITY DEFINER、コード存在＋`expires_at > now()`を検証してから`users`にinsert）を追加。
  design.md §3.3 の通り、`users` への直接INSERTポリシー（`users_insert_self`）を撤去し、`company_invites` の select/insert ポリシー（supporterのみ）を追加、`companies_select` を「自社1行 or supporter全件」に縮小。マイグレーションとして適用し、`grant execute ... to authenticated` まで含めて疎通確認。

- [x] **T9. 招待コードシードと初回supporter投入**
  design.md §2備考の通り、最初のsupporter1件を `auth.users` + `public.users` に直接シード投入（招待コード発行者の鶏卵を断つ）。動作確認用の `company_invites` を数件（有効期限内・期限切れの両方を含む）投入し、`supabase/seed.sql` を更新。

## 認証

- [x] **T10. ログイン画面**
  `/login` — メール/パスワードでSupabase Authにサインイン。成功後、`users.role` を見て `/board` または `/supporter` へリダイレクト。

- [x] **T11. サインアップ画面（招待コード方式）**
  `/signup` — 招待コード・氏名・メール/パスワード入力（会社選択ドロップダウンは廃止）。Supabase Authでサインアップ後、`accept_invite(invite_code, user_name)` をrpc呼び出し。無効・期限切れコードで失敗した場合はエラー表示する。Authユーザーは作成済みだが`public.users`行が無い状態になり得ることに留意し、その状態からの再試行導線を用意する。

- [x] **T12. 認証ガード・レイアウト**
  未ログイン時は `/login` にリダイレクトするミドルウェア（Next.js 16では `proxy.ts`）を実装。ログイン済みユーザー情報をレイアウトから取得できるようにする。`public.users`行が無い（サインアップ未完了）ケースの扱いも決める。

## 機能実装

- [x] **T13. 課題捕捉フォーム（F-1）**
  `/capture` — `raw_input`（必須）・`frequency`（任意）・`time_per_occurrence`（任意）を入力するフォーム。送信で `POST /api/issues` を呼ぶ。

- [x] **T14. AI難易度タグ判定＋課題保存API（F-2, F-4）**
  `src/app/api/issues/route.ts` — design.md §4 の通り、サーバー側でAnthropic APIを1回呼び出し `ai_difficulty` を決定し、`issues` にinsert。`src/lib/anthropic.ts` に判定ロジックを切り出す。

- [x] **T15. 自社ボード一覧（F-5前半）**
  `/board` — 自社の `issues` を難易度・頻度でソート表示。各カードから `/board/[id]` へ遷移。「＋困りごとを投稿」ボタンで `/capture` へ。

- [x] **T16. 課題詳細＋返信（F-3）**
  `/board/[id]` — 課題本文・難易度・頻度・所要時間の表示、コメント一覧表示、返信フォーム（クライアントから直接Supabaseにinsert、RLSで保護）。

- [x] **T17. 支援者向け企業横断一覧（F-5後半）**
  `/supporter` — role='supporter'のみアクセス可。全企業の `issues` を企業名でフィルタ・難易度/頻度でソート表示。

## 検証・仕上げ

- [x] **T18. RLS越境アクセスのテスト**
  design.md §3.4 の11項目（従来の5項目: 他社issue select拒否・他社宛てissue insert拒否・他社issueに紐づくcomment select拒否・他社issueへのcomment insert拒否・supporterの横断閲覧、＋招待コード関連6項目: users直接insert拒否・company_invitesの一般ユーザーアクセス拒否・supporterのcompany_invitesアクセス許可・無効/期限切れコードでのaccept_invite失敗・有効コードでのrole/company_id決定・招待コード経由サインアップ後も越境しないこと）を、テストコードまたはSQLスクリプトで検証し、結果を記録する。

- [x] **T19. README・環境変数ドキュメント整備**
  セットアップ手順（`supabase start` / `npm run dev` / 環境変数一覧、招待コードの発行方法）をREADMEに記載。各主要ファイルの役割コメントが入っていることを確認。

---

## 対象外（実装しない・スコープ厳守）

要件 §3.3「含まない」に該当するため、以下はどのタスクでも作らない: 音声入力、PWA/オフライン対応、AIの聞き返し、自動試作生成、ステータス管理・アサイン・進捗トラッキング、通知・リマインド、Supabase Realtimeによるライブ反映、組織図・部署・細かいRBAC等の本格的な権限管理。

`company_invites` による招待コード登録は v0.5 でスコープに例外的に含めたが、以下は引き続き対象外: コードの使用回数制限・使用済みフラグ、コードの更新（有効期限延長）・無効化（削除）、招待コード発行UI以外の管理画面。
