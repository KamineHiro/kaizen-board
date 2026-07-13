// POST: サーバー側でAI難易度判定を1回呼び出し、issuesにinsertする（design.md §4.1）。
// ユーザーセッションのSupabaseクライアントを使い、service roleキーは使わない
// （RLSがcompany_id/created_byを強制するため、insert時の越境はDB層で弾かれる）。

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyDifficulty } from "@/lib/anthropic";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    return NextResponse.json({ error: "所属企業が確認できません。" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rawInput = typeof body?.raw_input === "string" ? body.raw_input.trim() : "";

  if (!rawInput) {
    return NextResponse.json({ error: "困りごとの本文を入力してください。" }, { status: 400 });
  }

  const frequency =
    typeof body?.frequency === "string" && body.frequency.trim() ? body.frequency.trim() : null;
  const timePerOccurrence =
    typeof body?.time_per_occurrence === "number" && Number.isFinite(body.time_per_occurrence)
      ? body.time_per_occurrence
      : null;

  const aiDifficulty = await classifyDifficulty(rawInput);

  const { data: issue, error } = await supabase
    .from("issues")
    .insert({
      company_id: profile.company_id,
      raw_input: rawInput,
      frequency,
      time_per_occurrence: timePerOccurrence,
      ai_difficulty: aiDifficulty,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json(issue, { status: 201 });
}
