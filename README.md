# 🏖️ 員工旅遊費用申請與審核系統

一個專為員工旅遊設計的**前後端整合解決方案**。前端為 PWA (Progressive Web App)，讓員工在旅遊途中輕鬆記錄費用；後端為 Google Apps Script，提供雲端審核、資料同步與管理功能。

## ✨ 主要功能

### 📱 前端 APP (員工端)
*   **📸 快速記錄**：拍照上傳單據，支援離線暫存。
*   **☁️ 雲端同步**：
    *   **跨裝置同步**：支援「上傳」與「下載」功能，換手機也能繼續編輯。
    *   **版本控管**：自動偵測版本衝突，避免資料覆蓋。
*   **💰 多幣別支援**：支援 TWD, USD, JPY, EUR, CNY 等，自動換算匯率。
*   **📊 自動統計**：即時計算補助額度與自費金額。
*   **📄 Excel 匯出**：一鍵產生標準申請單。

### 🛡️ 管理後台 (團長/財務端)
*   **📋 案件總覽**：查看所有員工的申請狀態（待審、通過、退回）。
*   **🔎 逐筆審核**：針對每一筆費用進行審核，可標記「需補件」或「退回」。
*   **🔒 鎖定機制**：
    *   **案件鎖定**：結案後鎖定案件，防止員工誤改。
    *   **解鎖功能**：特殊情況可解鎖讓員工重新上傳。
*   **📧 自動通知**：審核退回或需補件時，自動發信通知管理員。

---

## 🚀 部署指南

本系統分為 **後端 (Google Apps Script)** 與 **前端 (GitHub Pages / Static Host)** 兩部分。

### Step 1: 部署後端 (Google Apps Script)

1.  建立一個新的 Google Sheet。
2.  點擊 `擴充功能` > `Apps Script`。
3.  將專案中 `gas/` 資料夾內的 `Code.gs` 內容複製貼上。
4.  設定 **指令碼屬性 (Script Properties)**：
    *   `ADMIN_PASSWORD`: 設定管理後台登入密碼。
    *   `PHOTO_FOLDER_ID`: (選填) 指定 Google Drive 照片上傳資料夾 ID。
    *   `ADMIN_EMAIL`: (選填) 接收審核通知的管理員 Email。
5.  點擊 `部署` > `新增部署` > `網頁應用程式`。
    *   **執行身分**：我 (Me)
    *   **存取權限**：任何人 (Anyone)
6.  複製取得的 **Web App URL**。

### Step 2: 部署前端 (GitHub Pages)

1.  將本專案上傳至 GitHub。
2.  開啟 GitHub Pages 功能，以 `root` 或 `docs` 資料夾發布。
3.  (可選) 或將 `index.html`, `app.js`, `admin/` 等檔案上傳至任何靜態網頁空間。

---

## 📱 使用說明

### 員工端 (Frontend)
1.  開啟前端網址。
2.  首次使用需在「設定」頁面輸入 **Google Apps Script Web App URL**（由團長提供）。
3.  開始記錄費用、拍照。
4.  點擊「上傳至雲端審核」將資料送出。
5.  若需換裝置，在另一台裝置輸入相同 Trip Code 與姓名，點擊「從雲端下載」即可。

### 管理端 (Admin Dashboard)
1.  開啟 `admin/index.html` 頁面（例如 `https://your-site.com/admin/`）。
2.  輸入 **Web App URL** 與 **管理員密碼** 登入。
3.  **審核流程**：
    *   點擊案件進入詳情。
    *   針對每筆費用點擊「通過」、「退回」或「備註」。
    *   若有退回/補件，系統會自動發送通知信。
4.  **結案鎖定**：在詳情頁下方點擊「🔒 鎖定案件」，員工端將無法再變更資料。

---

## 🛠️ 技術架構

*   **Frontend**: Native JavaScript (ES6+), Tailwind CSS, PWA, IndexedDB
*   **Backend**: Google Apps Script (GAS)
*   **Database**: Google Sheets (作為資料庫), Google Drive (圖片儲存)
*   **Authentication**: 自定義簡易 Token 驗證 (Admin)

---

## ⚠️ 注意事項

1.  **GAS 限制**：Google 免費帳戶每日 Email 發送額度為 100 封。
2.  **圖片備份**：上傳之照片會儲存於 Google Drive，請定期備份。
3.  **瀏覽器快取**：前端大幅依賴 LocalStorage 與 Service Worker，若發生異常可嘗試「清除瀏覽器資料」。

---

**版本**: v2.0.0 (含雲端同步與審核功能)
**開發者**: DreamGen Team
