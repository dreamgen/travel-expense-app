# Release Notes v3.1.49

### Bug Fixes
- **MemberName 儲存修正**: 修復了團員以新成員加入時，MemberName 可能被儲存為員工姓名而非使用者輸入姓名的問題。 (Fix memberName being saved as employee name instead of user input)

### Details
- Added explicit `window._pendingMemberName` to store user's original input before showing employee binding UI
- Updated `api.joinTrip` call to use the explicitly stored memberName
- Added console.log for debugging: `[joinTrip] memberName: xxx, employeeId: xxx`
- Includes previous fixes:
  - v3.1.48: Leader EmployeeID not saved to TripMembers
  - v3.1.47: Member selection UI in joinTrip flow
- GAS Deployment Version: `49`
