"use server";
// /login のサーバーアクション: メール/パスワードでサインインし、roleに応じて/boardまたは/supporterへ

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    return { error: "アカウントの設定が完了していません。サインアップ画面から招待コードの入力を完了してください。" };
  }

  redirect(profile.role === "supporter" ? "/supporter" : "/board");
}
