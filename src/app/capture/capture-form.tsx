"use client";
// 困りごと入力フォーム。送信でPOST /api/issuesを呼ぶ

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";

export function CaptureForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const raw_input = String(formData.get("raw_input") ?? "").trim();
    const frequency = String(formData.get("frequency") ?? "").trim();
    const timeStr = String(formData.get("time_per_occurrence") ?? "").trim();

    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_input,
        frequency: frequency || null,
        time_per_occurrence: timeStr ? Number(timeStr) : null,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "投稿に失敗しました。");
      return;
    }

    router.push("/board");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="raw_input" className="block text-sm font-medium">
          困りごと <span className="text-red-600">*</span>
        </label>
        <textarea
          id="raw_input"
          name="raw_input"
          required
          rows={5}
          placeholder="例: 受注データを基幹システムからExcelに毎朝手で転記してる。これ何とかならん？"
          className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label htmlFor="frequency" className="block text-sm font-medium">
          頻度（任意）
        </label>
        <input
          id="frequency"
          name="frequency"
          type="text"
          placeholder="例: 毎日、週3回"
          className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label htmlFor="time_per_occurrence" className="block text-sm font-medium">
          1回あたりの所要時間（分・任意）
        </label>
        <input
          id="time_per_occurrence"
          name="time_per_occurrence"
          type="number"
          min={0}
          className="mt-1 w-full rounded border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "送信中…" : "送信する"}
      </button>
    </form>
  );
}
