"use client";
// 招待コード再入力フォーム（auth.signUp済みだがaccept_invite未成功の中間状態向け）

import { useActionState } from "react";
import { retryAcceptInvite } from "./actions";

export function RetryInviteForm() {
  const [state, formAction, pending] = useActionState(retryAcceptInvite, undefined);

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
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          氏名
        </label>
        <input id="name" name="name" type="text" required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "確認中…" : "招待コードを確認する"}
      </button>
    </form>
  );
}
