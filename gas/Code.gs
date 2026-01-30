/**
 * 旅遊費用申請 - Google Apps Script 後端
 *
 * 部署步驟：
 * 1. 開新的 Google Sheets
 * 2. 擴充功能 > Apps Script，貼上此程式碼
 * 3. 在 Apps Script 編輯器中執行 initializeSheets() 函式（自動建立工作表與表頭）
 * 4. 專案設定 > 指令碼屬性，新增：
 *    - ADMIN_PASSWORD: 管理員密碼
 *    - PHOTO_FOLDER_ID: Google Drive 資料夾 ID（存放收據照片）
 * 5. 部署 > 新增部署 > 網頁應用程式
 *    - 執行身分：我
 *    - 存取權限：任何人
 */

// ============================================
// Sheets 初始化
// ============================================

/**
 * 初始化 Google Sheets：自動建立所需工作表並設定表頭。
 * 在 Apps Script 編輯器中手動執行此函式即可完成初始化。
 * 重複執行不會覆蓋已有的資料（僅在工作表不存在時建立）。
 */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetConfigs = [
    {
      name: 'Trips',
      headers: [
        'tripCode', 'location', 'startDate', 'endDate',
        'subsidyAmount', 'paymentMethod', 'subsidyMethod',
        'submittedBy', 'submittedDate', 'status',
        'reviewNote', 'reviewDate'
      ]
    },
    {
      name: 'Expenses',
      headers: [
        'tripCode', 'employeeName', 'date', 'category',
        'description', 'currency', 'amount', 'exchangeRate',
        'amountNTD', 'photoFileId', 'photoUrl'
      ]
    },
    {
      name: 'Employees',
      headers: [
        'tripCode', 'name', 'department'
      ]
    }
  ];

  const created = [];
  const skipped = [];

  sheetConfigs.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (sheet) {
      // 工作表已存在，檢查是否有表頭
      const firstRow = sheet.getRange(1, 1, 1, config.headers.length).getValues()[0];
      const hasHeaders = firstRow[0] !== '' && firstRow[0] !== null;
      if (hasHeaders) {
        skipped.push(config.name);
        return;
      }
      // 工作表存在但沒有表頭，補上
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
      sheet.getRange(1, 1, 1, config.headers.length)
        .setFontWeight('bold')
        .setBackground('#4a5568')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      created.push(config.name + ' (補表頭)');
      return;
    }

    // 建立新工作表
    sheet = ss.insertSheet(config.name);
    sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
    sheet.getRange(1, 1, 1, config.headers.length)
      .setFontWeight('bold')
      .setBackground('#4a5568')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    // 設定欄位寬度
    for (let i = 1; i <= config.headers.length; i++) {
      sheet.setColumnWidth(i, 120);
    }

    created.push(config.name);
  });

  // 刪除預設的空白 Sheet1（如果存在且已非唯一）
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (defaultSheet && ss.getSheets().length > 1) {
    const data = defaultSheet.getDataRange().getValues();
    const isEmpty = data.length <= 1 && (data[0].join('') === '');
    if (isEmpty) {
      ss.deleteSheet(defaultSheet);
    }
  }

  // 輸出結果
  const msg = [];
  if (created.length > 0) msg.push('已建立: ' + created.join(', '));
  if (skipped.length > 0) msg.push('已存在（跳過）: ' + skipped.join(', '));
  if (msg.length === 0) msg.push('所有工作表皆已就緒');

  Logger.log('=== Sheets 初始化完成 ===');
  Logger.log(msg.join('\n'));

  SpreadsheetApp.getUi().alert('Sheets 初始化完成\n\n' + msg.join('\n'));
}

