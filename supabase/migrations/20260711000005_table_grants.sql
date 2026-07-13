-- テーブルグラント（v1.1で追加、T3/T4時点の見落としを修正）
-- RLSポリシーだけでは不十分で、Postgresのテーブル権限(GRANT)がSELECT/INSERT等をauthenticatedロールに
-- 許可していないと、ポリシー評価の手前で "permission denied for table" として拒否される。
-- 各テーブルに定義済みのポリシー（存在するcmd）と過不足なく一致させる（最小権限）。
grant select on companies to authenticated;
grant select on users to authenticated; -- insertは与えない。usersへの書き込みはaccept_invite()経由のみ（SECURITY DEFINERでオーナー権限実行のため、この付与とは無関係に書き込める）
grant select, insert on issues to authenticated;
grant select, insert on comments to authenticated;
grant select, insert on company_invites to authenticated;
