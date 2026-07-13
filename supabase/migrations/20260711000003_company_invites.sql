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
