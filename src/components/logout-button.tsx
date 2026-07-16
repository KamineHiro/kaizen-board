"use client";
// レイアウトヘッダー共通のログアウトボタン

import { logout } from "@/app/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="text-zinc-600 underline dark:text-zinc-400">
        ログアウト
      </button>
    </form>
  );
}
