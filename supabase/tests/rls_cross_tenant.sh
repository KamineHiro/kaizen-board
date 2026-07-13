#!/usr/bin/env bash
# design.md §3.4 の11項目を、実際のSupabase local API（GoTrue認証 + PostgREST + RPC）経由で検証する。
# psqlでのSET LOCAL ROLEシミュレーションではなく、ブラウザ/アプリと同じHTTP経路を通すことで
# テーブルGRANTとRLSポリシーの両方を実クライアントと同じ形で検証する。
#
# 前提: `supabase start`済み、`supabase/seed.sql`のデフォルトシード（supporter@example.com等）が投入済み。
# 実行: bash supabase/tests/rls_cross_tenant.sh

set -uo pipefail

API_URL="http://127.0.0.1:54321"
ANON_KEY=$(cd "$(dirname "$0")/../.." && npx supabase status -o json 2>/dev/null | jq -r '.ANON_KEY')

PASS=0
FAIL=0
RESULTS=()

record() {
  local n="$1" desc="$2" ok="$3"
  if [ "$ok" = "true" ]; then
    PASS=$((PASS+1))
    RESULTS+=("PASS  ${n}. ${desc}")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL  ${n}. ${desc}")
  fi
}

# --- ヘルパー: メール/パスワードでサインイン、access_tokenを返す ---
signin() {
  curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r '.access_token'
}

# --- ヘルパー: メール/パスワードでサインアップ、access_tokenを返す ---
signup() {
  curl -s -X POST "$API_URL/auth/v1/signup" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r '.access_token // empty'
}

STAMP=$(date +%s)

echo "=== セットアップ: supporterでログイン、企業A/B向けの招待コードを発行 ==="
SUPPORTER_TOKEN=$(signin "supporter@example.com" "supporter-password")
if [ -z "$SUPPORTER_TOKEN" ] || [ "$SUPPORTER_TOKEN" = "null" ]; then
  echo "FATAL: supporterログインに失敗。seed.sqlが投入されているか確認してください。"
  exit 1
fi

