# 設計書 — 業務改善ボード（仮称）

- 元になる正典: [requirements.md](./requirements.md)（特に §3.3 MVPスコープ、§7 データモデル、§8 技術構成を厳守）
- ステータス: Draft v1.1（SDD第二フェーズ / 設計。RLSレビューで判明した越境穴を招待コード方式で塞ぐ）
- 本書のゴール: 実装に着手できる粒度まで画面・DB・RLS・AI呼び出しを固める

### 変更履歴
- **v1.1**: requirements.md v0.5に追従。自己登録（企業ドロップダウン選択）だと role/company_id を自己申告でき、
  (1) supporterを自称して全社横断閲覧、(2) 他社company_idを指定してそのボードを閲覧、という越境が仕様として残ることが判明。
  `company_invites` による招待コード登録に置き換え、`users` への直挿しINSERTポリシーを撤去。`companies_select` も
  `using(true)` から自社+supporterのみに縮小。詳細は §0・§1・§2・§3。

## 0. 前提・決定事項（ユーザー承認済み）

要件定義書 §9 の未決事項のうち、実装に必須な3点をユーザーに確認し、以下で確定した。

| 項目 | 決定 |
|---|---|
| AI難易度タグのLLM | Anthropic Claude Haiku 4.5（`claude-haiku-4-5`）。1課題1回・軽量プロンプトの要件に対して速度とコストのバランスが良い |
| サインアップ時のcompany_id/role割当（v1.1で更新） | `company_invites`（code, company_id, role, expires_at）による招待コード登録に一本化。ユーザーはコード + 氏名 + メール/パスワードのみ入力し、role・company_idはコードから決まる（ユーザー入力からは取らない）。コードはcompany単位の使い回し＋有効期限つき、使用済みフラグは持たない。最初のsupporter1件のみシードで直接投入（招待コード発行者の鶏卵を断つ）。理由・詳細は requirements.md §3.2・§8・§9(v0.5) |
| `issues.frequency` の型 | 自由入力テキスト（例:「毎日」「週3回」）。構造化・enum化はしない |

環境確認: `node --version` → v20.19.4。§8の「20以上」は満たす（22 LTS推奨だが必須ではないためこのまま進める）。

## 1. 画面遷移

```
/login（ログイン・サインアップ）
  ├─ ログイン成功 → role='supporter'         → /supporter
  └─ ログイン成功 → role='employee'|'leader'  → /board

/signup（新規登録: 招待コード + 氏名 + メール/パスワード）
  ├─ Supabase Authでサインアップ後、`accept_invite(code, name)`（SECURITY DEFINER関数）をRPC呼び出し
  │     コードが無効・期限切れなら失敗を表示しユーザー行は作られない（company_id/roleはコードが決定し、ユーザー入力からは取らない）
  └─ 登録成功 → /loginと同じrole分岐でリダイレクト（招待コードのroleがsupporterなら/supporter、それ以外は/board）

/board（自社ボード一覧）※role='employee' | 'leader'
  ├─ 「＋困りごとを投稿」ボタン → /capture
  │     └─ 送信成功 → /board に戻り一覧へ反映
  └─ 課題カードをクリック → /board/[id]（課題詳細+返信）

/board/[id]（課題詳細+返信）※employee・leader・supporterいずれもアクセス可（RLSで許可された範囲のみ）
  ├─ 課題本文・難易度タグ・頻度・所要時間を表示
  ├─ コメント一覧を表示
  └─ 返信フォーム送信 → 同画面内でコメント一覧に反映

/capture（課題の捕捉）※employee・leader
  ├─ 入力: raw_input（必須）, frequency（任意・自由記述）, time_per_occurrence（任意・分）
  └─ 送信 → サーバー側でLLMを1回呼び出し ai_difficulty を決定 → issues insert → /board へリダイレクト

/supporter（支援者向け企業横断一覧）※role='supporter'
  ├─ 企業フィルタ・難易度/頻度ソート
  └─ 課題カードをクリック → /board/[id]（同じ詳細画面。RLSにより全企業アクセス可）
```

補足:
- `/capture` は `/board` からの遷移のみで、支援者(`supporter`)は捕捉不可（requirements.md v0.5 §3.2で支援者の捕捉列は「✕（将来）」に確定。company_idを持たない横断ロールのため投稿先が定まらず、MVPでは返信のみ）。
- ステータス管理・通知・音声入力・PWA・リアルタイム反映は実装しない（§3.3「含まない」）。

## 2. DBスキーマ（DDL）

