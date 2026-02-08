# Release Notes v3.1.53

### Bug Fix

**修正 joinTrip memberName 取得問題**

當使用 v3.1.52 新流程（員工下拉選單立即顯示）時，`_pendingMemberName` 未正確設定，導致 API 返回「請提供 tripcode 和 memberName」錯誤。

**根本原因：**
- v3.1.52 改為立即顯示員工下拉選單（無需二次點擊）
- 但設定 `_pendingMemberName` 的邏輯在原流程中被跳過了
- 導致第二次點「加入旅遊」時 memberName 為空

**解決方案：**
在 `confirmJoinTrip` 函數中加入動態取得 memberName 邏輯：
1. 優先使用 `_pendingMemberName` 或 `appData.userName`
2. 若為空，從 `memberSelect` 取得選擇的成員
3. 若選擇「我是新成員」，使用 `onboardingName` 的值
4. 最後驗證並提示用戶

- GAS Deployment Version: `53`
