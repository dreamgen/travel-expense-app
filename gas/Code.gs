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
 *    - ADMIN_EMAIL: 管理員 Email（審核通知信收件人，選填）
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
        'reviewNote', 'reviewDate', 'isLocked', 'serverLastModified',
        'password', 'members', 'leaderName', 'tripStatus'
      ]
    },
    {
      name: 'Expenses',
      headers: [
        'tripCode', 'employeeName', 'date', 'category',
        'description', 'currency', 'amount', 'exchangeRate',
        'amountNTD', 'photoFileId', 'photoUrl',
        'expenseId', 'expenseStatus', 'expenseReviewNote', 'expenseReviewDate',
        'belongTo', 'lastModifiedBy'
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
      case 'adminReviewExpense':
        return jsonResponse(withAuth(data, handleAdminReviewExpense));
      case 'adminBatchReviewExpenses':
        return jsonResponse(withAuth(data, handleAdminBatchReviewExpenses));
      case 'adminGetPhoto':
        return jsonResponse(withAuth(data, handleAdminGetPhoto));
      case 'checkDuplicate':
        return jsonResponse(handleCheckDuplicate(data));
      case 'downloadTrip':
        return jsonResponse(handleDownloadTrip(data));
      case 'adminLockTrip':
        return jsonResponse(withAuth(data, handleAdminLockTrip));
      case 'adminUnlockTrip':
        return jsonResponse(withAuth(data, handleAdminUnlockTrip));
      case 'loginLeader':
        return jsonResponse(handleLeaderLogin(data));
      case 'getMembers':
        return jsonResponse(handleGetMembers(data));
      case 'getExpenses':
        return jsonResponse(handleGetExpensesMember(data));
      case 'leaderGetExpenses':
        return jsonResponse(withLeaderAuth(data, handleGetExpensesLeader));
      case 'adminGetExpenses':
        return jsonResponse(withAuth(data, handleGetExpensesAdmin));
      case 'submitTripStatus':
        return jsonResponse(handleSubmitTripStatus(data));
      case 'checkServerVersion':
        return jsonResponse(handleCheckServerVersion(data));
      case 'adminEditExpense':
        return jsonResponse(withAuth(data, handleAdminEditExpense));
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
 * 員工上傳旅遊申請（支援新增 & 更新模式）
 * 若 data.tripCode 存在且 Trips 表有該筆 → 更新模式：刪除舊費用，重新寫入，reset status
 * 否則 → 新增模式：建立新 trip
 * 
 * 新增檢核：
 * 1. 鎖定檢查：若 isLocked 為 true，拒絕上傳
 * 2. 版本衝突檢查：比對 client lastModified vs server serverLastModified
 */
function handleSubmitTrip(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const expensesSheet = ss.getSheetByName('Expenses');
  const employeesSheet = ss.getSheetByName('Employees');
  const now = new Date().toISOString();

  let tripCode = null;
  let isUpdate = false;
  let tripRowIndex = -1;

  // 判斷新增或更新模式
  if (data.tripCode) {
    const tripsData = tripsSheet.getDataRange().getValues();
    for (let i = 1; i < tripsData.length; i++) {
      if (tripsData[i][0] === data.tripCode) {
        tripCode = data.tripCode;
        isUpdate = true;
        tripRowIndex = i;
        
        // === 鎖定檢查 ===
        const isLocked = tripsData[i][12]; // isLocked 欄位 (第13欄, 0-indexed: 12)
        if (isLocked === true || isLocked === 'TRUE' || isLocked === 'true') {
          return { 
            success: false, 
            error: '案件已鎖定，無法上傳。請聯絡團長解鎖後再試。',
            errorCode: 'TRIP_LOCKED'
          };
        }
        
        // === 版本衝突檢查 ===
        const serverLastModified = tripsData[i][13]; // serverLastModified 欄位 (第14欄)
        const clientLastModified = data.lastModified;
        
        if (serverLastModified && clientLastModified) {
          const serverTime = new Date(serverLastModified).getTime();
          const clientTime = new Date(clientLastModified).getTime();
          
          if (serverTime > clientTime) {
            return {
              success: false,
              error: '雲端已有較新版本，請先執行「下載同步」以免資料遺失。',
              errorCode: 'VERSION_CONFLICT',
              serverLastModified: serverLastModified
            };
          }
        }
        
        // Reset trip status to pending
        tripsSheet.getRange(i + 1, 10).setValue('pending');
        tripsSheet.getRange(i + 1, 11).setValue('');
        tripsSheet.getRange(i + 1, 12).setValue('');
        // 更新 serverLastModified
        tripsSheet.getRange(i + 1, 14).setValue(now);

        // 更新 trip info
        const tripInfo = data.tripInfo;
        if (tripInfo) {
          tripsSheet.getRange(i + 1, 2).setValue(tripInfo.location || '');
          tripsSheet.getRange(i + 1, 3).setValue(tripInfo.startDate || '');
          tripsSheet.getRange(i + 1, 4).setValue(tripInfo.endDate || '');
          tripsSheet.getRange(i + 1, 5).setValue(tripInfo.subsidyAmount || 0);
          tripsSheet.getRange(i + 1, 6).setValue(tripInfo.paymentMethod || '');
          tripsSheet.getRange(i + 1, 7).setValue(tripInfo.subsidyMethod || '');
        }
        tripsSheet.getRange(i + 1, 9).setValue(now.split('T')[0]);

        // V2: 更新 password / members / leaderName（若提供）
        if (data.password !== undefined) {
          tripsSheet.getRange(i + 1, 15).setValue(data.password);
        }
        if (data.members) {
          tripsSheet.getRange(i + 1, 16).setValue(data.members);
        }
        if (data.leaderName) {
          tripsSheet.getRange(i + 1, 17).setValue(data.leaderName);
        }

        // V2: 新成員自動加入 members 名單
        if (data.submittedBy) {
          var existingMembers = (tripsData[i][15] || '').toString();
          var memberList = existingMembers ? existingMembers.split(',').map(function(m) { return m.trim(); }) : [];
          if (memberList.indexOf(data.submittedBy) === -1) {
            memberList.push(data.submittedBy);
            tripsSheet.getRange(i + 1, 16).setValue(memberList.join(','));
          }
        }

        break;
      }
    }
  }

  if (!isUpdate) {
    // 新增模式：產生唯一 Trip Code
    tripCode = generateTripCode(data.tripInfo);

    // 寫入 Trips (18 欄: 含 V2 新增 password, members, leaderName, tripStatus)
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
      now.split('T')[0],
      'pending',
      '',      // reviewNote
      '',      // reviewDate
      false,   // isLocked
      now,     // serverLastModified
      data.password || '',       // password (col 15, idx 14)
      data.members || '',        // members CSV (col 16, idx 15)
      data.leaderName || data.submittedBy || '',  // leaderName (col 17, idx 16)
      'Open'                     // tripStatus (col 18, idx 17)
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
  } else {
    // 更新模式：刪除該 trip 的舊費用
    deleteRowsForTrip(expensesSheet, tripCode);
    // 也更新 Employees
    deleteRowsForTrip(employeesSheet, tripCode);
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
  }

  // 寫入 Expenses（含照片上傳）— 17 欄 (V2: +belongTo, +lastModifiedBy)
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
        photoUrl,
        generateExpenseId(),
        'pending',
        '',
        '',
        exp.belongTo || exp.employeeName || data.submittedBy || '',  // belongTo (col 16, idx 15)
        exp.lastModifiedBy || ''                                      // lastModifiedBy (col 17, idx 16)
      ]);
    }

    expensesSheet.getRange(
      expensesSheet.getLastRow() + 1, 1,
      expRows.length, 17
    ).setValues(expRows);
  }

  return { success: true, tripCode: tripCode };
}