Supabaseのマイグレーション（`supabase/migrations/xxxx_init_schema.sql`）に以下を記述する。

```sql
-- 拡張（Supabaseはデフォルトでpgcrypto有効。gen_random_uuid()が使える）

create type user_role as enum ('employee', 'leader', 'supporter');
create type difficulty_level as enum ('低', '中', '高');

-- 企業（company_idの参照先。名前のみの最小テーブル）
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ユーザー（auth.usersと1:1）
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id), -- supporterはnull可
  role user_role not null default 'employee',
  name text not null,
  created_at timestamptz not null default now()
);

-- 課題
create table issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  raw_input text not null,
  frequency text, -- 自由記述。任意
  time_per_occurrence integer, -- 分単位。任意
  ai_difficulty difficulty_level not null, -- サーバーが保存時に確定させるためnot null
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- 返信（コメント）
create table comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index issues_company_id_idx on issues(company_id);
create index comments_issue_id_idx on comments(issue_id);

-- 招待コード（v1.1で追加）: サインアップ時のrole/company_id割当を自己申告させないための唯一の経路。
-- company単位の使い回し前提のため「使用済み」フラグは持たない。失効はexpires_atのみで判定する。
create table company_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  company_id uuid not null references companies(id),
  role user_role not null,
  expires_at timestamptz not null,
  created_by uuid not null references users(id), -- 発行したsupporter
  created_at timestamptz not null default now()
);

create index company_invites_code_idx on company_invites(code);
```

備考:
- `ai_difficulty` は `not null`。§8「保存時にサーバー側で1課題1回だけLLMを呼ぶ」の通り、Route Handlerが必ずLLM呼び出し結果（失敗時はフォールバック値「中」）を伴ってからinsertするため、DB上はnot null制約で保存漏れを防ぐ。
- `frequency` / `time_per_occurrence` はユーザー承認済みの通り任意カラム。
- ステータス・アサイン・進捗系カラムは要件外のため作成しない。
- `company_invites.created_by` は `users(id)` を参照するため、最初のsupporterはシードでusers行を直接作ってから初回の招待コードを発行する（§3.4）。招待コードの失効延長・無効化（更新/削除）はMVP対象外（§6）。

## 3. RLSポリシー

マルチテナント分離が最重要要件のため、`issues` / `comments` は必ず `company_id` スコープで絞り、`supporter` のみ横断を許可する。企業をまたぐ漏洩がないことをテストで確認する（§4 参照）。

### 3.1 ヘルパー関数（SECURITY DEFINERでusersテーブルの再帰RLSを回避）

```sql
create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from users where id = auth.uid();
$$;

create or replace function public.is_supporter()
returns boolean
language sql stable security definer set search_path = public as $$
  select role = 'supporter' from users where id = auth.uid();
$$;
```

### 3.2 サインアップ関数（招待コード検証、v1.1で追加）

`users` 行の作成は、この関数経由のみに限定する（直挿しRLSポリシーは撤去。§3.3）。
`security definer` かつテーブル所有者（`postgres`）実行のため、内部の `select` / `insert` は
`company_invites` / `users` のRLSをバイパスする。これにより一般ユーザーに `company_invites` への
直接SELECT権限を与えずに済む（§3.3参照）。

```sql
create or replace function public.accept_invite(invite_code text, user_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_invite company_invites%rowtype;
begin
  select * into v_invite
  from company_invites
  where code = invite_code
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired invite code';
  end if;

  insert into users (id, company_id, role, name)
  values (auth.uid(), v_invite.company_id, v_invite.role, user_name);
end;
$$;

grant execute on function public.accept_invite(text, text) to authenticated;
```

呼び出し元（`/signup`）は、Supabase Authでサインアップ（`auth.signUp`）が成功した直後に
`supabase.rpc('accept_invite', { invite_code, user_name })` を呼ぶ。失敗（無効・期限切れコード）
時は例外が返るため、UIでエラー表示する。`users` 行が作られないままだと以降のRLSポリシー
（`current_company_id()` 等）が全てnull/false相当になるため、サインアップ完了まではボード等へ
遷移させない。

### 3.3 各テーブルのポリシー

