-- 開発用シード: サンプル企業データ、初回supporter、動作確認用の招待コード

insert into companies (name) values
  ('株式会社サンプル製作所'),
  ('有限会社みらい工業'),
  ('合同会社グリーンフーズ');

-- 最初のsupporter（招待コード発行者の鶏卵を断つため、auth.users/public.usersへ直接投入。DBへの直接投入方針はdesign.md §0）
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'supporter@example.com',
  extensions.crypt('supporter-password', extensions.gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"hiroki@080602@gmail.com","providers":["hiroki@080602@gmail.com"]}',
  '{}',
  '', '', '', '', ''
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"supporter@example.com"}',
  'email',
  now(),
  now()
);

insert into public.users (id, company_id, role, name)
values ('11111111-1111-1111-1111-111111111111', null, 'supporter', '初代支援者');

-- 動作確認用の招待コード（有効なもの・期限切れのもの、それぞれ1件ずつ）
insert into company_invites (code, company_id, role, expires_at, created_by)
select 'DEMO-VALID-EMPLOYEE', id, 'employee', now() + interval '30 days', '11111111-1111-1111-1111-111111111111'
from companies where name = '株式会社サンプル製作所';

insert into company_invites (code, company_id, role, expires_at, created_by)
select 'DEMO-EXPIRED-EMPLOYEE', id, 'employee', now() - interval '1 day', '11111111-1111-1111-1111-111111111111'
from companies where name = '有限会社みらい工業';
