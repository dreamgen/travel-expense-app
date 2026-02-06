# v3.1.45 發布紀錄

**發布日期**: 2026-02-06  
**版本**: v3.1.45 (Major.Minor.GAS_Version)  
**Build**: 20260206-2  
**GAS Version**: 45  
**Deployment ID**: AKfycbxuHXEIwweaK9UzxjeWe_Pydb1yedVRoALUF3korS0U5qQrBbvI_y0UkmrXon4Wxnqk

---

## 🎉 主要新功能

### 1. 成員下拉選單顯示真實員工姓名

**問題背景**：
- 舊版下拉選單只顯示 MemberName（例如「張三」）
- 無法區分不同裝置使用相同名稱加入的情況
- 容易選錯人，造成資料混淆

**解決方案**：
- 下拉選單顯示格式：**`張三（張一二）`**
  - 張三 = MemberName（該成員在 Trip 中的名稱）
  - 張一二 = RealName（從 EmployeesMaster 查詢的真實員工姓名）
- 未綁定員工時僅顯示：**`張三`**
- 選擇後使用 MemberName，保持該成員在 Trip 中的原始名稱

**技術實作**：
- 後端：`handleGetTripInfo` 新增 `tripMembers` 陣列回傳
- 前端：下拉選單填充邏輯使用 `tripMembers` 資料
- 保留向下相容：fallback 使用 `existingMembers`

### 2. 團長員工綁定功能

**問題背景**：
- 團長建立旅程時沒有員工綁定選項
- 無法在建立時直接綁定團長的 employeeID
- 需要額外步驟才能建立團長的員工關聯

**解決方案**：
- 團長精靈 Step 2 增加員工選擇欄位
- 建立旅程後自動呼叫 `joinTrip` API 綁定團長
- 團長可選擇略過綁定（可選功能）

**技術實作**：
- HTML：新增 `leaderEmployeeBindingSection`
- `leaderSetupNext(1)`：取得員工清單並填充下拉選單
- `leaderSetupNext(2)`：建立旅程後呼叫 `joinTrip` 綁定

---

## 📦 技術細節

### Backend Changes (gas/Code.gs)

#### handleGetTripInfo 增強
**新增回傳欄位**: `tripMembers[]`

```javascript
{
  "tripMembers": [
    {
      "memberName": "張三",
      "employeeID": "EMP001",
      "realName": "張一二"  // 從 EmployeesMaster 查詢
    }
  ]
}
```

**實作邏輯**：
1. 建立 `employeeMasterMap`（employeeID → employee info）
2. 從 TripMembers 取得成員資料
3. 根據 employeeID 查詢 EmployeesMaster 取得 realName
4. Fallback: 處理舊資料（從 Trips.members）

### Frontend Changes

#### app.js - confirmJoinTrip 更新
**下拉選單填充邏輯**：
```javascript
tripMembers.forEach(member => {
    const opt = document.createElement('option');
    opt.value = member.memberName;
    const displayText = member.realName 
        ? `${member.memberName}（${member.realName}）`
        : member.memberName;
    opt.textContent = displayText;
    memberSelect.appendChild(opt);
});
```

#### app.js - leaderSetupNext 增強
**Step 1 → Step 2 過渡**：
- 呼叫 `getTripInfo('DUMMY')` 取得員工清單
- 填充團長員工選擇下拉選單

**Step 2 完成建立**：
- 取得選擇的 employeeID
- 呼叫 `joinTrip(tripCode, userName, employeeID, 'leader')`
- 儲存員工綁定資訊到 `appData.employeeBinding`

#### index.html
新增 `leaderEmployeeBindingSection`：
```html
<div id="leaderEmployeeBindingSection" class="hidden">
    <label>選擇對應員工 (可選)</label>
    <select id="leaderEmployeeSelect">
        <option value="">-- 略過員工綁定 --</option>
    </select>
</div>
```

---

## 📋 部署檢查清單

- [x] clasp push - 上傳 GAS 檔案
- [x] clasp deploy - 建立 Version 45
- [x] 更新 version.json → v3.1.45
- [x] 更新 config.json → v3.1.45
- [x] 更新 sw.js → APP_VERSION = '3.1.45'
- [x] 更新 app.js → APP_VERSION = '3.1.45'
- [x] Git commit 與 push

---

## 🔄 向後相容性

- ✅ 完全兼容舊版資料
- ✅ 未綁定員工的成員正常顯示
- ✅ Fallback 處理 `existingMembers`（舊版 API）
- ✅ 團長可略過員工綁定（可選功能）

---

## 🧪 測試建議

### 測試案例 1: 成員恢復（已綁定員工）
1. 確保 TripMembers 有記錄：`MemberName="張三", EmployeeID="EMP001"`
2. 確保 EmployeesMaster 有記錄：`EmployeeID="EMP001", Name="張一二"`
3. 加入旅程時應顯示：**張三（張一二）**

### 測試案例 2: 成員恢復（未綁定員工）
1. TripMembers 記錄：`MemberName="王五", EmployeeID=""`
2. 下拉選單應顯示：**王五**（無括號）

### 測試案例 3: 團長建立並綁定
1. 建立新旅程，進入 Step 2
2. 觀察員工選擇欄位顯示
3. 選擇員工並建立
4. 驗證 TripMembers 中團長記錄包含 EmployeeID

---

## 📝 已知限制

- 需要 EmployeesMaster 資料才能顯示真實姓名
- 團長員工清單使用 `getTripInfo('DUMMY')` 取得（workaround）
- 後續可考慮新增專用 API 取得員工清單

---

## 🎯 下次發布計劃

- v3.1.46: Bug fixes 與優化
- v3.2.0: 費用提交增強功能
- v3.3.0: 報表與統計功能

---

**部署完成時間**: 2026-02-06 16:52  
**部署負責人**: AI Assistant  
**狀態**: ✅ 部署成功
