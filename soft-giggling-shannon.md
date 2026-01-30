# UI 修改計畫書：依據 Prototype 樣版重新設計生產環境 UI

## 目標概述

將現有生產環境的前端介面（`index.html` + `app.js` 與 `admin/index.html` + `admin/admin.js`）改造為符合 prototype 目錄中三個原型的視覺風格與互動模式，同時保留所有既有業務邏輯與後端 API 整合。

---

## 差異分析摘要

### 1. 前端 Member App（`index.html`）vs Prototype（`member_prototype.html` + `tripapp_prototype.html`）

| 面向 | 現行生產版 | Prototype 設計 |
|------|-----------|---------------|
| **架構** | 純 Vanilla JS + DOM 操作 | Alpine.js 響應式 + FontAwesome 圖標 |
| **Onboarding** | 無歡迎頁，直接顯示主畫面 | 有角色選擇頁（團長/團員）+ Trip Code 加入流程 |
| **Header** | 漸層橫幅 + 固定文字 | 白色簡潔 Header + 同步狀態指示燈 |
| **統計卡片** | 白底卡片，紫色數字 | 深色漸層卡片（indigo-600→800），預算進度條 |
| **費用列表** | 帶 emoji + inline HTML 渲染 | FontAwesome 圖示圓形 icon + 同步狀態標籤 |
| **底部導航** | 2 個 Tab（首頁 / 設定）emoji 圖示 | 3 個 Tab（記帳 / 旅遊 / 設定）FontAwesome 圖示 |
| **FAB 按鈕** | SVG + 線性漸層紫色 | FontAwesome plus + indigo-600 實色 + 鎖定灰色 |
| **旅遊同步 Tab** | 不存在（同步功能散在設定頁） | 獨立「旅遊」Tab：雲端同步按鈕 + 團員名單 |
| **鎖定狀態** | 不支援 | 鎖定 Banner + FAB 變灰 + Toast 提示 |
| **通知系統** | 簡單 alert 或 inline 訊息 | Toast 通知系統（圓角膠囊，自動消失） |
| **Modal 動畫** | slideUp 動畫 | bottom-sheet 風格，backdrop blur |
| **新增費用 Modal** | 完整表單（類別/日期/說明/幣別/匯率/金額/照片）| 簡化版（名稱/金額/類別 pill 選擇）|

### 2. Admin App（`admin/index.html`）vs Prototype（`admin_prototype.html`）

| 面向 | 現行生產版 | Prototype 設計 |
|------|-----------|---------------|
| **佈局** | 單頁流，頂部 Header + 篩選列 | 側邊欄（Desktop）+ 頂部工具列 + 行動版漢堡選單 |
| **登入頁** | 簡單卡片式登入 | 維持（可保留） |
| **導航** | Hash routing 切換頁面 | 側邊欄 4 區塊：儀表板/費用審核/團員/設定 |
| **統計資訊** | 無獨立統計卡片 | 4 張統計卡片（Grid 佈局），帶圖示與趨勢指標 |
| **費用審核** | 列表模式 | Grid 卡片模式 + 圖片預覽 + Hover 快速操作 |
| **篩選** | pill button 橫向捲動 | 搜尋框 + 下拉篩選 |
| **詳情 Modal** | 獨立全頁面 | 居中 Modal + 左右分欄（資訊/圖片）+ 底部操作列 |
| **通知** | inline 或 alert | 右上角 Toast（帶 border-left 色彩標記） |
| **設定** | 無獨立設定頁 | 設定頁含旅遊資訊編輯 + Lock toggle + 刪除旅遊 |

---

## 修改策略

**核心原則：** 保留所有 `app.js` 和 `admin.js` 的業務邏輯不動，僅修改 HTML 結構與 CSS 樣式來匹配 Prototype 風格。不引入 Alpine.js 到生產環境（避免架構大改），而是用現有 Vanilla JS 實現相同的視覺效果。

---

## 修改項目

### Phase 1: Member App（`index.html`）

#### 1.1 引入 FontAwesome CDN
- **檔案**: `index.html`
- **動作**: 在 `<head>` 中加入 FontAwesome 6.4.0 CDN link
- **原因**: Prototype 使用 FontAwesome 取代 emoji

#### 1.2 重構 Header
- **檔案**: `index.html`
- **動作**: 將現有紫色漸層 Header 改為白色簡潔風格
  - 左側：使用者身分（圓形 Avatar + 姓名）
  - 右側：同步狀態指示燈（綠色已同步 / 黃色未備份 / 灰色已結案）
