// 後端共用：Gemini 呼叫、來源檢查、簡單限流。
// Gemini 金鑰放在 Netlify 環境變數 GEMINI_API_KEY，不會出現在網頁或 GitHub。

const env = (k) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "");

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const hits = new Map();
export function guard(req, context, perMin = 20) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) return json({ error: "origin" }, 403);
    } catch (_) {
      return json({ error: "origin" }, 403);
    }
  }
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (list.length > perMin) return json({ error: "rate" }, 429);
  return null;
}

export class AiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// 依序嘗試模型；某個模型不存在（404）就換下一個。
export async function gemini(prompt, { temperature = 0.2 } = {}) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new AiError("nokey", 503);
  const models = [env("GEMINI_MODEL"), "gemini-3.5-flash", "gemini-3.5-flash-lite"].filter(Boolean);
  let last = 502;
  for (const m of models) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, responseMimeType: "application/json" },
        }),
      });
    } catch (_) {
      throw new AiError("network", 502);
    }
    if (r.status === 404) { last = 404; continue; }
    if (r.status === 429) throw new AiError("rate", 429);
    if (r.status === 400 || r.status === 403) throw new AiError("badkey", 502);
    if (!r.ok) throw new AiError("upstream", 502);
    const data = await r.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b <= a) throw new AiError("parse", 502);
    try {
      return JSON.parse(text.slice(a, b + 1));
    } catch (_) {
      throw new AiError("parse", 502);
    }
  }
  throw new AiError("nomodel", last);
}

export function fail(e) {
  if (e instanceof AiError) return json({ error: e.code }, e.status);
  return json({ error: "server" }, 500);
}
