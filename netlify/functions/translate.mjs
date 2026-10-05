import { guard, gemini, json, fail } from "../lib/common.mjs";

export default async (req, context) => {
  const stop = guard(req, context, 30);
  if (stop) return stop;
  let text = "", dir = "zh2vi";
  try {
    const b = await req.json();
    text = String(b.text || "").trim().slice(0, 500);
    dir = b.dir === "vi2zh" ? "vi2zh" : "zh2vi";
  } catch (_) {}
  if (!text) return json({ error: "empty" }, 400);

  const prompt = dir === "zh2vi"
    ? `你是在胡志明市旅行的台灣朋友的翻譯。把下面的中文翻成自然、口語、有禮貌的越南文（南部西貢說法），讓店員、司機一看就懂。
只回傳 JSON：{"text":"越南文翻譯","tip":"若有需要，用繁體中文寫一句 25 字內的小提醒（例如南北用詞差異、更有禮貌的說法）；沒有就空字串"}
中文：${text}`
    : `把下面的越南文翻成自然的繁體中文（台灣用語）。如果內容是價格或數字，保留數字。
只回傳 JSON：{"text":"繁體中文翻譯","tip":"若有俚語或需要注意的地方，用繁體中文寫一句 25 字內說明；沒有就空字串"}
越南文：${text}`;

  try {
    const r = await gemini(prompt);
    return json({ text: String(r.text || ""), tip: String(r.tip || ""), engine: "gemini" });
  } catch (e) {
    return fail(e);
  }
};

export const config = { path: "/api/translate" };
