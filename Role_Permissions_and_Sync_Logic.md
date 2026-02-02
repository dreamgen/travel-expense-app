# 旅遊記帳系統：角色權限盤點與雲端同步邏輯方案

## 1. 角色權限與使用情境盤點 (Role & Permission Matrix)

本系統操作介面包含 **前端記帳 App (Mobile)** 與 **後台管理介面 (Admin Panel)**。

### 1.1 角色定義

*   **團長 (Admin)**：
    *   **App 端**：負責全域設定（行程、匯率）及個人記帳。
    *   **後台端**：擁有最高管理權限，可維護人員名單，並在特殊情況下協助修正團員單據。
*   **團員 (Member)**：僅負責自己的記帳，以及維護自己的基本資料。
*   **審核人員 (Auditor)**：負責查核所有單據。可讀取所有資料，但僅能寫入審核狀態與備註，不可修改單據內容。

### 1.2 功能權限矩陣表

| 資料模組 | 功能細項 | 團長 (Admin) | 團員 (Member) | 審核人員 (Auditor) | 備註 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **A. 行程/匯率** | 查看 | ✅ | ✅ | ✅ | 全員皆可讀取 |
| | 修改 | ✅ | ❌ | ❌ | 僅團長可改 |
| **B. 人員資料** | 修改自己資料 | ✅ | ✅ | ❌ | |
| | 修改他人資料 | ✅ (僅後台) | ❌ | ❌ | 團長後台管理權限 |
| **C. 記帳單據** | 新增/修改 (自己) | ✅ | ✅ | ❌ | 只能動 **自己的** uid 資料 |
| | 修改 (他人) | ✅ (僅後台+註記) | ❌ | ❌ | 團長特權：僅限後台修正錯誤，須留紀錄 |
| | 讀取單據內容 | ✅ | ✅ (僅自己) | ✅ (全部) | 審核員需看全部才能審核 |
| **D. 審核資訊** | 修改狀態/備註 | ❌ (僅重置) | ❌ (僅重置) | ✅ (專屬權限) | 僅審核人員可寫入。他人修改單據時會自動重置為「待審核」。 |
| **E. 資料同步** | 上傳更新 | ✅ | ✅ | ✅ | 觸發各自的同步邏輯 |

## 2. 雲端同步與衝突解決邏輯 (Synchronization Logic)

採用 「**基於身份與角色的分流處理 (Identity & Role Based Partitioning)**」 策略。

### 2.1 核心原則

1.  **資料分權**：Member 只能改自己的 Rows。
2.  **審核獨立**：單據內容 (Amount/Item) 與 審核資訊 (Status/Remark) 權限分離。
3.  **內容變更即重置**：若單據內容被修改（無論是本人或團長），審核狀態一律強制重置為「待審核」。

### 2.2 資料流情境設計 (Data Flow Scenarios)

#### 情境 A：團員 (Member) / 團長 (App) 個人記帳同步

*   **上傳內容**：`uid`, `role="member"`, `expenses=[...]`
*   **後端邏輯**：
    *   **鎖定範圍**：僅針對該 uid 的資料列。
    *   **更新單據**：刪除舊資料，寫入新資料。
    *   **審核重置**：寫入時，強制將 Status 欄位設為 `Pending` (待審核)，清空 `AuditRemark`。
    *   **權限防護**：忽略上傳資料中的 `Status` 欄位值（防止自肥）。

#### 情境 B：團長 (Admin) 全域同步 (App端)

*   **上傳內容**：`uid`, `role="admin"`, `tripInfo={...}`, `expenses=[...]`
*   **後端邏輯**：
    *   **更新全域**：覆蓋 Config 表的行程與匯率。
    *   **更新單據**：同情境 A，只更新團長自己的單據，並重置審核狀態。

#### 情境 C：團長 (Admin) 後台修正單據 (特權操作)

