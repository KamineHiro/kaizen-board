// ルート（design.md §1）。role別に/boardまたは/supporterへリダイレクトするだけの入口
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

  redirect(profile?.role === "supporter" ? "/supporter" : "/board");
}
