// サインアップ画面。認証済みだがpublic.users未作成（招待コード検証未完了）の場合はコード再入力のみ表示する
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";
import { RetryInviteForm } from "./retry-invite-form";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

    if (profile) {
      redirect(profile.role === "supporter" ? "/supporter" : "/board");
    }

    // 認証済みだがpublic.usersが未作成（招待コード検証に失敗した中間状態）: コード再入力のみ求める
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-xl font-semibold">招待コードを確認</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            アカウントは作成済みです。招待コードの確認のみ完了していません。
          </p>
          <RetryInviteForm />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">サインアップ</h1>
        <SignupForm />
      </div>
    </div>
  );
}
