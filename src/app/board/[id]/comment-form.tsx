"use client";
// 返信フォーム。クライアントから直接Supabaseにinsertする（RLSで保護、design.md §4.1末尾）

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CommentForm({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = body.trim();
    if (!trimmed) return;

    setPending(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("ログインが必要です。");
      setPending(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("comments")
      .insert({ issue_id: issueId, author_id: user.id, body: trimmed });

    setPending(false);

    if (insertError) {
      setError("送信に失敗しました。");
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="返信を書く"
        className="w-full rounded border px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? "送信中…" : "返信する"}
      </button>
    </form>
  );
}
