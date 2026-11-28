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
├─ logo-mark.svg           Re-Bo logo（由原始點陣圖描邊成向量，單色；導覽列用 CSS mask 上色）
├─ favicon.svg / favicon-32.png / apple-touch-icon.png   分頁與主畫面圖示（橘色 logo、深色底）
└─ js/
   ├─ main.js              載入畫面、Lenis/GSAP 串接、各區塊動畫、試算器
   ├─ ribbons.js           Hero 3D 絲帶（three.js + 自寫 GLSL）
   ├─ distort.js           資源預覽（位移貼圖 + RGB 色散轉場）
   ├─ art.js               以程式繪製的資源卡片貼圖
   ├─ kinetic-grid.js      互動背景網格（格線朝游標彎曲、節點發亮、點擊產生漣漪）
   ├─ text-fx.js           中文斷詞逐字揭示、亂碼解碼
   └─ audio.js             Web Audio 環境音（需使用者同意才播放）
```

## 行為說明

- 所有路徑皆為相對路徑，可部署在網域根目錄或 repo 子路徑（例如 GitHub Pages 的 `/<repo>/`）。
- 沒有 WebGL、軟體算圖、或 CDN 被擋／太晚載入時，會自動退回 CSS 背景與純內容版面。
- 支援 `prefers-reduced-motion`：不啟用平滑捲動、釘選與動畫。
- 互動背景（`kinetic-grid.js`）：整頁最底層是一張固定的畫布網格，深色區塊是透明的，所以網格從後面透出來；
  淺色區塊不透明，會蓋住它。滑鼠靠近時格線會朝游標彎曲、附近節點與格線變橘發亮，點擊任何地方會送出一圈漣漪。
  由「KineticGrid」畫布元件移植成原生 JS（原版是 React / Tailwind），改成橘色主題、支援高解析度螢幕，
  靜止時自動休眠。只有有滑鼠的裝置才會跟著游標；觸控裝置只有點擊漣漪，「減少動態」模式只畫靜態網格。
- 互動按鈕：滑鼠移上去時，按鈕左邊的小方塊會展開填滿整個按鈕，文字換成帶箭頭的版本
  （由「InteractiveHoverButton」元件移植成 CSS）。沒有 JavaScript 時仍是普通按鈕；觸控裝置不套用 hover 效果。
- Hero：光帶畫布固定在背景，標題區塊隨頁面捲走；淺色區塊蓋住 hero 之後，hero 會被隱藏，不會從透明的深色區塊透出來。
- 內容標示：目前 MVP 只有「資源租借」；二手交易、私訊、檢舉與學校信箱限制標為「規劃中」，規則標為「草案」。

## 版權與參考

互動手法的靈感來自 vault.hyperiux.com；本站的程式、shader、文案與圖像皆為原創，沒有使用其程式碼或素材。
