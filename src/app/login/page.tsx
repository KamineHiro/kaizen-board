"use client";
// ログイン画面（design.md §1 /login）

import { useActionState } from "react";
import Link from "next/link";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">ログイン</h1>
        <form action={formAction} className="space-y-4">
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
              className="mt-1 w-full rounded border px-3 py-2"
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
              autoComplete="current-password"
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {pending ? "ログイン中…" : "ログイン"}
          </button>
        </form>
        <p className="text-sm text-zinc-600">
          アカウントをお持ちでない方は{" "}
          <Link href="/signup" className="underline">
            サインアップ
          </Link>
        </p>
      </div>
    </div>
  );
}
