# v3.1.46 發布紀錄

**發布日期**: 2026-02-07  
**版本**: v3.1.46 (Major.Minor.GAS_Version)  
**Build**: 20260207-1  
**GAS Version**: 46  
**Deployment ID**: AKfycbxuHXEIwweaK9UzxjeWe_Pydb1yedVRoALUF3korS0U5qQrBbvI_y0UkmrXon4Wxnqk

---

## 🛠️ 修正與優化 (Fixes & Improvements)

### 1. 修正 `ReferenceError: setupEventListeners is not defined`
**問題**: 
- 部分用戶在 v3.1.45 更新後遇到 `setupEventListeners` 未定義的錯誤。
- 這是因為舊版程式碼殘留的函式呼叫。

**解決**: 
- 已移除無效的 `setupEventListeners()` 呼叫。
- 確保所有事件監聽器採用個別綁定方式。

### 2. 優化團長綁定流程
- 確保團長建立旅程後，能正確執行員工綁定。
- 優化錯誤處理機制。

---

## 🎉 v3.1 重點新功能 (Rolled over from v3.1.45)

### 1. 成員下拉選單顯示真實員工姓名
- 下拉選單顯示格式：**`張三（張一二）`**
  - 張三 = MemberName（該成員在 Trip 中的名稱）
  - 張一二 = RealName（從 EmployeesMaster 查詢的真實員工姓名）
- 避免選錯人，造成資料混淆。

### 2. 團長員工綁定功能
- 團長精靈 Step 2 增加員工選擇欄位。
- 建立旅程後自動呼叫 `joinTrip` API 綁定團長。

---

## 📋 部署檢查清單

- [x] clasp push - 上傳 GAS 檔案
- [x] clasp deploy - 建立 Version 46
- [x] 更新 version.json → v3.1.46
- [x] 更新 config.json → v3.1.46
- [x] 更新 sw.js → APP_VERSION = '3.1.46'
- [x] 更新 app.js → APP_VERSION = '3.1.46'
- [x] Git commit 與 push

---

**部署完成時間**: 2026-02-07 02:25  
**部署負責人**: AI Assistant  
**狀態**: ✅ 部署成功