// ============================================
// 主要路由
// ============================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      case 'submitTrip':
        return jsonResponse(handleSubmitTrip(data));
      case 'getTripStatus':
        return jsonResponse(handleGetTripStatus(data));
      case 'adminLogin':
        return jsonResponse(handleAdminLogin(data));
      case 'adminGetTrips':
        return jsonResponse(withAuth(data, handleAdminGetTrips));
      case 'adminGetTripDetail':
        return jsonResponse(withAuth(data, handleAdminGetTripDetail));
      case 'adminReview':
        return jsonResponse(withAuth(data, handleAdminReview));
      case 'adminGetPhoto':
        return jsonResponse(withAuth(data, handleAdminGetPhoto));
      default:
        return jsonResponse({ success: false, error: '未知的操作: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  return jsonResponse({ success: true, message: '旅遊費用申請 API 運作中' });
}

// ============================================
// API 處理函式
// ============================================

/**
 * 員工上傳旅遊申請
 */
function handleSubmitTrip(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const expensesSheet = ss.getSheetByName('Expenses');
  const employeesSheet = ss.getSheetByName('Employees');

  // 產生唯一 Trip Code
  const tripCode = generateTripCode(data.tripInfo);

  // 寫入 Trips
  const tripInfo = data.tripInfo;
  tripsSheet.appendRow([
    tripCode,
    tripInfo.location || '',
    tripInfo.startDate || '',
    tripInfo.endDate || '',
    tripInfo.subsidyAmount || 0,
    tripInfo.paymentMethod || '',
    tripInfo.subsidyMethod || '',
    data.submittedBy || '',
    new Date().toISOString().split('T')[0],
    'pending',
    '',
    ''
  ]);

  // 寫入 Employees
  if (data.employees && data.employees.length > 0) {
    const empRows = data.employees.map(emp => [
      tripCode,
      emp.name || '',
      emp.department || ''
    ]);
    employeesSheet.getRange(
      employeesSheet.getLastRow() + 1, 1,
      empRows.length, 3
    ).setValues(empRows);
  }

  // 寫入 Expenses（含照片上傳）
  const photoFolderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  let photoFolder = null;
  if (photoFolderId) {
    photoFolder = DriveApp.getFolderById(photoFolderId);
  }

  if (data.expenses && data.expenses.length > 0) {
    const expRows = [];
    for (const exp of data.expenses) {
      let photoFileId = '';
      let photoUrl = '';

      // 上傳照片到 Drive
      if (exp.photo && photoFolder) {
        try {
          const photoResult = uploadPhotoToDrive(
            photoFolder, tripCode, exp.employeeName || data.submittedBy, exp.photo
          );
          photoFileId = photoResult.fileId;
          photoUrl = photoResult.url;
        } catch (photoErr) {
          // 照片上傳失敗不影響整體提交
          Logger.log('照片上傳失敗: ' + photoErr.message);
        }
      }

      expRows.push([
        tripCode,
        exp.employeeName || data.submittedBy || '',
        exp.date || '',
        exp.category || '',
        exp.description || '',
        exp.currency || 'TWD',
        roundNum(exp.amount || 0),
        exp.exchangeRate || 1,
        roundNum(exp.amountNTD || exp.amount || 0),
        photoFileId,
        photoUrl
      ]);
    }

    expensesSheet.getRange(
      expensesSheet.getLastRow() + 1, 1,
      expRows.length, 11
    ).setValues(expRows);
  }

  return { success: true, tripCode: tripCode };
}

/**
 * 查詢審核狀態
 */
function handleGetTripStatus(data) {
  const tripCode = data.tripCode;
  if (!tripCode) {
    return { success: false, error: '請提供 Trip Code' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();
  const headers = tripsData[0];

  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      const row = tripsData[i];
      return {
        success: true,
        trip: {
          tripCode: row[0],
          location: row[1],
          startDate: formatDate(row[2]),
          endDate: formatDate(row[3]),
          submittedBy: row[7],
          submittedDate: formatDate(row[8]),
          status: row[9],
          reviewNote: row[10],
          reviewDate: formatDate(row[11])
        }
      };
    }
  }

  return { success: false, error: '找不到此 Trip Code: ' + tripCode };
}

/**
 * 管理員登入
 */
function handleAdminLogin(data) {
  const password = data.password;
  const adminPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');

  if (!adminPassword) {
    return { success: false, error: '管理員密碼尚未設定' };
  }

  if (password !== adminPassword) {
    return { success: false, error: '密碼錯誤' };
  }

  // 產生 session token
  const token = generateToken();
  const cache = CacheService.getScriptCache();
  // Token 有效期 6 小時 (21600 秒)
  cache.put('admin_token_' + token, 'valid', 21600);

  return { success: true, token: token };
}

/**
 * 取得所有旅遊申請列表
 */
function handleAdminGetTrips(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();

  if (tripsData.length <= 1) {
    return { success: true, trips: [] };
  }

  const trips = [];
  for (let i = 1; i < tripsData.length; i++) {
    const row = tripsData[i];
    trips.push({
      tripCode: row[0],
      location: row[1],
      startDate: formatDate(row[2]),
      endDate: formatDate(row[3]),
      subsidyAmount: roundNum(row[4]),
      paymentMethod: row[5],
      subsidyMethod: row[6],
      submittedBy: row[7],
      submittedDate: formatDate(row[8]),
      status: row[9],
      reviewNote: row[10],
      reviewDate: formatDate(row[11])
    });
  }

  // 最新的排在前面
  trips.reverse();

  return { success: true, trips: trips };
}

/**
 * 取得單一申請詳情
 */
function handleAdminGetTripDetail(data) {
  const tripCode = data.tripCode;
  if (!tripCode) {
    return { success: false, error: '請提供 Trip Code' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 取得 Trip 資訊
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();
  let tripInfo = null;

  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      const row = tripsData[i];
      tripInfo = {
        tripCode: row[0],
        location: row[1],
        startDate: formatDate(row[2]),
        endDate: formatDate(row[3]),
        subsidyAmount: roundNum(row[4]),
        paymentMethod: row[5],
        subsidyMethod: row[6],
        submittedBy: row[7],
        submittedDate: formatDate(row[8]),
        status: row[9],
        reviewNote: row[10],
        reviewDate: formatDate(row[11])
      };
      break;
    }
  }

  if (!tripInfo) {
    return { success: false, error: '找不到此 Trip Code' };
  }

  // 取得費用明細
  const expensesSheet = ss.getSheetByName('Expenses');
  const expensesData = expensesSheet.getDataRange().getValues();
  const expenses = [];

  for (let i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      expenses.push({
        employeeName: expensesData[i][1],
        date: formatDate(expensesData[i][2]),
        category: expensesData[i][3],
        description: expensesData[i][4],
        currency: expensesData[i][5],
        amount: roundNum(expensesData[i][6]),
        exchangeRate: expensesData[i][7],
        amountNTD: roundNum(expensesData[i][8]),
        photoFileId: expensesData[i][9],
        photoUrl: expensesData[i][10]
      });
    }
  }

  // 取得員工
  const employeesSheet = ss.getSheetByName('Employees');
  const employeesData = employeesSheet.getDataRange().getValues();
  const employees = [];

  for (let i = 1; i < employeesData.length; i++) {
    if (employeesData[i][0] === tripCode) {
      employees.push({
        name: employeesData[i][1],
        department: employeesData[i][2]
      });
    }
  }

  return {
    success: true,
    trip: tripInfo,
    expenses: expenses,
    employees: employees
  };
}

