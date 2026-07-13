-- 招待コード検証関数（v1.1）: usersへの行作成は必ずこの関数を経由させる。
-- security definer + テーブル所有者実行のため、内部のselect/insertはcompany_invites/usersのRLSをバイパスする。
-- role/company_idは引数で受け取らず、company_invitesの一致行からのみ決まる（自己申告を構造的に不可能にする）。
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

-- users: 直接INSERTは許可しない（v1.1で撤去）。行の作成はaccept_invite()経由のみ。
-- 理由: 直挿しを許すとrole/company_idをユーザーが自己申告でき、supporter自称や他社company_id指定による
-- 越境が可能になっていた（requirements.md v0.5 §3.3参照）。
drop policy users_insert_self on users;

-- companies: 自社の1行 or supporterは全件参照可（using(true)から縮小。会社リストの露出を防ぐ。
-- 一般ユーザーはボード等で自社名を表示できれば足り、他社の存在自体を知る必要がない）
drop policy companies_select on companies;

create policy companies_select on companies
  for select to authenticated
  using (
    id = current_company_id()
    or is_supporter()
  );

-- company_invites: supporterのみ発行(insert)・閲覧(select)可。一般ユーザーへの直接SELECTは与えない
-- （サインアップ時のコード検証はaccept_invite()がSECURITY DEFINERで内部的に行う）
-- supporterは企業横断の信頼ロールのため、宛先company_idを問わず発行できる（companies_selectのsupporter枝と同じ信頼モデル）。
-- 企業ごとの発行権限を絞る細粒度RBACはMVP対象外（design.md §6）。
alter table company_invites enable row level security;

create policy company_invites_select on company_invites
  for select to authenticated
  using (is_supporter());

create policy company_invites_insert on company_invites
  for insert to authenticated
  with check (is_supporter());
