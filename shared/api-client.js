/**
 * 旅遊費用申請 - API Client
 * 封裝所有 Google Apps Script API 呼叫
 */
class TravelAPI {
  constructor(gasUrl) {
    this.gasUrl = gasUrl;
  }

  /**
   * 發送 POST 請求到 GAS
   */
  async _post(payload) {
    const response = await fetch(this.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    return await response.json();
  }

  /**
   * 員工上傳旅遊申請
   * @param {Object} data - { tripInfo, employees, expenses, submittedBy }
   * @returns {Object} - { success, tripCode }
   */
  async submitTrip(data) {
    return this._post({
      action: 'submitTrip',
      ...data
    });
  }

  /**
   * 查詢審核狀態
   * @param {string} tripCode
   * @returns {Object} - { success, trip }
   */
  async getTripStatus(tripCode) {
    return this._post({
      action: 'getTripStatus',
      tripCode: tripCode
    });
  }

  /**
   * 管理員登入
   * @param {string} password
   * @returns {Object} - { success, token }
   */
  async adminLogin(password) {
    return this._post({
      action: 'adminLogin',
      password: password
    });
  }

  /**
   * 取得所有旅遊申請列表（需認證）
   * @param {string} token
   * @returns {Object} - { success, trips }
   */
  async adminGetTrips(token) {
    return this._post({
      action: 'adminGetTrips',
      token: token
    });
  }

  /**
   * 取得單一申請詳情（需認證）
   * @param {string} token
   * @param {string} tripCode
   * @returns {Object} - { success, trip, expenses, employees }
   */
  async adminGetTripDetail(token, tripCode) {
    return this._post({
      action: 'adminGetTripDetail',
      token: token,
      tripCode: tripCode
    });
  }

  /**
   * 審核操作（需認證）
   * @param {string} token
   * @param {string} tripCode
   * @param {string} reviewAction - approved / rejected / needs_revision
   * @param {string} note - 審核備註
   * @returns {Object} - { success, message }
   */
  async adminReview(token, tripCode, reviewAction, note) {
    return this._post({
      action: 'adminReview',
      token: token,
      tripCode: tripCode,
      reviewAction: reviewAction,
      note: note || ''
    });
  }

  /**
   * 逐筆審核單一費用（需認證）
   * @param {string} token
   * @param {string} tripCode
   * @param {string} expenseId
   * @param {string} reviewAction - approved / rejected / needs_revision
   * @param {string} note
   * @returns {Object} - { success, message }
   */
  async adminReviewExpense(token, tripCode, expenseId, reviewAction, note) {
    return this._post({
      action: 'adminReviewExpense',
      token: token,
      tripCode: tripCode,
      expenseId: expenseId,
      reviewAction: reviewAction,
      note: note || ''
    });
  }

  /**
   * 批次審核多筆費用（需認證）
   * @param {string} token
   * @param {string} tripCode
   * @param {Array} reviews - [{expenseId, reviewAction, note}]
   * @returns {Object} - { success, message }
   */
  async adminBatchReviewExpenses(token, tripCode, reviews) {
    return this._post({
      action: 'adminBatchReviewExpenses',
      token: token,
      tripCode: tripCode,
      reviews: reviews
    });
  }

  /**
   * 取得照片（需認證）
   * @param {string} token
   * @param {string} fileId - Google Drive 檔案 ID
   * @returns {Object} - { success, photo }
   */
  async adminGetPhoto(token, fileId) {
    return this._post({
      action: 'adminGetPhoto',
      token: token,
      fileId: fileId
    });
  }

  /**
   * 檢查同名資料（同名檢核）
   * @param {string} tripCode
   * @param {string} submittedBy - 提交人姓名
   * @returns {Object} - { success, hasDuplicate, lastUpdated }
   */
  async checkDuplicate(tripCode, submittedBy) {
    return this._post({
      action: 'checkDuplicate',
      tripCode: tripCode,
      submittedBy: submittedBy
    });
  }

  /**
   * 下載/同步雲端資料（跨裝置）
   * @param {string} tripCode
   * @param {string} submittedBy - 提交人姓名（可選）
   * @returns {Object} - { success, tripInfo, expenses, employees, photos, serverLastModified }
   */
  async downloadTrip(tripCode, submittedBy) {
    return this._post({
      action: 'downloadTrip',
      tripCode: tripCode,
      submittedBy: submittedBy || ''
    });
  }

  /**
   * 管理員鎖定 Trip（需認證）
   * @param {string} token
   * @param {string} tripCode
   * @returns {Object} - { success, isLocked }
   */
  async adminLockTrip(token, tripCode) {
    return this._post({
      action: 'adminLockTrip',
      token: token,
      tripCode: tripCode
    });
  }

  /**
   * 管理員解鎖 Trip（需認證）
   * @param {string} token
   * @param {string} tripCode
   * @returns {Object} - { success, isLocked }
   */
  async adminUnlockTrip(token, tripCode) {
    return this._post({
      action: 'adminUnlockTrip',
      token: token,
      tripCode: tripCode
    });
  }

  // ============================================
  // V2: 新增 API 方法
  // ============================================

  /**
   * 團長登入（V2）
   * @param {string} tripCode
   * @param {string} password
   * @returns {Object} - { success, token, tripCode, leaderName, members }
   */
  async loginLeader(tripCode, password) {
    return this._post({
      action: 'loginLeader',
      tripCode: tripCode,
      password: password
    });
  }

  /**
   * 取得成員名單（V2）
   * @param {string} tripCode
   * @returns {Object} - { success, members: [{name, department}] }
   */
  async getMembers(tripCode) {
    return this._post({
      action: 'getMembers',
      tripCode: tripCode
    });
  }

  /**
   * 取得費用（V2 分級查詢）
   * @param {string} tripCode
   * @param {string} role - 'member' | 'leader' | 'auditor'
   * @param {string} memberName - 團員姓名（member 級需要）
   * @param {string} token - leader 或 admin token（leader/auditor 級需要）
   * @returns {Object} - { success, expenses }
   */
  async getExpenses(tripCode, role, memberName, token) {
    const actionMap = {
      member: 'getExpenses',
      leader: 'leaderGetExpenses',
      auditor: 'adminGetExpenses'
    };
    return this._post({
      action: actionMap[role] || 'getExpenses',
      tripCode: tripCode,
      memberName: memberName || '',
      token: token || ''
    });
  }

  /**
   * 更新旅遊團務狀態（V2）
   * @param {string} tripCode
   * @param {string} tripStatus - 'Open' | 'Submitted' | 'Closed'
   * @param {string} token - leader 或 admin token
   * @returns {Object} - { success, tripStatus, message }
   */
  async submitTripStatus(tripCode, tripStatus, token) {
    return this._post({
      action: 'submitTripStatus',
      tripCode: tripCode,
      tripStatus: tripStatus,
      token: token
    });
  }

  /**
   * 檢查 Server 版本（V2）
   * @param {string} tripCode
   * @param {string} clientLastModified - ISO timestamp
   * @returns {Object} - { success, hasUpdate, serverLastModified, tripStatus, isLocked }
   */
  async checkServerVersion(tripCode, clientLastModified) {
    return this._post({
      action: 'checkServerVersion',
      tripCode: tripCode,
      clientLastModified: clientLastModified || ''
    });
  }

  /**
   * 管理員/團長編輯費用（V2）
   * @param {string} token
   * @param {string} tripCode
   * @param {string} expenseId
   * @param {Object} updates - { amount, category, description, belongTo }
   * @param {string} modifiedBy
   * @returns {Object} - { success, message }
   */
  async adminEditExpense(token, tripCode, expenseId, updates, modifiedBy) {
    return this._post({
      action: 'adminEditExpense',
      token: token,
      tripCode: tripCode,
      expenseId: expenseId,
      updates: updates,
      modifiedBy: modifiedBy || ''
    });
  }
}
