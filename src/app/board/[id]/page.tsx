// 課題詳細＋返信（design.md §1 /board/[id]）。employee/leader/supporterいずれもアクセス可（RLSで許可範囲のみ）
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { CommentForm } from "./comment-form";

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("id, raw_input, frequency, time_per_occurrence, ai_difficulty, created_at")
    .eq("id", id)
    .single();

  if (!issue) notFound();

  const { data: comments } = await supabase
    .from("comments")
    .select("id, body, created_at, users(name)")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <DifficultyBadge level={issue.ai_difficulty} />
          {issue.frequency && <span className="text-zinc-500">{issue.frequency}</span>}
          {issue.time_per_occurrence != null && (
            <span className="text-zinc-500">{issue.time_per_occurrence}分/回</span>
          )}
        </div>
        <p className="mt-3 whitespace-pre-wrap">{issue.raw_input}</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-600">返信 {comments?.length ?? 0}件</h2>
        <ul className="space-y-3">
          {(comments ?? []).map((c) => {
            const authorName = (c.users as unknown as { name: string } | null)?.name ?? "不明";
            return (
              <li key={c.id} className="rounded border bg-white p-3">
                <div className="flex items-baseline gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700">{authorName}</span>
                  <span>{new Date(c.created_at).toLocaleString("ja-JP")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            );
          })}
        </ul>
        <CommentForm issueId={issue.id} />
      </div>
    </div>
  );
}
