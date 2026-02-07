# Release Notes v3.1.51

### UX Improvements (員工搜尋優化)

1. **提示文字**：BBB 輸入欄位新增 placeholder「請輸入姓名或EMAIL查詢員工對應」
2. **下拉選單格式**：員工顯示格式從 `姓名 (EmployeeID) - 部門` 改為 `姓名（EMAIL）`
3. **即時篩選**：輸入時即時篩選符合的員工（部分比對），只要一個符合就自動選中

### Details
- Added `populateEmployeeDropdown(employeeList, filterText)` function
- Added `filterEmployeeList(searchText)` function for real-time filtering
- HTML oninput handler triggers `filterEmployeeList()` on every keystroke
- Partial matching on both name and email (case-insensitive)

- GAS Deployment Version: `51`