/**
 * 查詢審核狀態（含逐筆費用狀態）
 */
function handleGetTripStatus(data) {
  const tripCode = data.tripCode;
  if (!tripCode) {
    return { success: false, error: '請提供 Trip Code' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    return { success: false, error: '找不到此 Trip Code: ' + tripCode };
  }

  // 取得逐筆費用狀態
  const expensesSheet = ss.getSheetByName('Expenses');
  const expensesData = expensesSheet.getDataRange().getValues();
  const expenses = [];

  for (let i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      // 自動遷移：舊資料沒有 expenseId 時補上
      let eid = expensesData[i][11];
      if (!eid) {
        eid = generateExpenseId();
        expensesSheet.getRange(i + 1, 12).setValue(eid);
        expensesSheet.getRange(i + 1, 13).setValue('pending');
      }
      expenses.push({
        expenseId: eid,
        employeeName: expensesData[i][1],
        date: formatDate(expensesData[i][2]),
        category: expensesData[i][3],
        description: expensesData[i][4],
        currency: expensesData[i][5],
        amount: roundNum(expensesData[i][6]),
        exchangeRate: expensesData[i][7],
        amountNTD: roundNum(expensesData[i][8]),
        expenseStatus: expensesData[i][12] || 'pending',
        expenseReviewNote: expensesData[i][13] || '',
        expenseReviewDate: formatDate(expensesData[i][14])
      });
    }
  }

  return { success: true, trip: tripInfo, expenses: expenses };
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
      reviewDate: formatDate(row[11]),
      isLocked: row[12] === true || row[12] === 'TRUE' || row[12] === 'true',
      serverLastModified: row[13] || '',
      leaderName: row[16] || row[7] || '',     // V2
      tripStatus: row[17] || 'Open'             // V2
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
        reviewDate: formatDate(row[11]),
        isLocked: row[12] === true || row[12] === 'TRUE' || row[12] === 'true',
        serverLastModified: row[13] || '',
        leaderName: row[16] || row[7] || '',     // V2
        tripStatus: row[17] || 'Open'             // V2
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
      // 自動遷移：舊資料沒有 expenseId 時補上
      let eid = expensesData[i][11];
      if (!eid) {
        eid = generateExpenseId();
        expensesSheet.getRange(i + 1, 12).setValue(eid);
        expensesSheet.getRange(i + 1, 13).setValue('pending');
      }
      expenses.push({
        expenseId: eid,
        employeeName: expensesData[i][1],
        date: formatDate(expensesData[i][2]),
        category: expensesData[i][3],
        description: expensesData[i][4],
        currency: expensesData[i][5],
        amount: roundNum(expensesData[i][6]),
        exchangeRate: expensesData[i][7],
        amountNTD: roundNum(expensesData[i][8]),
        photoFileId: expensesData[i][9],
        photoUrl: expensesData[i][10],
        expenseStatus: expensesData[i][12] || 'pending',
        expenseReviewNote: expensesData[i][13] || '',
        expenseReviewDate: formatDate(expensesData[i][14]),
        belongTo: expensesData[i][15] || expensesData[i][1] || '',     // V2
        lastModifiedBy: expensesData[i][16] || ''                       // V2
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

      // 發送審核通知（退回或補件時）
      if (reviewAction === 'rejected' || reviewAction === 'needs_revision') {
        try {
          var submittedBy = tripsData[i][7] || '未知';
          sendReviewNotification(tripCode, submittedBy, [
            { category: '（整體審核）', description: note || '無備註', expenseStatus: reviewAction, note: note }
          ]);
        } catch (notifyErr) {
          Logger.log('通知發送失敗（非致命）: ' + notifyErr.message);
        }
      }

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
// 同步與鎖定 API
// ============================================

/**
 * 檢查同名資料（同名檢核）
 * 用於上傳前檢查該 TripCode 下是否已有相同提交人姓名的資料
 */
function handleCheckDuplicate(data) {
  const tripCode = data.tripCode;
  const submittedBy = data.submittedBy;

  if (!tripCode || !submittedBy) {
    return { success: false, error: '請提供 tripCode 和 submittedBy' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();

  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      const existingSubmitter = tripsData[i][7]; // submittedBy 欄位
      
      if (existingSubmitter && existingSubmitter === submittedBy) {
        // 發現同名資料
        const serverLastModified = tripsData[i][13] || tripsData[i][8]; // 優先用 serverLastModified，否則用 submittedDate
        return {
          success: true,
          hasDuplicate: true,
          lastUpdated: serverLastModified,
          message: '偵測到同名資料'
        };
      } else if (existingSubmitter && existingSubmitter !== submittedBy) {
        // TripCode 存在但提交人不同
        return {
          success: true,
          hasDuplicate: false,
          existingSubmitter: existingSubmitter,
          message: '此 TripCode 已由其他人建立'
        };
      }
    }
  }

  // 找不到該 TripCode，無同名問題
  return { success: true, hasDuplicate: false };
}

/**
 * 下載/同步資料（跨裝置）
 * 回傳完整的費用與照片資料供前端同步
 */
function handleDownloadTrip(data) {
  const tripCode = data.tripCode;
  const submittedBy = data.submittedBy;

  if (!tripCode) {
    return { success: false, error: '請提供 tripCode' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const expensesSheet = ss.getSheetByName('Expenses');
  const employeesSheet = ss.getSheetByName('Employees');
  const tripsData = tripsSheet.getDataRange().getValues();

  // 查找 Trip
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
        reviewDate: formatDate(row[11]),
        isLocked: row[12] === true || row[12] === 'TRUE' || row[12] === 'true',
        serverLastModified: row[13] || '',
        leaderName: row[16] || row[7] || '',    // V2: leaderName, fallback to submittedBy
        tripStatus: row[17] || 'Open'            // V2: tripStatus
      };
      break;
    }
  }

  if (!tripInfo) {
    return { success: false, error: '找不到此 Trip Code: ' + tripCode };
  }

  // 取得費用明細（含照片 base64）
  const expensesData = expensesSheet.getDataRange().getValues();
  const expenses = [];
  const photos = {};

  const photoFolderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');

  for (let i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      const photoFileId = expensesData[i][9];
      let expenseId = expensesData[i][11];

      // 補上 expenseId
      if (!expenseId) {
        expenseId = generateExpenseId();
        expensesSheet.getRange(i + 1, 12).setValue(expenseId);
      }

      const expense = {
        expenseId: expenseId,
        employeeName: expensesData[i][1],
        date: formatDate(expensesData[i][2]),
        category: expensesData[i][3],
        description: expensesData[i][4],
        currency: expensesData[i][5],
        amount: roundNum(expensesData[i][6]),
        exchangeRate: expensesData[i][7],
        amountNTD: roundNum(expensesData[i][8]),
        photoFileId: photoFileId,
        photoUrl: expensesData[i][10],
        expenseStatus: expensesData[i][12] || 'pending',
        expenseReviewNote: expensesData[i][13] || '',
        expenseReviewDate: formatDate(expensesData[i][14]),
        belongTo: expensesData[i][15] || expensesData[i][1] || '',       // V2: belongTo, fallback employeeName
        lastModifiedBy: expensesData[i][16] || ''                         // V2: lastModifiedBy
      };
      expenses.push(expense);

      // 取得照片 base64（如果有）
      if (photoFileId) {
        try {
          const file = DriveApp.getFileById(photoFileId);
          const blob = file.getBlob();
          const base64 = Utilities.base64Encode(blob.getBytes());
          const mimeType = blob.getContentType();
          photos[expenseId] = 'data:' + mimeType + ';base64,' + base64;
        } catch (e) {
          Logger.log('無法讀取照片 ' + photoFileId + ': ' + e.message);
        }
      }
    }
  }

  // 取得員工
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
    tripInfo: tripInfo,
    expenses: expenses,
    employees: employees,
    photos: photos,
    serverLastModified: tripInfo.serverLastModified
  };
}

