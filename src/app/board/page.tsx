// 自社ボード一覧（design.md §1 /board）。employee/leader向け、難易度順にソート表示
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DifficultyBadge } from "@/components/difficulty-badge";

const DIFFICULTY_ORDER: Record<string, number> = { 高: 0, 中: 1, 低: 2 };

export default async function BoardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role === "supporter") redirect("/supporter");

  const { data: issues } = await supabase
    .from("issues")
    .select("id, raw_input, frequency, time_per_occurrence, ai_difficulty, created_at")
    .order("created_at", { ascending: false });

  const sorted = [...(issues ?? [])].sort(
    (a, b) => (DIFFICULTY_ORDER[a.ai_difficulty] ?? 9) - (DIFFICULTY_ORDER[b.ai_difficulty] ?? 9)
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">自社ボード</h1>
        <Link
          href="/capture"
          className="rounded bg-black px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          ＋困りごとを投稿
        </Link>
      </div>

      {sorted.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">まだ困りごとが投稿されていません。</p>
      )}

      <ul className="space-y-3">
        {sorted.map((issue) => (
          <li key={issue.id}>
            <Link
              href={`/board/${issue.id}`}
              className="block rounded border bg-white px-4 py-3 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2 text-xs">
                <DifficultyBadge level={issue.ai_difficulty} />
                {issue.frequency && (
                  <span className="text-zinc-500 dark:text-zinc-400">{issue.frequency}</span>
                )}
                {issue.time_per_occurrence != null && (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {issue.time_per_occurrence}分/回
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm">{issue.raw_input}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
