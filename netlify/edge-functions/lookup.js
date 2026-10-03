// 「Claude 幫我填」：用店名查詢地點資訊，回傳 JSON。
// API 金鑰放在 Netlify 的環境變數 ANTHROPIC_API_KEY，不會出現在網頁或 GitHub 上。

const MODEL = "claude-sonnet-5-5";
const hits = new Map(); // 簡單的每 IP 次數限制（盡力而為）

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 8;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default async (request, context) => {
  if (request.method !== "POST") return json({ error: "method" }, 405);

  // 只接受從自己網站送來的請求
  const origin = request.headers.get("origin") || "";
  const host = new URL(request.url).host;
  if (origin && new URL(origin).host !== host) return json({ error: "origin" }, 403);

  if (tooMany(context.ip || "x")) return json({ error: "rate" }, 429);

  let name = "";
  try {
    name = String((await request.json()).name || "").trim().slice(0, 80);
  } catch (_) {}
  if (!name) return json({ error: "name" }, 400);

  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "nokey" }, 500);

  const prompt = `你是胡志明市的旅遊嚮導。朋友要去胡志明市旅行，想去「${name}」。
請用網路搜尋確認這個地方是什麼、在哪裡、現在是否還有營業。不要編造；查不到或不確定就把 known 設為 false。
最後只回傳一個 JSON 物件，不要其他文字：
{"known":true,"kind":"吃|咖啡|景點|購物|其他 擇一","area":"郡＋坊或路名，例如：第1郡 Bến Thành","note":"繁體中文 1-2 句、50 字內：是什麼樣的店、招牌或必點、營業時間或適合時段","lat":10.77,"lng":106.70,"locConfident":true}
lat/lng 只有在你很有把握（誤差 300 公尺內）時才填，並把 locConfident 設為 true；否則 lat、lng 填 null。`;

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (_) {
    return json({ error: "network" }, 502);
  }
  if (r.status === 429) return json({ error: "rate" }, 429);
  if (!r.ok) return json({ error: "upstream", status: r.status }, 502);

  const data = await r.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return json({ known: false });
  try {
    return json(JSON.parse(text.slice(a, b + 1)));
  } catch (_) {
    return json({ known: false });
  }
};

export const config = { path: "/api/lookup" };