/**
 * 管理員鎖定 Trip
 */
function handleAdminLockTrip(data) {
  const tripCode = data.tripCode;

  if (!tripCode) {
    return { success: false, error: '請提供 tripCode' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();

  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      // 設定 isLocked = true (第13欄)
      tripsSheet.getRange(i + 1, 13).setValue(true);
      return { success: true, isLocked: true, message: '已鎖定 ' + tripCode };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * 管理員解鎖 Trip
 */
function handleAdminUnlockTrip(data) {
  const tripCode = data.tripCode;

  if (!tripCode) {
    return { success: false, error: '請提供 tripCode' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();

  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      // 設定 isLocked = false (第13欄)
      tripsSheet.getRange(i + 1, 13).setValue(false);
      return { success: true, isLocked: false, message: '已解鎖 ' + tripCode };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * 逐筆審核單一費用
 */
function handleAdminReviewExpense(data) {
  const tripCode = data.tripCode;
  const expenseId = data.expenseId;
  const reviewAction = data.reviewAction; // approved, rejected, needs_revision
  const note = data.note || '';

  if (!tripCode || !expenseId || !reviewAction) {
    return { success: false, error: '請提供 tripCode、expenseId 和 reviewAction' };
  }

  const validActions = ['approved', 'rejected', 'needs_revision'];
  if (!validActions.includes(reviewAction)) {
    return { success: false, error: '無效的審核動作' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const expensesSheet = ss.getSheetByName('Expenses');
  const expensesData = expensesSheet.getDataRange().getValues();

  let found = false;
  let foundExpense = null;
  for (let i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      let eid = expensesData[i][11];
      // 舊資料沒有 expenseId，自動補上
      if (!eid) {
        eid = generateExpenseId();
        expensesSheet.getRange(i + 1, 12).setValue(eid);
        if (!expensesData[i][12]) {
          expensesSheet.getRange(i + 1, 13).setValue('pending');
        }
      }
      if (eid === expenseId) {
        // 更新 expenseStatus(col 13), expenseReviewNote(col 14), expenseReviewDate(col 15)
        expensesSheet.getRange(i + 1, 13).setValue(reviewAction);
        expensesSheet.getRange(i + 1, 14).setValue(note);
        expensesSheet.getRange(i + 1, 15).setValue(new Date().toISOString().split('T')[0]);
        found = true;
        foundExpense = {
          category: expensesData[i][3],
          description: expensesData[i][4]
        };
        break;
      }
    }
  }

  if (!found) {
    return { success: false, error: '找不到此費用: ' + expenseId };
  }

  // 更新推導的 Trip 狀態
  updateDerivedTripStatus(ss, tripCode);

  // 發送審核通知（退回或補件時）
  if (reviewAction === 'rejected' || reviewAction === 'needs_revision') {
    try {
      var submittedBy = getSubmittedByForTrip(ss, tripCode);
      sendReviewNotification(tripCode, submittedBy, [
        { category: foundExpense.category, description: foundExpense.description, expenseStatus: reviewAction, note: note }
      ]);
    } catch (notifyErr) {
      Logger.log('通知發送失敗（非致命）: ' + notifyErr.message);
    }
  }

  return { success: true, message: '費用審核完成' };
}

/**
 * 批次審核多筆費用
 */
function handleAdminBatchReviewExpenses(data) {
  const tripCode = data.tripCode;
  const reviews = data.reviews; // [{expenseId, reviewAction, note}]

  if (!tripCode || !reviews || !reviews.length) {
    return { success: false, error: '請提供 tripCode 和 reviews 陣列' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const expensesSheet = ss.getSheetByName('Expenses');
  const expensesData = expensesSheet.getDataRange().getValues();
  const today = new Date().toISOString().split('T')[0];

  // 建立 expenseId → review 映射
  const reviewMap = {};
  for (const r of reviews) {
    reviewMap[r.expenseId] = r;
  }

  let updated = 0;
  const notifyExpenses = [];
  for (let i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      const eid = expensesData[i][11];
      if (eid && reviewMap[eid]) {
        const r = reviewMap[eid];
        const action = r.reviewAction || 'approved';
        expensesSheet.getRange(i + 1, 13).setValue(action);
        expensesSheet.getRange(i + 1, 14).setValue(r.note || '');
        expensesSheet.getRange(i + 1, 15).setValue(today);
        updated++;

        // 收集需通知的費用
        if (action === 'rejected' || action === 'needs_revision') {
          notifyExpenses.push({
            category: expensesData[i][3],
            description: expensesData[i][4],
            expenseStatus: action,
            note: r.note || ''
          });
        }
      }
    }
  }

  // 更新推導的 Trip 狀態
  updateDerivedTripStatus(ss, tripCode);

  // 發送審核通知
  if (notifyExpenses.length > 0) {
    try {
      var submittedBy = getSubmittedByForTrip(ss, tripCode);
      sendReviewNotification(tripCode, submittedBy, notifyExpenses);
    } catch (notifyErr) {
      Logger.log('通知發送失敗（非致命）: ' + notifyErr.message);
    }
  }

  return { success: true, message: '已審核 ' + updated + ' 筆費用' };
}

/**
 * 從費用狀態推導 Trip 狀態
 * - 全部 approved → trip approved
 * - 任一 rejected 或 needs_revision → trip needs_revision
 * - 其餘 → pending
 */
function updateDerivedTripStatus(ss, tripCode) {
  const expensesSheet = ss.getSheetByName('Expenses');
  const expensesData = expensesSheet.getDataRange().getValues();

  const statuses = [];
  for (let i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      statuses.push(expensesData[i][12] || 'pending');
    }
  }

  if (statuses.length === 0) return;

  let derivedStatus = 'pending';
  if (statuses.every(s => s === 'approved')) {
    derivedStatus = 'approved';
  } else if (statuses.some(s => s === 'rejected' || s === 'needs_revision')) {
    derivedStatus = 'needs_revision';
  }

  // 更新 Trips 表
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();
  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      tripsSheet.getRange(i + 1, 10).setValue(derivedStatus);
      tripsSheet.getRange(i + 1, 12).setValue(new Date().toISOString().split('T')[0]);
      break;
    }
  }
}

/**
 * 取得 Trip 的提交人
 */
function getSubmittedByForTrip(ss, tripCode) {
  const tripsSheet = ss.getSheetByName('Trips');
  const tripsData = tripsSheet.getDataRange().getValues();
  for (let i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      return tripsData[i][7] || '未知';
    }
  }
  return '未知';
}

/**
 * 刪除某 tripCode 的所有資料列（用於更新模式）
 */
function deleteRowsForTrip(sheet, tripCode) {
  const data = sheet.getDataRange().getValues();
  // 從最後一列往前刪，避免索引偏移
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === tripCode) {
      sheet.deleteRow(i + 1);
    }
  }
}

/**
 * 產生唯一 Expense ID
 */
function generateExpenseId() {
  const ts = Date.now();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'EXP-' + ts + '-' + suffix;
}

/**
 * 為已有資料補上新欄位（遷移用）
 * 在 Apps Script 編輯器中手動執行
 */
function migrateExpenseColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Expenses');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('找不到 Expenses 工作表');
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    SpreadsheetApp.getUi().alert('Expenses 表沒有資料，無需遷移');
    return;
  }

  const headers = data[0];
  // 檢查是否已有新欄位
  if (headers.length >= 15 && headers[11] === 'expenseId') {
    SpreadsheetApp.getUi().alert('欄位已是最新，無需遷移');
    return;
  }

  // 補上表頭
  const newHeaders = ['expenseId', 'expenseStatus', 'expenseReviewNote', 'expenseReviewDate'];
  for (let h = 0; h < newHeaders.length; h++) {
    sheet.getRange(1, 12 + h).setValue(newHeaders[h]);
  }
  // 表頭樣式
  sheet.getRange(1, 12, 1, 4)
    .setFontWeight('bold')
    .setBackground('#4a5568')
    .setFontColor('#ffffff');

  // 為已有資料填入預設值
  let migrated = 0;
  for (let i = 1; i < data.length; i++) {
    if (!data[i][11]) { // expenseId 欄為空
      sheet.getRange(i + 1, 12).setValue(generateExpenseId());
      sheet.getRange(i + 1, 13).setValue('pending');
      sheet.getRange(i + 1, 14).setValue('');
      sheet.getRange(i + 1, 15).setValue('');
      migrated++;
    }
  }

  SpreadsheetApp.getUi().alert('遷移完成，已更新 ' + migrated + ' 筆費用記錄');
}

