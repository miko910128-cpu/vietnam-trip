# 越南炒大蛤

胡志明市五日行程規劃 App（行程、想去清單、網路收藏、翻譯、換匯、分帳、打包）。

- 前端：單一 `index.html`，資料存在 Firebase Firestore
- 「自動找位置」：OpenStreetMap Nominatim（免費）
- 翻譯、整理貼文地點：Gemini（`netlify/functions/`），需要在 Netlify 設定環境變數 `GEMINI_API_KEY`；沒設定時翻譯會改用免費的基本翻譯
- 連結預覽：`netlify/functions/preview.mjs`