```sql
alter table companies enable row level security;
alter table users enable row level security;
alter table issues enable row level security;
alter table comments enable row level security;
alter table company_invites enable row level security;

-- companies: 自社の1行 or supporterは全件参照可（v1.1でusing(true)から縮小。会社リストの露出を防ぐ。
-- 一般ユーザーはボード等で自社名を表示できれば足り、他社の存在自体を知る必要がない）
create policy companies_select on companies
  for select to authenticated
  using (
    id = current_company_id()
    or is_supporter()
  );

-- users: 自分自身 / 同一企業 / supporterは全件参照可（同一企業内で名前を表示するため）
create policy users_select on users
  for select to authenticated
  using (
    id = auth.uid()
    or company_id = current_company_id()
    or is_supporter()
  );

-- users: 直接INSERTは許可しない（v1.1で撤去）。行の作成は accept_invite() 経由のみ（§3.2）。
-- 理由: 直挿しを許すと role/company_id をユーザーが自己申告でき、supporter自称や他社company_id指定による
-- 越境が可能になっていた（requirements.md v0.5 §3.3参照）。

-- company_invites: supporterのみ発行(insert)・閲覧(select)可。一般ユーザーへの直接SELECTは与えない
-- （サインアップ時のコード検証は accept_invite() がSECURITY DEFINERで内部的に行う）
create policy company_invites_select on company_invites
  for select to authenticated
  using (is_supporter());

create policy company_invites_insert on company_invites
  for insert to authenticated
  with check (is_supporter());

-- issues: 自社の課題 or supporterは全件参照可
create policy issues_select on issues
  for select to authenticated
  using (
    company_id = current_company_id()
    or is_supporter()
  );

-- issues: 自社宛て・自分が投稿者としてのみ作成可
create policy issues_insert on issues
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and created_by = auth.uid()
  );

-- comments: 閲覧可能なissueに紐づくもののみ参照可
create policy comments_select on comments
  for select to authenticated
  using (
    exists (
      select 1 from issues i
      where i.id = comments.issue_id
        and (i.company_id = current_company_id() or is_supporter())
    )
  );

-- comments: 閲覧可能なissueに対して、自分自身が投稿者としてのみ作成可
create policy comments_insert on comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from issues i
      where i.id = comments.issue_id
        and (i.company_id = current_company_id() or is_supporter())
    )
  );
```

update/delete ポリシーは作成しない（MVPはステータス変更・編集・削除機能を持たないため §3.3 準拠）。
`company_invites` の失効延長・無効化（update/delete）も同様にMVP対象外（§6）。

### 3.4 越境アクセスのテスト方針

`supabase test` または Vitest + Supabaseテストクライアントで以下を確認する（tasks.md のタスクで実施）:

1. 企業Aのユーザーが企業Bの `issues` を `select` しても0件になること
2. 企業Aのユーザーが企業Bの `company_id` を指定して `issues` を `insert` しようとすると RLS 違反で拒否されること
3. 企業Aのユーザーが企業Bの課題に紐づく `comments` を `select` しても0件になること
4. 企業Aのユーザーが企業Bの課題への `comments` を `insert` しようとすると拒否されること
5. `supporter` ロールのユーザーは企業A・B双方の `issues` / `comments` を `select` できること

読み取り（select）と書き込み（insert）の両方で、`issues` と `comments` それぞれについて拒否・許可を確認する（読めないことの確認だけで書けないことの確認を省略しない）。

招待コード関連（v1.1で追加）:

6. 認証済みユーザーが `users` に直接 `insert` しようとすると拒否されること（direct insertポリシーが存在しないこと）
7. 一般ユーザー（employee/leader）が `company_invites` を `select` / `insert` しようとすると0件/拒否になること
8. `supporter` は `company_invites` を `select` / `insert` できること
9. `accept_invite()` に存在しない・期限切れのコードを渡すと例外になり、`users` 行が作られないこと
10. `accept_invite()` に有効なコードを渡すと、渡したコードの `company_id` / `role` 通りに `users` 行が作られ、
    ユーザーが指定した値（存在しない）ではなくコード側の値が使われること
11. 企業Aのコードでサインアップしたユーザーが、企業Bの `issues` / `comments` にアクセスできないこと（1〜4の再確認）

## 4. AI難易度タグ — プロンプトと呼び出し箇所

### 4.1 呼び出し箇所

`src/app/api/issues/route.ts`（Next.js Route Handler、`POST`のみ）。

