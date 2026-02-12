# Release Notes v3.1.63

### 新功能與優化

**發布日期：** 2026-02-13

#### 1. 旅程日期範圍驗證
- 團長設定旅遊日期時，出發/結束日期必須在 **2026/02/23 ~ 2026/11/17** 範圍內
- HTML date input 加入 `min`/`max` 原生限制
- JavaScript 層面雙重驗證，超範圍時顯示 toast 提示並阻止儲存

#### 2. 日期前後順序檢查
- 結束日期不得早於出發日期
- 偵測到前後顛倒時顯示 toast 警告

#### 3. 統編/抬頭資訊按鈕
- 在首頁 FAB「+」按鈕旁新增琥珀色「i」按鈕
- 點擊彈出統編/抬頭資訊 Modal，大字放大顯示：
  - 統編：**31830261**
  - 抬頭：**鴻揚科技有限公司職工福利委員會**
- 文字可選取，方便商家直接輸入

#### 4. 後台登入遮罩
- 管理後台按下登入按鈕後，顯示全畫面 loading spinner 遮罩
- API 回應後（成功或失敗）自動隱藏

**變更檔案：**
- `app.js` - 日期驗證邏輯、統編 Modal 函式、版本號
- `index.html` - date input min/max、i 按鈕、統編 Modal HTML
- `admin/admin.js` - 登入遮罩邏輯
- `admin/index.html` - 遮罩 HTML
- `version.json`, `config.json`, `sw.js` - 版本號更新
