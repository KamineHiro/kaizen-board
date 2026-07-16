// 全体レイアウト。ヘッダーにログイン中のユーザー名・roleとログアウトボタンを表示する
// （認証ガード自体はここではなくsrc/proxy.tsが担う。design.mdの「Layoutsとauth checks」注意点に従う）
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "業務改善ボード",
  description: "日々の困りごとをその場で溜め、チームで返信し合える改善ボード",
};

function roleLabel(role: string) {
  if (role === "supporter") return "支援者";
  if (role === "leader") return "リーダー";
  return "従業員";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { name: string; role: string } | null = null;
  if (user) {
    const { data } = await supabase.from("users").select("name, role").eq("id", user.id).single();
    profile = data;
  }

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <a href={profile?.role === "supporter" ? "/supporter" : "/board"} className="font-semibold">
            業務改善ボード
          </a>
          {profile && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">
                {profile.name}（{roleLabel(profile.role)}）
              </span>
              <LogoutButton />
            </div>
          )}
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
