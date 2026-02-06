# v3.0.0 發布紀錄

**發布日期**: 2026-02-06  
**版本號**: v3.0.0  
**Build**: 20260206-1  
**GAS Version**: 44

## 🎉 主要新功能

### 員工綁定系統
- ✅ **EmployeesMaster 員工主檔**：集中管理員工資料（ID、姓名、Email、部門、月度上限）
- ✅ **TripMembers 旅程成員表**：記錄成員與員工的綁定關係
- ✅ **智能員工匹配**：自動根據姓名或 Email 比對員工
- ✅ **可選綁定機制**：允許成員選擇是否綁定員工

### 新增 API
- `getTripInfo(tripcode)` - 取得旅程資訊、成員清單、員工清單
- `joinTrip(tripcode, memberName, employeeId, role)` - 加入旅程並綁定員工

### 後端增強
- `handleDownloadTrip`：返回 TripMembers 和 EmployeesMaster 資料
- `handleAdminGetTripDetail`：返回完整員工綁定資訊
- `handleSubmitTrip`：支援寫入 EmployeeID 到 Expenses

### 前端更新
- **員工綁定 UI**：Onboarding 流程中增加員工選擇介面
- **自動比對提示**：智能推薦可能的員工綁定
- **費用提交**：自動包含綁定的 employeeID

### Admin 後台增強
- **新增欄位**：員工 ID、Email、跨旅程總計、月度上限
- **跨旅程統計**：顯示同一員工在多個旅程的總支出
- **使用率顯示**：月度上限使用百分比

## 📦 技術細節

### Database Schema

#### EmployeesMaster
| 欄位 | 說明 |
|------|------|
| EmployeeID | 員工編號（唯一） |
| Name | 員工姓名 |
| Email | Email |
| Department | 部門 |
| MonthlyLimit | 月度補助上限 |
| UsedAmount | 已使用金額 |

#### TripMembers
| 欄位 | 說明 |
|------|------|
| TripCode | 旅程代碼 |
| MemberName | 成員名稱 |
| EmployeeID | 綁定的員工 ID（可選） |
| BindingTimestamp | 綁定時間 |

### 修改的檔案
- `gas/Code.gs` - 後端 API 更新
- `shared/api-client.js` - API client 新增方法
- `app.js` - 前端綁定流程
- `index.html` - 員工綁定 UI
- `admin/admin.js` - Admin 統計功能
- `admin/index.html` - Admin 表格欄位
- `version.json` - 版本更新
- `config.json` - 配置更新

## 🔄 向後兼容性

- ✅ 完全兼容舊版資料
- ✅ 未綁定員工的成員仍可正常使用
- ✅ Fallback 機制處理無員工綁定資料的情況

## 📋 部署檢查清單

- [x] 更新版本號到 v3.0.0
- [x] Git commit 並 push 到 GitHub
- [x] clasp push 上傳 GAS 檔案
- [x] clasp deploy 部署新版本
- [ ] 在 Google Sheets 建立 EmployeesMaster 測試資料
- [ ] 在 Google Sheets 建立 TripMembers 測試資料
- [ ] 測試員工綁定流程
- [ ] 測試 Admin 後台統計功能

## 🎯 後續工作

1. **資料遷移腳本**：建立遷移函式將現有資料轉換到新 schema
2. **端到端測試**：完整測試員工綁定流程
3. **文件更新**：更新使用手冊說明新功能

## 📝 已知限制

- 需要手動建立和維護 EmployeesMaster 表
- 跨旅程統計僅計算已核銷金額
- MonthlyLimit 的使用率需手動管理（未自動扣除）

## 🚀 下次發布計劃

- v3.0.1: 資料遷移腳本
- v3.1.0: 自動化員工主檔同步
- v3.2.0: 月度上限自動管理
