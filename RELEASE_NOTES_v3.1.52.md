# Release Notes v3.1.52

### UX Fixes (員工綁定流程優化)

1. **員工選擇改為必選**
   - HTML 標籤從「選擇對應員工 (可選)」改為「選擇對應員工」
   - 下拉選單預設選項從「-- 略過員工綁定 --」改為「-- 請選擇員工 --」

2. **同時顯示搜尋欄與員工下拉選單**
   - 當成員選擇區塊出現時，立即顯示員工下拉選單
   - 不再需要按兩次「加入旅遊」才能看到員工下拉選單

3. **必選驗證**
   - 團員加入時，如未選擇員工會提示「請選擇對應員工」
   - 團長建立旅遊時，如未選擇員工會提示「請選擇對應員工」

### Files Changed
- `index.html`: Updated labels and placeholders
- `app.js`: Show employee dropdown immediately, added validations

- GAS Deployment Version: `52`