- **對應**: `member_prototype.html` 第 93-110 行

#### 1.3 重構統計卡片
- **檔案**: `index.html`
- **動作**: 將白底卡片改為深色漸層卡片
  - 背景色：`bg-gradient-to-br from-indigo-600 to-indigo-800`
  - 白色文字
  - 加入預算進度條
  - 右上角顯示 Trip Code
- **對應**: `member_prototype.html` 第 128-157 行

#### 1.4 重構費用列表
- **檔案**: `index.html` + `app.js`（`updateUI` / `renderExpenseList` 函式）
- **動作**:
  - 使用 FontAwesome 類別圖示取代 emoji
  - 加入同步狀態標籤（已備份/未上傳）
  - 統一卡片圓角與 padding
- **對應**: `member_prototype.html` 第 160-200 行

#### 1.5 新增「旅遊」Tab
- **檔案**: `index.html` + `app.js`
- **動作**:
  - 底部導航從 2 Tab 改為 3 Tab（記帳 / 旅遊 / 設定）
  - 新增旅遊 Tab 內容區：
    - 旅遊資訊卡片（唯讀）
    - 雲端同步操作區（下載/上傳按鈕）
    - 團員名單
  - 將原設定頁中的雲端同步功能搬至旅遊 Tab
- **對應**: `member_prototype.html` 第 203-293 行

#### 1.6 重構 FAB 按鈕
- **檔案**: `index.html`
- **動作**:
  - 改用 FontAwesome `fa-plus` 圖示
  - 背景改為 `bg-indigo-600` 實色
  - 加入鎖定狀態判斷（鎖定時變灰色，點擊顯示 Toast）
- **對應**: `member_prototype.html` 第 340-348 行

#### 1.7 重構底部導航
- **檔案**: `index.html` + `app.js`
- **動作**:
  - 3 Tab Grid 佈局
  - FontAwesome 圖示（receipt / plane / gear）
  - Active 狀態：indigo-600 文字色
  - 未同步時旅遊 Tab 顯示紅點
- **對應**: `member_prototype.html` 第 351-374 行

#### 1.8 新增鎖定狀態 Banner
- **檔案**: `index.html` + `app.js`
- **動作**: 在記帳 Tab 頂部加入鎖定提示 Banner（灰色背景 + 鎖頭圖示 + 說明文字）
- **對應**: `member_prototype.html` 第 119-125 行

#### 1.9 實作 Toast 通知系統
- **檔案**: `index.html` + `app.js`
- **動作**:
  - 將 `showToast` 改為 Prototype 的圓角膠囊風格
  - 頂部居中顯示
  - 帶 FontAwesome 圖示
  - 自動消失動畫
- **對應**: `member_prototype.html` 第 44-53 行

#### 1.10 重構新增費用 Modal
- **檔案**: `index.html`
- **動作**:
  - bottom-sheet 風格（底部滑入）
  - backdrop blur
  - 類別使用 pill button 選擇（保留原有的 select option 以保持完整功能）
  - 關閉按鈕改為圓形灰底
- **注意**: 保留所有原有欄位（類別/日期/說明/幣別/匯率/金額/照片），不做功能刪減
- **對應**: `member_prototype.html` 第 380-431 行（風格參考）

#### 1.11 色彩主題統一
- **檔案**: `index.html`
- **動作**:
  - 主色從 `purple-600/indigo-600` 統一為 `indigo-600`
  - 按鈕漸層改為 indigo 實色系
  - Focus ring 統一為 `focus:border-indigo-500`

---

### Phase 2: Admin App（`admin/index.html`）

#### 2.1 引入 FontAwesome CDN
- **檔案**: `admin/index.html`
- **動作**: 加入 FontAwesome 6.4.0 CDN link

#### 2.2 新增側邊欄佈局
- **檔案**: `admin/index.html` + `admin/admin.js`
- **動作**:
  - Desktop：左側 slate-800 側邊欄（Logo + 4 選單項 + 使用者資訊）
  - 可收合（toggle 按鈕）
  - Mobile：固定 Header + 漢堡選單 Overlay
- **對應**: `admin_prototype.html` 第 76-145 行

#### 2.3 新增頂部工具列
- **檔案**: `admin/index.html`
- **動作**:
  - 頁面標題 + Trip Code 顯示
  - 右側：鎖定狀態燈號 + 匯出報表按鈕
- **對應**: `admin_prototype.html` 第 150-169 行