/**
 * 為已有 Trips 資料補上新欄位（isLocked, serverLastModified）
 * 在 Apps Script 編輯器中手動執行
 */
function migrateTripsColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Trips');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('找不到 Trips 工作表');
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    SpreadsheetApp.getUi().alert('Trips 表沒有資料，無需遷移');
    return;
  }

  const headers = data[0];
  // 檢查是否已有新欄位
  if (headers.length >= 14 && headers[12] === 'isLocked') {
    SpreadsheetApp.getUi().alert('Trips 欄位已是最新，無需遷移');
    return;
  }

  // 補上表頭
  const newHeaders = ['isLocked', 'serverLastModified'];
  for (let h = 0; h < newHeaders.length; h++) {
    sheet.getRange(1, 13 + h).setValue(newHeaders[h]);
  }
  // 表頭樣式
  sheet.getRange(1, 13, 1, 2)
    .setFontWeight('bold')
    .setBackground('#4a5568')
    .setFontColor('#ffffff');

  // 為已有資料填入預設值
  let migrated = 0;
  for (let i = 1; i < data.length; i++) {
    // isLocked 預設為 false，serverLastModified 預設為 submittedDate
    const submittedDate = data[i][8];
    const serverLastModified = submittedDate instanceof Date 
      ? submittedDate.toISOString() 
      : (submittedDate || new Date().toISOString());
    
    sheet.getRange(i + 1, 13).setValue(false);
    sheet.getRange(i + 1, 14).setValue(serverLastModified);
    migrated++;
  }

  SpreadsheetApp.getUi().alert('Trips 遷移完成，已更新 ' + migrated + ' 筆旅遊記錄');
}