/**
 * 審核操作
 */
function handleAdminReview(data) {
  const tripCode = data.tripCode;
  const reviewAction = data.reviewAction; // approve, reject, needs_revision
  const note = data.note || '';

  if (!tripCode || !reviewAction) {
    return { success: false, error: '請提供 Trip Code 和審核動作' };
  }

  const validActions = ['approved', 'rejected', 'needs_revision'];
  if (!validActions.includes(reviewAction)) {
    return { success: false, error: '無效的審核動作' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();

  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      // 更新 status (col 10), reviewNote (col 11), reviewDate (col 12)
      tripsSheet.getRange(i + 1, 10).setValue(reviewAction);
      tripsSheet.getRange(i + 1, 11).setValue(note);
      tripsSheet.getRange(i + 1, 12).setValue(new Date().toISOString().split('T')[0]);
      return { success: true, message: '審核完成' };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * 取得照片（base64）
 */
function handleAdminGetPhoto(data) {
  const fileId = data.fileId;
  if (!fileId) {
    return { success: false, error: '請提供檔案 ID' };
  }

  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();

    return {
      success: true,
      photo: 'data:' + mimeType + ';base64,' + base64
    };
  } catch (err) {
    return { success: false, error: '無法讀取照片: ' + err.message };
  }
}

// ============================================
// 工具函式
// ============================================

/**
 * 格式化日期值為 YYYY-MM-DD 字串
 * Google Sheets 的日期欄位讀出來是 Date 物件，需轉換
 */
function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  // 已是字串，檢查是否為 ISO 格式並截取
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

/**
 * 金額取整數
 */
function roundNum(val) {
  const n = Number(val);
  if (isNaN(n)) return 0;
  return Math.round(n);
}

/**
 * 產生唯一 Trip Code
 */
function generateTripCode(tripInfo) {
  const date = (tripInfo.startDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'TRP-' + date + '-' + suffix;
}

/**
 * 產生隨機 session token
 */
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * 認證中介層
 */
function withAuth(data, handler) {
  const token = data.token;
  if (!token) {
    return { success: false, error: '未提供認證 Token', authError: true };
  }

  const cache = CacheService.getScriptCache();
  const valid = cache.get('admin_token_' + token);

  if (!valid) {
    return { success: false, error: 'Token 已過期或無效，請重新登入', authError: true };
  }

  return handler(data);
}

/**
 * 上傳照片到 Google Drive
 */
function uploadPhotoToDrive(folder, tripCode, employeeName, base64Data) {
  // 移除 data URL 前綴
  let mimeType = 'image/jpeg';
  let rawBase64 = base64Data;

  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      rawBase64 = matches[2];
    }
  }

  const decoded = Utilities.base64Decode(rawBase64);
  const blob = Utilities.newBlob(decoded, mimeType);

  const ext = mimeType.includes('png') ? '.png' : '.jpg';
  const fileName = tripCode + '_' + employeeName + '_' + Date.now() + ext;
  blob.setName(fileName);

  // 建立子資料夾（以 tripCode 命名）
  let tripFolder;
  const existingFolders = folder.getFoldersByName(tripCode);
  if (existingFolders.hasNext()) {
    tripFolder = existingFolders.next();
  } else {
    tripFolder = folder.createFolder(tripCode);
  }

  const file = tripFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    url: 'https://drive.google.com/uc?id=' + file.getId()
  };
}

/**
 * JSON 回應
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
