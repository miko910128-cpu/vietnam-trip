import { guard, gemini, json, fail } from "../lib/common.mjs";

// 從社群貼文文字中整理出提到的店家／景點
export default async (req, context) => {
  const stop = guard(req, context, 10);
  if (stop) return stop;
  let text = "";
  try {
    text = String((await req.json()).text || "").trim().slice(0, 6000);
  } catch (_) {}
  if (text.length < 4) return json({ error: "empty" }, 400);

  const prompt = `以下是一則社群貼文或網頁內容，通常是在推薦胡志明市（西貢）的餐廳、咖啡廳、景點或店家。
請列出內容中「明確提到」的具體店名或地點，不要自己補充或猜測沒寫到的店。
只回傳 JSON：
{"summary":"用繁體中文一句話（30 字內）總結這篇在推薦什麼","places":[{"name":"店名或地點，保留原文寫法（越南文／英文），可以在後面加中文","kind":"吃|咖啡|景點|購物|其他 擇一","note":"繁體中文 30 字內：貼文說它好在哪、必點什麼、價格或注意事項"}]}
沒有提到任何具體地點就回傳 places: []。

內容：
${text}`;

  try {
    const r = await gemini(prompt);
    const places = (Array.isArray(r.places) ? r.places : [])
      .filter((p) => p && p.name)
      .slice(0, 30)
      .map((p) => ({ name: String(p.name).slice(0, 100), kind: String(p.kind || "其他"), note: String(p.note || "").slice(0, 200) }));
    return json({ summary: String(r.summary || "").slice(0, 120), places });
  } catch (e) {
    return fail(e);
  }
};

export const config = { path: "/api/extract" };