// ============================================
// V2: 新增 API 處理函式
// ============================================

/**
 * 團長登入（V2）
 * 驗證 TripCode + password → 發放 leader token
 */
function handleLeaderLogin(data) {
  var tripCode = data.tripCode;
  var password = data.password;

  if (!tripCode || !password) {
    return { success: false, error: '請提供 Trip Code 和密碼' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();

  for (var i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      var storedPassword = (tripsData[i][14] || '').toString();
      if (!storedPassword) {
        return { success: false, error: '此旅遊尚未設定團長密碼' };
      }
      if (password !== storedPassword) {
        return { success: false, error: '密碼錯誤' };
      }

      // 產生 leader token
      var token = generateToken();
      var cache = CacheService.getScriptCache();
      var tokenData = JSON.stringify({
        tripCode: tripCode,
        leaderName: tripsData[i][16] || tripsData[i][7] || ''
      });
      cache.put('leader_' + token, tokenData, 21600); // 6 小時

      return {
        success: true,
        token: token,
        tripCode: tripCode,
        leaderName: tripsData[i][16] || tripsData[i][7] || '',
        members: (tripsData[i][15] || '').toString()
      };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * Leader 認證中介層（V2）
 */
function withLeaderAuth(data, handler) {
  var token = data.token;
  if (!token) {
    return { success: false, error: '未提供認證 Token', authError: true };
  }

  var cache = CacheService.getScriptCache();
  var tokenData = cache.get('leader_' + token);

  if (!tokenData) {
    return { success: false, error: 'Token 已過期或無效，請重新登入', authError: true };
  }

  try {
    var parsed = JSON.parse(tokenData);
    data._leaderTripCode = parsed.tripCode;
    data._leaderName = parsed.leaderName;
  } catch (e) {
    return { success: false, error: 'Token 資料異常', authError: true };
  }

  return handler(data);
}

/**
 * 取得成員名單（V2）
 * 合併 Employees 表 + Trips.members 欄位
 */
function handleGetMembers(data) {
  var tripCode = data.tripCode;
  if (!tripCode) {
    return { success: false, error: '請提供 Trip Code' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 從 Employees 表取
  var employeesSheet = ss.getSheetByName('Employees');
  var employeesData = employeesSheet.getDataRange().getValues();
  var nameSet = {};
  var members = [];

  for (var i = 1; i < employeesData.length; i++) {
    if (employeesData[i][0] === tripCode) {
      var name = (employeesData[i][1] || '').toString().trim();
      if (name && !nameSet[name]) {
        nameSet[name] = true;
        members.push({ name: name, department: employeesData[i][2] || '' });
      }
    }
  }

  // 從 Trips.members 欄位合併
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();
  for (var j = 1; j < tripsData.length; j++) {
    if (tripsData[j][0] === tripCode) {
      var membersCSV = (tripsData[j][15] || '').toString();
      if (membersCSV) {
        var names = membersCSV.split(',');
        for (var k = 0; k < names.length; k++) {
          var n = names[k].trim();
          if (n && !nameSet[n]) {
            nameSet[n] = true;
            members.push({ name: n, department: '' });
          }
        }
      }
      break;
    }
  }

  return { success: true, members: members };
}

/**
 * Member 級費用查詢（V2）
 * 過濾 belongTo == memberName OR employeeName == memberName
 */
function handleGetExpensesMember(data) {
  var tripCode = data.tripCode;
  var memberName = data.memberName;

  if (!tripCode || !memberName) {
    return { success: false, error: '請提供 tripCode 和 memberName' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expensesSheet = ss.getSheetByName('Expenses');
  var expensesData = expensesSheet.getDataRange().getValues();
  var expenses = [];

  for (var i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      var empName = (expensesData[i][1] || '').toString();
      var belongTo = (expensesData[i][15] || empName).toString();
      if (empName === memberName || belongTo === memberName) {
        expenses.push({
          expenseId: expensesData[i][11] || '',
          employeeName: empName,
          date: formatDate(expensesData[i][2]),
          category: expensesData[i][3],
          description: expensesData[i][4],
          currency: expensesData[i][5],
          amount: roundNum(expensesData[i][6]),
          exchangeRate: expensesData[i][7],
          amountNTD: roundNum(expensesData[i][8]),
          expenseStatus: expensesData[i][12] || 'pending',
          expenseReviewNote: expensesData[i][13] || '',
          expenseReviewDate: formatDate(expensesData[i][14]),
          belongTo: belongTo,
          lastModifiedBy: expensesData[i][16] || ''
        });
      }
    }
  }

  return { success: true, expenses: expenses };
}

/**
 * Leader 級費用查詢（V2）
 * 回傳該 tripCode 的所有費用
 */
function handleGetExpensesLeader(data) {
  var tripCode = data._leaderTripCode || data.tripCode;
  if (!tripCode) {
    return { success: false, error: '請提供 tripCode' };
  }

  return getExpensesForTrip(tripCode);
}

/**
 * Auditor 級費用查詢（V2）
 * 回傳指定 tripCode 的所有費用（需 admin token）
 */
function handleGetExpensesAdmin(data) {
  var tripCode = data.tripCode;
  if (!tripCode) {
    return { success: false, error: '請提供 tripCode' };
  }

  return getExpensesForTrip(tripCode);
}

/**
 * 共用：取得某 tripCode 的全部費用
 */
function getExpensesForTrip(tripCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expensesSheet = ss.getSheetByName('Expenses');
  var expensesData = expensesSheet.getDataRange().getValues();
  var expenses = [];

  for (var i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode) {
      expenses.push({
        expenseId: expensesData[i][11] || '',
        employeeName: expensesData[i][1],
        date: formatDate(expensesData[i][2]),
        category: expensesData[i][3],
        description: expensesData[i][4],
        currency: expensesData[i][5],
        amount: roundNum(expensesData[i][6]),
        exchangeRate: expensesData[i][7],
        amountNTD: roundNum(expensesData[i][8]),
        photoFileId: expensesData[i][9],
        photoUrl: expensesData[i][10],
        expenseStatus: expensesData[i][12] || 'pending',
        expenseReviewNote: expensesData[i][13] || '',
        expenseReviewDate: formatDate(expensesData[i][14]),
        belongTo: expensesData[i][15] || expensesData[i][1] || '',
        lastModifiedBy: expensesData[i][16] || ''
      });
    }
  }

  return { success: true, expenses: expenses };
}

/**
 * 更新旅遊團務狀態（V2）
 * tripStatus: 'Open' | 'Submitted' | 'Closed'
 * 需 leader token 或 admin token
 */
function handleSubmitTripStatus(data) {
  var tripCode = data.tripCode;
  var tripStatus = data.tripStatus;
  var token = data.token;

  if (!tripCode || !tripStatus) {
    return { success: false, error: '請提供 tripCode 和 tripStatus' };
  }

  var validStatuses = ['Open', 'Submitted', 'Closed'];
  if (validStatuses.indexOf(tripStatus) === -1) {
    return { success: false, error: '無效的 tripStatus，可用值: ' + validStatuses.join(', ') };
  }

  // 驗證 token（leader 或 admin）
  if (token) {
    var cache = CacheService.getScriptCache();
    var isAdmin = cache.get('admin_token_' + token);
    var isLeader = cache.get('leader_' + token);
    if (!isAdmin && !isLeader) {
      return { success: false, error: 'Token 無效或已過期', authError: true };
    }
  } else {
    return { success: false, error: '需要提供 Token', authError: true };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();

  for (var i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      // 更新 tripStatus (col 18, idx 17)
      tripsSheet.getRange(i + 1, 18).setValue(tripStatus);

      // Submitted 時自動鎖定
      if (tripStatus === 'Submitted') {
        tripsSheet.getRange(i + 1, 13).setValue(true);
      }
      // Open 時自動解鎖
      if (tripStatus === 'Open') {
        tripsSheet.getRange(i + 1, 13).setValue(false);
      }

      // 更新 serverLastModified
      tripsSheet.getRange(i + 1, 14).setValue(new Date().toISOString());

      return { success: true, tripStatus: tripStatus, message: '旅遊狀態已更新為 ' + tripStatus };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * 檢查 Server 版本（V2）
 * 輕量級 API，無需驗證
 */
function handleCheckServerVersion(data) {
  var tripCode = data.tripCode;
  var clientLastModified = data.clientLastModified;

  if (!tripCode) {
    return { success: false, error: '請提供 tripCode' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();

  for (var i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      var serverLastModified = tripsData[i][13] || '';
      var hasUpdate = false;

      if (serverLastModified && clientLastModified) {
        var serverTime = new Date(serverLastModified).getTime();
        var clientTime = new Date(clientLastModified).getTime();
        hasUpdate = serverTime > clientTime;
      } else if (serverLastModified && !clientLastModified) {
        hasUpdate = true;
      }

      return {
        success: true,
        hasUpdate: hasUpdate,
        serverLastModified: serverLastModified,
        tripStatus: tripsData[i][17] || 'Open',
        isLocked: tripsData[i][12] === true || tripsData[i][12] === 'TRUE' || tripsData[i][12] === 'true'
      };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * 管理員/團長編輯費用（V2）
 * 代客修正：可修改金額、類別、描述、BelongTo + 記錄 lastModifiedBy
 */
function handleAdminEditExpense(data) {
  var tripCode = data.tripCode;
  var expenseId = data.expenseId;
  var updates = data.updates; // { amount, category, description, belongTo, ... }
  var modifiedBy = data.modifiedBy || 'admin';

  if (!tripCode || !expenseId || !updates) {
    return { success: false, error: '請提供 tripCode、expenseId 和 updates' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expensesSheet = ss.getSheetByName('Expenses');
  var expensesData = expensesSheet.getDataRange().getValues();

  for (var i = 1; i < expensesData.length; i++) {
    if (expensesData[i][0] === tripCode && expensesData[i][11] === expenseId) {
      // 可修改的欄位
      if (updates.category !== undefined) expensesSheet.getRange(i + 1, 4).setValue(updates.category);
      if (updates.description !== undefined) expensesSheet.getRange(i + 1, 5).setValue(updates.description);
      if (updates.amount !== undefined) {
        expensesSheet.getRange(i + 1, 7).setValue(roundNum(updates.amount));
        // 同步更新 amountNTD（若有匯率）
        var rate = expensesData[i][7] || 1;
        expensesSheet.getRange(i + 1, 9).setValue(roundNum(updates.amount * rate));
      }
      if (updates.belongTo !== undefined) expensesSheet.getRange(i + 1, 16).setValue(updates.belongTo);

      // 記錄最後修改者
      expensesSheet.getRange(i + 1, 17).setValue(modifiedBy);

      // 更新 serverLastModified
      var tripsSheet = ss.getSheetByName('Trips');
      var tripsData = tripsSheet.getDataRange().getValues();
      for (var j = 1; j < tripsData.length; j++) {
        if (tripsData[j][0] === tripCode) {
          tripsSheet.getRange(j + 1, 14).setValue(new Date().toISOString());
          break;
        }
      }

      return { success: true, message: '費用已更新' };
    }
  }

  return { success: false, error: '找不到此費用: ' + expenseId };
}

// ============================================
// V2: Schema 遷移函式
// ============================================

/**
 * Trips 表 V2 遷移：新增 password, members, leaderName, tripStatus 欄位
 * 冪等設計，可安全重複執行
 */
function migrateTripsV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Trips');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('找不到 Trips 工作表');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // 檢查是否已遷移
  if (headers.length >= 18 && headers[14] === 'password') {
    SpreadsheetApp.getUi().alert('Trips V2 欄位已存在，無需遷移');
    return;
  }

  // 追加表頭
  var newHeaders = ['password', 'members', 'leaderName', 'tripStatus'];
  for (var h = 0; h < newHeaders.length; h++) {
    sheet.getRange(1, 15 + h).setValue(newHeaders[h]);
  }
  sheet.getRange(1, 15, 1, 4)
    .setFontWeight('bold')
    .setBackground('#4a5568')
    .setFontColor('#ffffff');

  // 填入預設值
  var migrated = 0;
  for (var i = 1; i < data.length; i++) {
    sheet.getRange(i + 1, 15).setValue('');                             // password
    sheet.getRange(i + 1, 16).setValue('');                             // members
    sheet.getRange(i + 1, 17).setValue(data[i][7] || '');               // leaderName = submittedBy
    sheet.getRange(i + 1, 18).setValue('Open');                         // tripStatus
    migrated++;
  }

  SpreadsheetApp.getUi().alert('Trips V2 遷移完成，已更新 ' + migrated + ' 筆旅遊記錄\n新增欄位: password, members, leaderName, tripStatus');
}

/**
 * Expenses 表 V2 遷移：新增 belongTo, lastModifiedBy 欄位
 * 冪等設計，可安全重複執行
 */
function migrateExpensesV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Expenses');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('找不到 Expenses 工作表');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // 檢查是否已遷移
  if (headers.length >= 17 && headers[15] === 'belongTo') {
    SpreadsheetApp.getUi().alert('Expenses V2 欄位已存在，無需遷移');
    return;
  }

  // 追加表頭
  var newHeaders = ['belongTo', 'lastModifiedBy'];
  for (var h = 0; h < newHeaders.length; h++) {
    sheet.getRange(1, 16 + h).setValue(newHeaders[h]);
  }
  sheet.getRange(1, 16, 1, 2)
    .setFontWeight('bold')
    .setBackground('#4a5568')
    .setFontColor('#ffffff');

  // 填入預設值：belongTo = employeeName (col 2)
  var migrated = 0;
  for (var i = 1; i < data.length; i++) {
    sheet.getRange(i + 1, 16).setValue(data[i][1] || '');    // belongTo = employeeName
    sheet.getRange(i + 1, 17).setValue('');                    // lastModifiedBy
    migrated++;
  }

  SpreadsheetApp.getUi().alert('Expenses V2 遷移完成，已更新 ' + migrated + ' 筆費用記錄\n新增欄位: belongTo, lastModifiedBy');
}

// ============================================
// V2: GAS Sidebar (Google Sheets 內嵌管理)
// ============================================

/**
 * Sheets 選單（V2）
 * 自動在 Google Sheets 開啟時建立自訂選單
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('旅遊記帳管理')
    .addItem('開啟審核 Sidebar', 'showAdminSidebar')
    .addSeparator()
    .addItem('初始化工作表', 'initializeSheets')
    .addItem('遷移 Trips V2 欄位', 'migrateTripsV2')
    .addItem('遷移 Expenses V2 欄位', 'migrateExpensesV2')
    .addItem('遷移 Trips 欄位 (V1)', 'migrateTripsColumns')
    .addItem('遷移 Expenses 欄位 (V1)', 'migrateExpenseColumns')
    .addToUi();
}

/**
 * 開啟審核 Sidebar（V2）
 * 免密碼：利用 Google 帳號權限，Sidebar 內直接操作
 */
function showAdminSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('單據審核系統')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Sidebar 用：取得所有 Trips（供 Sidebar 直接呼叫，免 token）
 */
function sidebarGetTrips() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();
  var trips = [];

  for (var i = 1; i < tripsData.length; i++) {
    var row = tripsData[i];
    trips.push({
      tripCode: row[0],
      location: row[1],
      startDate: formatDate(row[2]),
      endDate: formatDate(row[3]),
      submittedBy: row[7],
      status: row[9],
      isLocked: row[12] === true || row[12] === 'TRUE' || row[12] === 'true',
      tripStatus: row[17] || 'Open'
    });
  }

  trips.reverse();
  return trips;
}

/**
 * Sidebar 用：取得 Trip 費用明細（免 token）
 */
function sidebarGetTripExpenses(tripCode) {
  return getExpensesForTrip(tripCode);
}

/**
 * Sidebar 用：審核費用（免 token）
 */
function sidebarReviewExpense(tripCode, expenseId, reviewAction, note) {
  return handleAdminReviewExpense({
    tripCode: tripCode,
    expenseId: expenseId,
    reviewAction: reviewAction,
    note: note || ''
  });
}

/**
 * Sidebar 用：鎖定/解鎖（免 token）
 */
function sidebarToggleLock(tripCode, lock) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();

  for (var i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      tripsSheet.getRange(i + 1, 13).setValue(lock);
      return { success: true, isLocked: lock };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

/**
 * Sidebar 用：更新 tripStatus（免 token）
 */
function sidebarUpdateTripStatus(tripCode, tripStatus) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tripsSheet = ss.getSheetByName('Trips');
  var tripsData = tripsSheet.getDataRange().getValues();

  for (var i = 1; i < tripsData.length; i++) {
    if (tripsData[i][0] === tripCode) {
      tripsSheet.getRange(i + 1, 18).setValue(tripStatus);
      if (tripStatus === 'Submitted') tripsSheet.getRange(i + 1, 13).setValue(true);
      if (tripStatus === 'Open') tripsSheet.getRange(i + 1, 13).setValue(false);
      tripsSheet.getRange(i + 1, 14).setValue(new Date().toISOString());
      return { success: true, tripStatus: tripStatus };
    }
  }

  return { success: false, error: '找不到此 Trip Code' };
}

// ============================================
// 審核通知 Email
// ============================================

/**
 * 發送審核預通知信
 * 當費用被標記為「需補件」或「退回」時，寄送通知給管理員
 * 管理員收信後可自行轉寄或修改內容通知申請員工
 *
 * @param {string} tripCode - 旅遊代碼
 * @param {string} submittedBy - 申請人
 * @param {Array} reviewedExpenses - 被審核的費用 [{category, description, expenseStatus, note}]
 */
function sendReviewNotification(tripCode, submittedBy, reviewedExpenses) {
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  if (!adminEmail) {
    Logger.log('未設定 ADMIN_EMAIL，跳過通知');
    return;
  }

  // 篩選需要通知的費用（退回或補件）
  const notifyExpenses = reviewedExpenses.filter(
    e => e.expenseStatus === 'needs_revision' || e.expenseStatus === 'rejected'
  );

  if (notifyExpenses.length === 0) return;

  const statusLabels = {
    'needs_revision': '需補件',
    'rejected': '已退回'
  };

  // 組合 Email 內容
  const subject = '[旅遊費用審核] ' + tripCode + ' - ' + submittedBy + ' 有費用需處理';

  let body = '旅遊費用審核通知\n';
  body += '========================\n\n';
  body += 'Trip Code：' + tripCode + '\n';
  body += '申請人：' + submittedBy + '\n';
  body += '通知時間：' + new Date().toLocaleString('zh-TW') + '\n\n';
  body += '以下費用需要處理：\n';
  body += '------------------------\n';

  notifyExpenses.forEach(function(exp, idx) {
    body += '\n【第 ' + (idx + 1) + ' 筆】\n';
    body += '  類別：' + (exp.category || '-') + '\n';
    body += '  說明：' + (exp.description || '-') + '\n';
    body += '  狀態：' + (statusLabels[exp.expenseStatus] || exp.expenseStatus) + '\n';
    if (exp.note) {
      body += '  備註：' + exp.note + '\n';
    }
  });

  body += '\n------------------------\n';
  body += '\n請確認後通知申請人進行補件或修正。\n';
  body += '如需解鎖案件讓員工重新上傳，請至管理後台操作。\n';

  try {
    MailApp.sendEmail({
      to: adminEmail,
      subject: subject,
      body: body
    });
    Logger.log('已發送審核通知信至 ' + adminEmail);
  } catch (err) {
    Logger.log('發送通知信失敗: ' + err.message);
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
