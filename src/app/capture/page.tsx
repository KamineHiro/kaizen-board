// 課題捕捉画面（design.md §1 /capture）。employee/leaderのみ（supporterは/supporterへ）
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CaptureForm } from "./capture-form";

export default async function CapturePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role === "supporter") redirect("/supporter");

  return (
    <div className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <h1 className="text-xl font-semibold">困りごとを投稿</h1>
        <CaptureForm />
      </div>
    </div>
  );
}
