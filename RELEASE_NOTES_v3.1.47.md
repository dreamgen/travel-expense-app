# Release Notes v3.1.47

### Bug Fixes
- **加入旅遊流程修正**: 修復了在加入旅遊 (joinTrip) 時，成功取得團員資訊後，成員選擇選單區域 (memberSection) 沒有正確顯示，導致流程卡住的問題。 (Fix member selection UI not showing in joinTrip flow)

### Details
- Updated `memberSection.classList.remove('hidden')` logic in `app.js`.
- GAS Deployment Version: `47`