*   **上傳內容**：`action="admin_fix_expense"`, `target_uid`, `expense_id`, `new_data`, `admin_uid`
*   **後端邏輯**：
    *   **鎖定單筆**：在 Expenses 表中找到特定 UID 的特定單據。
    *   **寫入變更**：更新金額或項目。
    *   **強制稽核**：在備註欄自動追加 `[修正 by Admin]` 字樣。
    *   **審核重置**：狀態設為 `Pending`。

#### 情境 D：審核人員 (Auditor) 批次審核

*   **上傳內容**：`uid`, `role="auditor"`, `audit_updates=[ {id: "exp1", status: "Approved", remark: "OK"}, ... ]`
*   **後端邏輯**：
    *   **唯讀保護**：嚴禁修改日期、項目、金額等消費資訊。
    *   **寫入審核**：依據 `id` 搜尋資料列，僅更新 `Status` 與 `AuditRemark` 欄位。
    *   **衝突檢查**：若找不到 ID (已被刪除) 則忽略該筆回報錯誤。

## 3. 邏輯實作虛擬碼 (Pseudo Code for GAS)

```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  
  if (lock.tryLock(10000)) {
    try {
      // 路由分流
      switch (data.role) {
        case 'member':
          return handleMemberSync(data); // 情境 A
        case 'admin':
          // 區分 App 端同步還是後台操作
          if (data.action === 'admin_fix_expense') return handleAdminFix(data); // 情境 C
          if (data.action === 'update_member_list') return handleAdminMemberUpdate(data);
          return handleAdminSync(data); // 情境 B
        case 'auditor':
          return handleAuditorSync(data); // 情境 D
        default:
          throw new Error("Unknown role");
      }
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}));
    } finally {
      lock.releaseLock();
    }
  }
}

// 情境 A & B: 一般記帳同步 (含團長個人)
function handleMemberSync(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Expenses');
  const uid = data.uid;
  
  // 1. 讀取現有資料
  const allData = sheet.getDataRange().getValues();
  
  // 2. 過濾掉這個人的舊資料 (保留別人的)
  const otherData = allData.filter(row => row[0] !== uid && row[0] !== 'UID'); 
  
  // 3. 準備新資料 (強制重置審核狀態)
  const myNewData = data.expenses.map(exp => [
    uid, 
    exp.date, 
    exp.item, 
    exp.amount, 
    'Pending', // Status 強制重置
    ''         // Remark 強制清空
  ]);
  
  // 4. 寫回
  // ... (寫入邏輯) ...
}

// 情境 C: 團長後台單筆修正
function handleAdminFix(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Expenses');
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 0; i < rows.length; i++) {
    // 找到目標單據 (比對 UID 和 ExpenseID)
    if (rows[i][0] === data.target_uid && rows[i][1] === data.expense_id) {
      // 更新內容
      sheet.getRange(i + 1, 4).setValue(data.new_data.amount); // 假設第4欄是金額
      
      // 稽核註記 & 重置審核
      const currentNote = rows[i][6]; // 假設第7欄是備註
      sheet.getRange(i + 1, 7).setValue(currentNote + ` [Fixed by ${data.admin_uid}]`);
      sheet.getRange(i + 1, 5).setValue('Pending'); // 重置審核狀態
      break;
    }
  }
  return ContentService.createTextOutput(JSON.stringify({status: 'success'}));
}

// 情境 D: 審核人員同步
function handleAuditorSync(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Expenses');
  const rows = sheet.getDataRange().getValues();
  // 建立 ID 對 Row Index 的 Map 以加速搜尋
  const idMap = new Map();
  rows.forEach((row, index) => {
    if (index > 0) idMap.set(row[1], index + 1); // 假設 row[1] 是 ExpenseID
  });
  
  // 批次更新
  data.audit_updates.forEach(update => {
    const rowIndex = idMap.get(update.id);
    if (rowIndex) {
      // 僅寫入 Status (Col 5) 和 Remark (Col 6)
      sheet.getRange(rowIndex, 5).setValue(update.status);
      sheet.getRange(rowIndex, 6).setValue(update.remark);
    }
  });
  
  return ContentService.createTextOutput(JSON.stringify({status: 'success'}));
}
```
