// AI難易度タグ判定（design.md §4.2）。保存時に1課題1回だけ呼び出す。

import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `あなたは中小企業の業務改善を支援するコンサルタントです。
従業員から投稿された「困りごと」の文章を読み、AI技術（LLM・自動化・RPA等）でどれくらい実現しやすそうかを判定してください。

出力は次の3語のうちいずれか1語のみとしてください。他の文字・記号・説明は一切出力しないこと。
低・中・高

判定基準:
- 低: 定型的なテキスト処理・単純な自動化など、現状のAIツールで比較的簡単に解決できそうなもの
- 中: 解決の見込みはあるが、業務フローの設計やシステム連携が必要なもの
- 高: 例外処理が多い、複数システムとの連携が複雑、業務理解が深く必要など難易度が高いもの`;

export type DifficultyLevel = "低" | "中" | "高";

export async function classifyDifficulty(rawInput: string): Promise<DifficultyLevel> {
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: rawInput }],
    });
    const text = message.content.find((b) => b.type === "text")?.text?.trim();
    if (text === "低" || text === "中" || text === "高") return text;
    return "中";
  } catch {
    // API呼び出し失敗時もissues.ai_difficultyのnot null制約を満たすためフォールバック
    return "中";
  }
}