#### 2.4 新增儀表板視圖
- **檔案**: `admin/index.html` + `admin/admin.js`
- **動作**:
  - 4 張統計卡片 Grid（總支出/待審核/參與人數/剩餘預算）
  - 最新申請紀錄表格
- **對應**: `admin_prototype.html` 第 174-267 行

#### 2.5 重構費用審核視圖
- **檔案**: `admin/index.html` + `admin/admin.js`
- **動作**:
  - 搜尋框 + 下拉篩選取代 pill button
  - Grid 卡片佈局取代列表
  - 卡片含圖片預覽區 + Hover 快速操作（通過/退回）
- **對應**: `admin_prototype.html` 第 270-358 行

#### 2.6 重構詳情 Modal
- **檔案**: `admin/index.html` + `admin/admin.js`
- **動作**:
  - 從全頁面改為居中 Modal（max-w-2xl）
  - 左右分欄（資訊 / 收據圖片）
  - 底部操作列（退回 / 通過審核）
  - Modal Header 灰底
- **對應**: `admin_prototype.html` 第 410-495 行

#### 2.7 新增設定視圖
- **檔案**: `admin/index.html` + `admin/admin.js`
- **動作**:
  - 旅遊資訊設定卡片（旅遊名稱 / Trip Code）
  - 狀態控制卡片（Lock toggle 開關）
  - 危險操作區（刪除旅遊）
- **對應**: `admin_prototype.html` 第 361-404 行

#### 2.8 重構 Toast 通知
- **檔案**: `admin/index.html` + `admin/admin.js`
- **動作**:
  - 右上角 Toast
  - 帶 border-left 色彩標記（green/red/blue）
  - 帶標題與描述
  - 自動消失動畫
- **對應**: `admin_prototype.html` 第 47-73 行

#### 2.9 登入頁保留微調
- **檔案**: `admin/index.html`
- **動作**: 登入頁基本保留，微調色系統一為 indigo 系

---

### Phase 3: 共用樣式優化

#### 3.1 新增自訂 Scrollbar 樣式
- **檔案**: `index.html`, `admin/index.html`
- **動作**: 加入 custom-scroll 滾動條美化（6px 寬，slate 色系）

#### 3.2 安全區域適配
- **檔案**: `index.html`
- **動作**: 底部導航加入 `safe-bottom` 類別（`padding-bottom: env(safe-area-inset-bottom)`）

#### 3.3 動畫效果
- **檔案**: `index.html`, `admin/index.html`
- **動作**: 加入 slide-up 動畫、tab 切換過渡效果

---

## 修改範圍

| 檔案 | 修改類型 | 備註 |
|------|---------|------|
| `index.html` | HTML 結構 + CSS 大改 | 主要工作量 |
| `app.js` | 局部修改（UI 渲染函式） | 保留核心邏輯 |
| `admin/index.html` | HTML 結構 + CSS 大改 | 主要工作量 |
| `admin/admin.js` | 局部修改（UI 渲染函式） | 保留核心邏輯 |
| `shared/api-client.js` | 不修改 | - |
| `gas/Code.gs` | 不修改 | - |
| `sw.js` / `manifest.json` | 不修改 | - |

---

## 不做的事項

1. **不引入 Alpine.js** — 生產環境維持 Vanilla JS 架構
2. **不刪減功能欄位** — 新增費用的所有欄位（幣別/匯率等）保留
3. **不修改 API 層** — `shared/api-client.js` 不動
4. **不修改後端** — `gas/Code.gs` 不動
5. **不修改 PWA 設定** — `sw.js` / `manifest.json` 不動

---

## 驗證方式

1. 在瀏覽器中開啟 `index.html`，確認：
   - 底部 3 Tab 導航正常切換
   - 新增費用流程正常（含照片上傳）
   - 統計卡片數據正確
   - Toast 通知正常顯示
   - 雲端同步功能正常
2. 在瀏覽器中開啟 `admin/index.html`，確認：
   - 側邊欄展開/收合正常
   - 登入流程正常
   - 費用審核 Grid 卡片顯示正常
   - 詳情 Modal 正常開關
   - 篩選搜尋功能正常
3. 手機模式（Chrome DevTools Device Mode）檢查響應式佈局

---

## 建議執行順序

1. Phase 1: Member App（`index.html` + `app.js`）— 1.1 → 1.11
2. Phase 2: Admin App（`admin/index.html` + `admin/admin.js`）— 2.1 → 2.9
3. Phase 3: 共用樣式優化 — 3.1 → 3.3