COMPANY_A=$(curl -s "$API_URL/rest/v1/companies?name=eq.%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%E8%A3%BD%E4%BD%9C%E6%89%80&select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq -r '.[0].id')
COMPANY_B=$(curl -s "$API_URL/rest/v1/companies?name=eq.%E6%9C%89%E9%99%90%E4%BC%9A%E7%A4%BE%E3%81%BF%E3%82%89%E3%81%84%E5%B7%A5%E6%A5%AD&select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq -r '.[0].id')

SUPPORTER_UID=$(curl -s "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq -r '.id')

CODE_A="TEST-A-${STAMP}"
CODE_B="TEST-B-${STAMP}"

curl -s -X POST "$API_URL/rest/v1/company_invites" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE_A\",\"company_id\":\"$COMPANY_A\",\"role\":\"employee\",\"expires_at\":\"2999-01-01T00:00:00Z\",\"created_by\":\"$SUPPORTER_UID\"}" > /dev/null

curl -s -X POST "$API_URL/rest/v1/company_invites" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE_B\",\"company_id\":\"$COMPANY_B\",\"role\":\"employee\",\"expires_at\":\"2999-01-01T00:00:00Z\",\"created_by\":\"$SUPPORTER_UID\"}" > /dev/null

echo "=== ユーザーA（企業A）・ユーザーB（企業B）を招待コード経由でサインアップ ==="
TOKEN_A=$(signup "user-a-${STAMP}@example.com" "password123")
curl -s -X POST "$API_URL/rest/v1/rpc/accept_invite" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"invite_code\":\"$CODE_A\",\"user_name\":\"ユーザーA\"}" > /dev/null

TOKEN_B=$(signup "user-b-${STAMP}@example.com" "password123")
curl -s -X POST "$API_URL/rest/v1/rpc/accept_invite" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" \
  -d "{\"invite_code\":\"$CODE_B\",\"user_name\":\"ユーザーB\"}" > /dev/null

echo "=== ユーザーAが企業Aのissue/commentを作成 ==="

# created_byはRLSでauth.uid()と一致必須。ユーザーA/Bのuidを取得してcreated_by/author_idに使う。
UID_A=$(curl -s "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" | jq -r '.id')
UID_B=$(curl -s "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_B" | jq -r '.id')

ISSUE_A=$(curl -s -X POST "$API_URL/rest/v1/issues" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"company_id\":\"$COMPANY_A\",\"raw_input\":\"越境テスト用issue A\",\"ai_difficulty\":\"中\",\"created_by\":\"$UID_A\"}" \
  | jq -r '.[0].id // empty')

curl -s -X POST "$API_URL/rest/v1/comments" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"issue_id\":\"$ISSUE_A\",\"author_id\":\"$UID_A\",\"body\":\"Aからの返信\"}" > /dev/null

echo ""
echo "=== テスト実行 ==="

# 1. 企業Aのユーザーが企業Bの issues を select しても0件
R1=$(curl -s "$API_URL/rest/v1/issues?company_id=eq.$COMPANY_B&select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" | jq 'length')
[ "$R1" = "0" ] && record 1 "企業Aユーザーが企業Bのissuesをselectしても0件" true || record 1 "企業Aユーザーが企業Bのissuesをselectしても0件(実際:${R1}件)" false

# 2. 企業Aのユーザーが企業Bのcompany_idでissuesをinsertしようとすると拒否
R2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/rest/v1/issues" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"company_id\":\"$COMPANY_B\",\"raw_input\":\"越境試行\",\"ai_difficulty\":\"中\",\"created_by\":\"$UID_A\"}")
[[ "$R2" =~ ^40[13]$ ]] && record 2 "企業Aユーザーが企業B宛てissuesをinsertしようとすると拒否(HTTP $R2)" true || record 2 "企業Aユーザーが企業B宛てissuesをinsertしようとすると拒否(HTTP $R2 で拒否されず)" false

# 3. 企業Aユーザーが企業Bの課題に紐づくcommentsをselectしても0件（B側にissueが無いため、A自身のissueで代替確認: BがAのissueのcommentを見れないことを4で確認。ここではBのcomments全体を0件で確認）
R3=$(curl -s "$API_URL/rest/v1/comments?issue_id=eq.$ISSUE_A&select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_B" | jq 'length')
[ "$R3" = "0" ] && record 3 "企業Bユーザーが企業AのissueのcommentsをSELECTしても0件" true || record 3 "企業Bユーザーが企業AのissueのcommentsをSELECTしても0件(実際:${R3}件)" false

# 4. 企業Bユーザーが企業AのissueへcommentsをINSERTしようとすると拒否
R4=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/rest/v1/comments" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" \
  -d "{\"issue_id\":\"$ISSUE_A\",\"author_id\":\"$UID_B\",\"body\":\"越境コメント試行\"}")
[[ "$R4" =~ ^40[13]$ ]] && record 4 "企業BユーザーがAのissueへcommentsをinsertしようとすると拒否(HTTP $R4)" true || record 4 "企業BユーザーがAのissueへcommentsをinsertしようとすると拒否(HTTP $R4 で拒否されず)" false

# 5. supporterは企業A・B双方のissues/commentsをselectできる
R5A=$(curl -s "$API_URL/rest/v1/issues?company_id=eq.$COMPANY_A&select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq 'length')
R5B=$(curl -s "$API_URL/rest/v1/comments?issue_id=eq.$ISSUE_A&select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq 'length')
{ [ "$R5A" -ge 1 ] && [ "$R5B" -ge 1 ]; } && record 5 "supporterは企業A・B双方のissues/commentsをselectできる" true || record 5 "supporterは企業A・B双方のissues/commentsをselectできる(issues:${R5A}, comments:${R5B})" false

# 6. 認証済みユーザーがusersに直接insertしようとすると拒否
R6=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/rest/v1/users" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"id\":\"$UID_A\",\"company_id\":\"$COMPANY_B\",\"role\":\"supporter\",\"name\":\"自己昇格\"}")
[[ "$R6" =~ ^40[13]$ ]] && record 6 "usersへの直接insertは拒否される(HTTP $R6)" true || record 6 "usersへの直接insertは拒否される(HTTP $R6 で拒否されず)" false

# 7. 一般ユーザーはcompany_invitesをselect/insertできない
R7S=$(curl -s "$API_URL/rest/v1/company_invites?select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" | jq 'length')
R7I=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/rest/v1/company_invites" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" \
  -d "{\"code\":\"SELF-${STAMP}\",\"company_id\":\"$COMPANY_A\",\"role\":\"employee\",\"expires_at\":\"2999-01-01T00:00:00Z\",\"created_by\":\"$UID_A\"}")
{ [ "$R7S" = "0" ] && [[ "$R7I" =~ ^40[13]$ ]]; } && record 7 "一般ユーザーはcompany_invitesをselect(0件)/insert(拒否)できない" true || record 7 "一般ユーザーのcompany_invites制限(select:${R7S}件, insert:HTTP $R7I)" false

# 8. supporterはcompany_invitesをselect/insertできる
R8S=$(curl -s "$API_URL/rest/v1/company_invites?select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq 'length')
R8I=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/rest/v1/company_invites" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"code\":\"SUP-${STAMP}\",\"company_id\":\"$COMPANY_A\",\"role\":\"employee\",\"expires_at\":\"2999-01-01T00:00:00Z\",\"created_by\":\"$SUPPORTER_UID\"}")
{ [ "$R8S" -ge 1 ] && [ "$R8I" = "201" ]; } && record 8 "supporterはcompany_invitesをselect/insertできる" true || record 8 "supporterのcompany_invites許可(select:${R8S}件, insert:HTTP $R8I)" false

# 9. 無効/期限切れコードでaccept_invite失敗、usersに行が作られない
TOKEN_C=$(signup "user-c-${STAMP}@example.com" "password123")
UID_C=$(curl -s "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_C" | jq -r '.id')
R9=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/rest/v1/rpc/accept_invite" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_C" -H "Content-Type: application/json" \
  -d "{\"invite_code\":\"NOT-A-REAL-CODE\",\"user_name\":\"テスト不正\"}")
R9U=$(curl -s "$API_URL/rest/v1/users?id=eq.$UID_C&select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" | jq 'length')
{ [ "$R9" = "400" ] || [ "$R9" = "404" ]; } && [ "$R9U" = "0" ] && record 9 "無効なコードでaccept_invite失敗、usersに行が作られない(HTTP $R9)" true || record 9 "無効コード時の挙動(HTTP $R9, users行:${R9U})" false

# 10. 有効コードでrole/company_idがコード通りに決まる（ユーザーAで既に検証済み。ここではロール違いのコードで再確認）
CODE_LEADER="TEST-LEADER-${STAMP}"
curl -s -X POST "$API_URL/rest/v1/company_invites" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SUPPORTER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE_LEADER\",\"company_id\":\"$COMPANY_B\",\"role\":\"leader\",\"expires_at\":\"2999-01-01T00:00:00Z\",\"created_by\":\"$SUPPORTER_UID\"}" > /dev/null
TOKEN_D=$(signup "user-d-${STAMP}@example.com" "password123")
UID_D=$(curl -s "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_D" | jq -r '.id')
curl -s -X POST "$API_URL/rest/v1/rpc/accept_invite" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_D" -H "Content-Type: application/json" \
  -d "{\"invite_code\":\"$CODE_LEADER\",\"user_name\":\"ユーザーD\"}" > /dev/null
R10=$(curl -s "$API_URL/rest/v1/users?id=eq.$UID_D&select=role,company_id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_D")
R10_ROLE=$(echo "$R10" | jq -r '.[0].role')
R10_COMPANY=$(echo "$R10" | jq -r '.[0].company_id')
{ [ "$R10_ROLE" = "leader" ] && [ "$R10_COMPANY" = "$COMPANY_B" ]; } && record 10 "有効コードでrole/company_idがコード通りに決まる(role=leader, company=B)" true || record 10 "有効コード適用結果(role=${R10_ROLE}, company_id一致=$([ "$R10_COMPANY" = "$COMPANY_B" ] && echo yes || echo no))" false

# 11. 招待コード経由でサインアップしたユーザーが越境しないことの再確認（ユーザーD=企業Bのleaderが企業Aを見れない）
R11=$(curl -s "$API_URL/rest/v1/issues?company_id=eq.$COMPANY_A&select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_D" | jq 'length')
[ "$R11" = "0" ] && record 11 "招待コード経由サインアップユーザー(企業Bのleader)が企業Aのissuesを見れない" true || record 11 "招待コード経由サインアップユーザーの越境確認(実際:${R11}件)" false

echo ""
echo "=== 結果 ==="
for line in "${RESULTS[@]}"; do echo "$line"; done
echo ""
echo "PASS: $PASS / $((PASS+FAIL))  FAIL: $FAIL"

[ "$FAIL" -eq 0 ]
