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
}
