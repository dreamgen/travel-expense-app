# Release Notes v3.1.50

### Bug Fixes
- **MemberName 來源邏輯修正**: 修復了團員加入時 MemberName 錯誤來源的問題。

### Details
根據用戶提供的截圖說明，釐清了三個姓名欄位的用途：

| 欄位 | 標籤 | 用途 |
|------|------|------|
| AAA | 您的姓名 (`onboardingName`) | **MemberName** 的來源 ✓ |
| BBB | 我是新成員 (`newMemberInput`) | 僅用於員工搜尋比對，不儲存 |
| 員工下拉選單 | 陳立仁 (EMP002) | 只儲存 EmployeeID (EMP002)，不儲存員工姓名 |

**程式碼變更：**
- 使用 `onboardingName` (AAA) 作為 MemberName 來源
- 使用 `newMemberInput` (BBB) 進行員工自動比對
- 員工選擇只儲存 EmployeeID，不儲存員工姓名

- GAS Deployment Version: `50`
