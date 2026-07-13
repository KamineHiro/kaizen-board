-- 業務改善ボード: ヘルパー関数・RLSポリシー（design.md §3）

-- SECURITY DEFINERでusersテーブルの再帰RLSを回避
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

alter table companies enable row level security;
alter table users enable row level security;
alter table issues enable row level security;
alter table comments enable row level security;

-- companies: 認証済みユーザーなら誰でも一覧参照可（サインアップ時の企業選択・支援者ビューでの企業名表示に必要。issues/commentsは含まないため越境リスクなし）
create policy companies_select on companies
  for select to authenticated
  using (true);

-- users: 自分自身 / 同一企業 / supporterは全件参照可（同一企業内で名前を表示するため）
create policy users_select on users
  for select to authenticated
  using (
    id = auth.uid()
    or company_id = current_company_id()
    or is_supporter()
  );

-- users: 自分自身の行のみ作成可（サインアップ時、auth.usersへのinsertトリガーから実行）
create policy users_insert_self on users
  for insert to authenticated
  with check (id = auth.uid());

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

-- update/deleteポリシーは作成しない（MVPはステータス変更・編集・削除機能を持たないため）
