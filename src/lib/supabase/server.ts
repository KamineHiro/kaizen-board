// サーバー用Supabaseクライアント（Server Component/Route Handlerから使用、cookiesベースのセッション、RLSが適用される）

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server ComponentからのsetAll呼び出しは無視してよい
            // （proxy.tsがセッションのリフレッシュを担う場合）
          }
        },
      },
    }
  );
}
