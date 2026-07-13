// issues.ai_difficulty（低・中・高）の色分けバッジ。board/board-[id]/supporterで共有
const COLORS: Record<string, string> = {
  高: "bg-red-100 text-red-700",
  中: "bg-yellow-100 text-yellow-700",
  低: "bg-green-100 text-green-700",
};

export function DifficultyBadge({ level }: { level: string }) {
  return (
    <span className={`rounded px-2 py-0.5 font-medium ${COLORS[level] ?? "bg-zinc-100 text-zinc-700"}`}>
      難易度: {level}
    </span>
  );
}
