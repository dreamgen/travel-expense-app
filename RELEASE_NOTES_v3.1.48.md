# Release Notes v3.1.48

### Bug Fixes
- **團長員工ID未寫入修正**: 修復了團長建立旅程時，選擇員工身份後 EmployeeID 未正確寫入 TripMembers 表的問題。 (Fix leader EmployeeID not saved to TripMembers)

### Details
- Updated `handleJoinTrip` in `Code.gs` to update EmployeeID when in recovery mode if the existing EmployeeID is empty.
- Includes previous fix from v3.1.47: member selection UI in joinTrip flow.
- GAS Deployment Version: `48`
