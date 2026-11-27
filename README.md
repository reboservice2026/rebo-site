# Re-Bo 3D 展示網站

北科永續公民實踐（B20）專題「Re-Bo」的展示網站：各系學會的資源租借與二手交易平台。
純靜態網站（HTML / CSS / ES modules），不需要 build。three.js、GSAP、Lenis 由 CDN 載入並固定版本。

線上版：https://reboservice2026.github.io/rebo-site/

## 本機預覽

```bash
python -m http.server 8765
# 開啟 http://127.0.0.1:8765/
```

必須透過 http 伺服器開啟（ES modules 不能用 `file://`）。

## 結構

```
index.html                 頁面內容（繁體中文）與區塊結構
assets/
├─ css/styles.css          版面、深淺主題、響應式
└─ js/
   ├─ main.js              載入畫面、Lenis/GSAP 串接、各區塊動畫、試算器
   ├─ ribbons.js           Hero 3D 絲帶（three.js + 自寫 GLSL）
   ├─ distort.js           資源預覽（位移貼圖 + RGB 色散轉場）
   ├─ art.js               以程式繪製的資源卡片貼圖
   ├─ text-fx.js           中文斷詞逐字揭示、亂碼解碼
   └─ audio.js             Web Audio 環境音（需使用者同意才播放）
```

## 行為說明

- 所有路徑皆為相對路徑，可部署在網域根目錄或 repo 子路徑（例如 GitHub Pages 的 `/<repo>/`）。
- 沒有 WebGL、軟體算圖、或 CDN 被擋／太晚載入時，會自動退回 CSS 背景與純內容版面。
- 支援 `prefers-reduced-motion`：不啟用平滑捲動、釘選與動畫。
- 內容標示：目前 MVP 只有「資源租借」；二手交易、私訊、檢舉與學校信箱限制標為「規劃中」，規則標為「草案」。

## 版權與參考

互動手法的靈感來自 vault.hyperiux.com；本站的程式、shader、文案與圖像皆為原創，沒有使用其程式碼或素材。
