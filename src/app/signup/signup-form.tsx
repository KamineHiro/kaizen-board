"use client";
// 新規サインアップフォーム（招待コード・氏名・メール/パスワード）

import { useActionState } from "react";
import { signup } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  if (state?.info) {
    return <p className="text-sm text-zinc-700 dark:text-zinc-300">{state.info}</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="inviteCode" className="block text-sm font-medium">
          招待コード
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          type="text"
          required
          className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          氏名
        </label>
        <input id="name" name="name" type="text" required className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "登録中…" : "登録する"}
      </button>
    </form>
  );
}
