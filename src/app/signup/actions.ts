"use server";
// /signup のサーバーアクション: 招待コード方式のサインアップ（design.md §3.2）

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error?: string; info?: string } | undefined;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function redirectByRole(supabase: SupabaseServerClient, userId: string): Promise<never> {
  const { data: profile } = await supabase.from("users").select("role").eq("id", userId).single();
  redirect(profile?.role === "supporter" ? "/supporter" : "/board");
}

// 新規サインアップ: Supabase Authでアカウント作成後、accept_invite()で招待コードを検証してusers行を作る。
// role/company_idはコード側が決めるため、ここでは氏名以外のプロフィール項目を一切渡さない。
export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!inviteCode || !name || !email || !password) {
    return { error: "すべての項目を入力してください。" };
  }

  const supabase = await createClient();
  const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

  if (signUpError || !data.user) {
    return { error: signUpError?.message ?? "サインアップに失敗しました。" };
  }

  // メール確認が必須のプロジェクトではsignUp直後にセッションが発行されない。
  // その場合accept_invite()は未認証（anonロール）で実行され失敗するため、先に確認メール待ちの案内を出す。
  // 招待コード・氏名はここでは保持しない: メール確認後 /signup に戻ると RetryInviteForm で再入力してもらう。
  if (!data.session) {
    return {
      info: "確認メールを送信しました。メール内のリンクをクリックした後、このページに戻って招待コードと氏名を再入力してください。",
    };
  }

  const { error: inviteError } = await supabase.rpc("accept_invite", {
    invite_code: inviteCode,
    user_name: name,
  });

  if (inviteError) {
    // アカウント（auth.users）は作成済みだがpublic.usersはまだ無い中間状態。
    // /signupに再訪すると自動でコード再入力フォームに切り替わる（page.tsx参照）。
    return {
      error:
        "招待コードが無効か、有効期限が切れています。アカウントは作成済みのため、このページを再読み込みして正しい招待コードを再入力してください。",
    };
  }

  await redirectByRole(supabase, data.user.id);
}

// 中間状態（認証済みだがpublic.users未作成）からの再試行。
export async function retryAcceptInvite(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!inviteCode || !name) {
    return { error: "招待コードと氏名を入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: inviteError } = await supabase.rpc("accept_invite", {
    invite_code: inviteCode,
    user_name: name,
  });

  if (inviteError) {
    return { error: "招待コードが無効か、有効期限が切れています。" };
  }

  await redirectByRole(supabase, user.id);
}
