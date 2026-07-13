-- 業務改善ボード: コアテーブル・enum定義（design.md §2）

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
