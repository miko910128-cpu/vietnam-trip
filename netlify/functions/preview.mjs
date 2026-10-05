import { guard, json } from "../lib/common.mjs";

// 抓連結的標題、描述、縮圖（Open Graph），給「網路收藏」顯示預覽用。
const BLOCK = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[|::1)/i;

function decode(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .trim();
}

function meta(html, names) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i");
    const m = html.match(re1) || html.match(re2);
    if (m && m[1]) return decode(m[1]);
  }
  return "";
}

async function grab(url, ua) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "user-agent": ua, "accept-language": "zh-TW,zh;q=0.9,en;q=0.8,vi;q=0.7", accept: "text/html" },
    });
    const type = r.headers.get("content-type") || "";
    if (!type.includes("html")) return { finalUrl: r.url, html: "" };
    const html = (await r.text()).slice(0, 1_500_000);
    return { finalUrl: r.url, html };
  } finally {
    clearTimeout(t);
  }
}

export default async (req, context) => {
  const stop = guard(req, context, 20);
  if (stop) return stop;
  let url;
  try {
    url = new URL(String((await req.json()).url || "").trim());
  } catch (_) {
    return json({ error: "url" }, 400);
  }
  if (!/^https?:$/.test(url.protocol) || BLOCK.test(url.hostname)) return json({ error: "url" }, 400);

  const uas = [
    "Mozilla/5.0 (compatible; TripLinkPreview/1.0; +https://vietnam-chaodage.netlify.app)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  ];
  let out = null;
  for (const ua of uas) {
    try {
      const { finalUrl, html } = await grab(url.href, ua);
      if (!html) continue;
      const title = meta(html, ["og:title", "twitter:title"]) || decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
      const desc = meta(html, ["og:description", "twitter:description", "description"]);
      let image = meta(html, ["og:image", "twitter:image", "twitter:image:src"]);
      if (image && !/^https?:/i.test(image)) { try { image = new URL(image, finalUrl).href; } catch (_) { image = ""; } }
      const site = meta(html, ["og:site_name"]) || new URL(finalUrl).hostname.replace(/^www\./, "");
      out = { title: title.slice(0, 200), desc: desc.slice(0, 3000), image: image.slice(0, 1000), site: site.slice(0, 60), finalUrl };
      if (desc || (title && !/log ?in|登入|sign ?in/i.test(title))) break;
    } catch (_) {}
  }
  if (!out) return json({ error: "fetch" }, 502);
  return json(out);
};

export const config = { path: "/api/preview" };
