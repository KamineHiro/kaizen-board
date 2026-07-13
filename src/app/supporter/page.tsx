// 支援者向け企業横断一覧（design.md §1 /supporter）。role='supporter'のみアクセス可
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DifficultyBadge } from "@/components/difficulty-badge";

const DIFFICULTY_ORDER: Record<string, number> = { 高: 0, 中: 1, 低: 2 };

export default async function SupporterPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "supporter") redirect("/board");

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  let query = supabase
    .from("issues")
    .select("id, raw_input, frequency, time_per_occurrence, ai_difficulty, created_at, company_id, companies(name)")
    .order("created_at", { ascending: false });

  if (company) {
    query = query.eq("company_id", company);
  }

  const { data: issues } = await query;

  const sorted = [...(issues ?? [])].sort(
    (a, b) => (DIFFICULTY_ORDER[a.ai_difficulty] ?? 9) - (DIFFICULTY_ORDER[b.ai_difficulty] ?? 9)
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">支援者ビュー（企業横断）</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/supporter"
          className={`rounded border px-3 py-1 ${!company ? "bg-black text-white" : "bg-white"}`}
        >
          すべて
        </Link>
        {(companies ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/supporter?company=${c.id}`}
            className={`rounded border px-3 py-1 ${company === c.id ? "bg-black text-white" : "bg-white"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {sorted.length === 0 && <p className="text-zinc-500">課題がありません。</p>}

      <ul className="space-y-3">
        {sorted.map((issue) => {
          const companyName = (issue.companies as unknown as { name: string } | null)?.name;
          return (
            <li key={issue.id}>
              <Link
                href={`/board/${issue.id}`}
                className="block rounded border bg-white px-4 py-3 hover:bg-zinc-50"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <DifficultyBadge level={issue.ai_difficulty} />
                  {companyName && <span className="text-zinc-500">{companyName}</span>}
                  {issue.frequency && <span className="text-zinc-500">{issue.frequency}</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{issue.raw_input}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