1. Supabaseのサーバー用クライアント（cookiesベースのセッション、ユーザーのRLS権限で動作。**service roleキーは使わない**）でログインユーザーを取得。
2. `users` テーブルから `company_id` を取得（`current_company_id()` 相当のクエリ）。
3. リクエストボディの `raw_input`（必須）・`frequency`（任意）・`time_per_occurrence`（任意）をバリデーション。
4. サーバー側env変数 `ANTHROPIC_API_KEY` を使い、Anthropic TypeScript SDK (`@anthropic-ai/sdk`) で **1回だけ** `claude-haiku-4-5` を呼び出し、難易度（低/中/高）を判定。
5. パースに失敗した場合は `ai_difficulty = '中'` にフォールバック（DBのnot null制約を満たすため必須）。
6. ユーザーのセッションを使った Supabase クライアントで `issues` に insert（RLSが `company_id` / `created_by` を強制するため、insert時に signed-in userのcompany_idとcreated_byが一致しない不正行為はDB層で弾かれる）。
7. 作成された課題を返す。

コメント投稿（`comments`）はLLMを呼ばないため、クライアントから直接Supabaseクライアント（anon key、RLS適用）でinsertする。専用route handlerは設けない。

### 4.2 プロンプト設計

```
System:
あなたは中小企業の業務改善を支援するコンサルタントです。
従業員から投稿された「困りごと」の文章を読み、AI技術（LLM・自動化・RPA等）でどれくらい実現しやすそうかを判定してください。

出力は次の3語のうちいずれか1語のみとしてください。他の文字・記号・説明は一切出力しないこと。
低・中・高

判定基準:
- 低: 定型的なテキスト処理・単純な自動化など、現状のAIツールで比較的簡単に解決できそうなもの
- 中: 解決の見込みはあるが、業務フローの設計やシステム連携が必要なもの
- 高: 例外処理が多い、複数システムとの連携が複雑、業務理解が深く必要など難易度が高いもの

User:
{{raw_input}}
```

呼び出しコード（サーバー側のみ、`max_tokens`は8程度で十分）:

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む

async function classifyDifficulty(rawInput: string): Promise<"低" | "中" | "高"> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawInput }],
  });
  const text = message.content.find((b) => b.type === "text")?.text?.trim();
  if (text === "低" || text === "中" || text === "高") return text;
  return "中"; // パース失敗時のフォールバック
}
```

### 4.3 秘密情報の扱い

- `ANTHROPIC_API_KEY` はサーバー専用の環境変数（`.env.local`、Vercelでは環境変数設定）。クライアントバンドルに含めない（`NEXT_PUBLIC_`プレフィックスを付けない）。
- Route Handler以外（Server ComponentやClient Component）からは呼び出さない。
- `.env.local` は `.gitignore` に含め、コミットしない。`.env.local.example` にキー名のみ記載する。

## 5. ディレクトリ構成（想定）

```
src/
  app/
    layout.tsx                 # 全体レイアウト
    page.tsx                   # ルート（role別に/board or /supporterへリダイレクト）
    login/page.tsx             # ログイン画面
    signup/page.tsx            # サインアップ画面（招待コード＋氏名＋メール/パスワード。auth.signUp後にaccept_invite()をrpc呼び出し）
    capture/page.tsx           # 課題捕捉フォーム
    board/page.tsx             # 自社ボード一覧
    board/[id]/page.tsx        # 課題詳細＋返信
    supporter/page.tsx         # 支援者向け企業横断一覧
    api/
      issues/route.ts          # POST: LLM呼び出し＋issues insert
  lib/
    supabase/
      client.ts                # ブラウザ用Supabaseクライアント
      server.ts                # サーバー用Supabaseクライアント（cookiesベース、RLS適用）
    anthropic.ts                # Anthropicクライアント初期化＋難易度判定関数
  types/
    database.ts                 # Supabaseスキーマの型定義（supabase gen typesで生成）
supabase/
  config.toml
  migrations/
    xxxx_init_schema.sql       # テーブル・enum定義（company_invites含む）
    xxxx_rls_policies.sql      # ヘルパー関数・accept_invite()・RLSポリシー
.env.local.example
```

各ファイルの役割は実装時にファイル冒頭へ一言コメントとして残す（要件の「コードの扱い」に従う）。

## 6. 未使用・保留とする要素（念のための明記）

以下は要件 §3.3「含まない」に従い、実装しない:
- 音声入力・PWA・モバイル専用最適化・オフライン対応
- AIの聞き返し（対話的な粒度調整）
- アプリの自動試作生成
- ステータス管理・アサイン・進捗トラッキング
- 通知・リマインド
- 組織図・部署・細かいRBAC等の本格的な権限管理（v0.5でRLS越境を塞ぐための`company_invites`招待コード登録のみ例外的にMVPへ含む。requirements.md §3.3のスコープ上書き注記を参照）
- 招待コードの失効延長・無効化・使用回数制限（`company_invites`はupdate/delete非対応。expires_atのみで管理）
- Supabase Realtimeによるライブ反映
