// 旅遊費用申請 APP - JavaScript

// 全域資料
let appData = {
    tripCode: null,
    tripInfo: {
        location: '',
        startDate: '',
        endDate: '',
        subsidyAmount: 10000,
        paymentMethod: '統一匯款',
        subsidyMethod: '實支實付'
    },
    employees: [],
    expenses: []
};

// 註冊 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    updateUI();
    setupEventListeners();

    // 設定今天為預設日期
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today;

    // 載入 GAS URL 設定
    loadGasUrl();

    // 載入上次的 Trip Code
    const lastTripCode = localStorage.getItem('lastTripCode');
    if (lastTripCode) {
        const queryInput = document.getElementById('queryTripCode');
        if (queryInput) queryInput.value = lastTripCode;
    }

    // 更新 Trip Code Banner
    updateTripCodeBanner();
});

// 設定事件監聽器
function setupEventListeners() {
    // 幣別改變時更新匯率
    document.getElementById('expenseCurrency').addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const rate = selectedOption.dataset.rate;
        document.getElementById('expenseRate').value = rate;
        updateNTDPreview();
    });
    
    // 金額或匯率改變時更新預覽
    document.getElementById('expenseAmount').addEventListener('input', updateNTDPreview);
    document.getElementById('expenseRate').addEventListener('input', updateNTDPreview);
    
    // 單據照片上傳預覽
    document.getElementById('receiptPhoto').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('photoPreviewImg').src = e.target.result;
                document.getElementById('photoPreview').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });
    
    // 表單提交
    document.getElementById('expenseForm').addEventListener('submit', addExpense);
    document.getElementById('employeeForm').addEventListener('submit', addEmployee);
}

// 更新台幣預覽
function updateNTDPreview() {
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const rate = parseFloat(document.getElementById('expenseRate').value) || 1;
    const ntd = (amount * rate).toFixed(0);
    document.getElementById('ntdPreview').textContent = ntd.toLocaleString();
}

// 切換分頁
function switchTab(tab) {
    // 更新內容顯示
    document.getElementById('homeTab').classList.toggle('hidden', tab !== 'home');
    document.getElementById('settingsTab').classList.toggle('hidden', tab !== 'settings');
    
    // 更新按鈕狀態
    document.getElementById('homeTabBtn').classList.toggle('tab-active', tab === 'home');
    document.getElementById('settingsTabBtn').classList.toggle('tab-active', tab === 'settings');
}

// 顯示/關閉 Modal
function showAddExpenseModal() {
    document.getElementById('addExpenseModal').classList.add('active');
}

function showAddEmployeeModal() {
    document.getElementById('addEmployeeModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    // 重置表單
    if (modalId === 'addExpenseModal') {
        document.getElementById('expenseForm').reset();
        document.getElementById('photoPreview').classList.add('hidden');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('expenseDate').value = today;
        document.getElementById('expenseRate').value = 1;
        // 清除編輯模式
        delete document.getElementById('expenseForm').dataset.editId;
    } else if (modalId === 'addEmployeeModal') {
        document.getElementById('employeeForm').reset();
    }
}

// 壓縮圖片
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = Math.round(h * maxWidth / w);
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// 新增費用
function addExpense(e) {
    e.preventDefault();

    const photoFile = document.getElementById('receiptPhoto').files[0];

    if (photoFile) {
        compressImage(photoFile, 800, 0.6).then(compressed => {
            saveExpense(compressed);
        });
    } else {
        saveExpense(null);
    }
}

function saveExpense(photoData) {
    const form = document.getElementById('expenseForm');
    const editId = form.dataset.editId ? parseInt(form.dataset.editId) : null;

    const expense = {
        id: editId || Date.now(),
        category: document.getElementById('expenseCategory').value,
        date: document.getElementById('expenseDate').value,
        description: document.getElementById('expenseDescription').value,
        currency: document.getElementById('expenseCurrency').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        rate: parseFloat(document.getElementById('expenseRate').value),
        ntd: parseFloat(document.getElementById('expenseAmount').value) * parseFloat(document.getElementById('expenseRate').value),
        photo: photoData,
        timestamp: new Date().toISOString()
    };

    // 照片存 IndexedDB
    const afterSave = () => {
        if (editId) {
            // 編輯模式：更新現有
            const idx = appData.expenses.findIndex(e => e.id === editId);
            if (idx >= 0) {
                // 保留舊的 hasPhoto 如果沒有新照片
                if (!photoData && appData.expenses[idx].hasPhoto) {
                    expense.hasPhoto = true;
                }
                appData.expenses[idx] = expense;
            }
        } else {
            appData.expenses.push(expense);
        }
        saveData();
        updateUI();
        closeModal('addExpenseModal');
        showToast(editId ? '✓ 費用已更新' : '✓ 費用已新增');
    };

    if (photoData) {
        savePhoto(expense.id, photoData).then(afterSave).catch(() => afterSave());
    } else {
        afterSave();
    }
}

// 編輯費用
function editExpense(id) {
    const expense = appData.expenses.find(e => e.id === id);
    if (!expense) return;

    // 標記編輯模式
    document.getElementById('expenseForm').dataset.editId = id;

    // 預填表單
    document.getElementById('expenseCategory').value = expense.category;
    document.getElementById('expenseDate').value = expense.date;
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseCurrency').value = expense.currency;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expenseRate').value = expense.rate;
    updateNTDPreview();

    // 顯示現有照片預覽
    if (expense.photo) {
        document.getElementById('photoPreviewImg').src = expense.photo;
        document.getElementById('photoPreview').classList.remove('hidden');
    } else if (expense.hasPhoto) {
        getPhoto(id).then(data => {
            if (data) {
                document.getElementById('photoPreviewImg').src = data;
                document.getElementById('photoPreview').classList.remove('hidden');
            }
        });
    }

    showAddExpenseModal();
}

// 刪除費用
function deleteExpense(id) {
    if (confirm('確定要刪除這筆費用嗎？')) {
        deletePhoto(id).catch(() => {});
        appData.expenses = appData.expenses.filter(e => e.id !== id);
        saveData();
        updateUI();
        showToast('✓ 費用已刪除');
    }
}

// 新增員工
function addEmployee(e) {
    e.preventDefault();
    
    const employee = {
        id: Date.now(),
        name: document.getElementById('employeeName').value,
        apply: document.getElementById('employeeApply').value,
        startDate: document.getElementById('employeeStartDate').value || '滿一年'
    };
    
    appData.employees.push(employee);
    saveData();
    updateEmployeeList();
    closeModal('addEmployeeModal');
    showToast('✓ 員工已新增');
}

// 刪除員工
function deleteEmployee(id) {
    if (confirm('確定要刪除這位員工嗎？')) {
        appData.employees = appData.employees.filter(e => e.id !== id);
        saveData();
        updateEmployeeList();
        showToast('✓ 員工已刪除');
    }
}

// 儲存旅遊設定
function saveTripSettings() {
    appData.tripInfo = {
        location: document.getElementById('tripLocation').value,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        subsidyAmount: parseFloat(document.getElementById('subsidyAmount').value) || 10000,
        paymentMethod: document.getElementById('paymentMethod').value,
        subsidyMethod: document.getElementById('subsidyMethod').value
    };
    
    saveData();
    updateUI();
    showToast('✓ 設定已儲存');
}

// 更新 UI
function updateUI() {
    updateTripInfo();
    updateExpenseList();
    updateEmployeeList();
    updateStatistics();
    loadTripSettings();
}

function updateTripInfo() {
    const info = appData.tripInfo;
    let text = '設定旅遊資訊';
    
    if (info.location || info.startDate) {
        const parts = [];
        if (info.location) parts.push(info.location);
        if (info.startDate && info.endDate) {
            parts.push(`${info.startDate} ~ ${info.endDate}`);
        }
        text = parts.join(' | ');
    }
    
    document.getElementById('tripInfo').textContent = text;
}

function loadTripSettings() {
    const info = appData.tripInfo;
    document.getElementById('tripLocation').value = info.location || '';
    document.getElementById('startDate').value = info.startDate || '';
    document.getElementById('endDate').value = info.endDate || '';
    document.getElementById('subsidyAmount').value = info.subsidyAmount || 10000;
    document.getElementById('paymentMethod').value = info.paymentMethod || '統一匯款';
    document.getElementById('subsidyMethod').value = info.subsidyMethod || '實支實付';
}

function updateExpenseList() {
    const container = document.getElementById('expenseList');
    
    if (appData.expenses.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-12">
                <svg class="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <p>尚無費用記錄</p>
                <p class="text-sm mt-1">點擊右下角 ＋ 新增</p>
            </div>
        `;
        return;
    }
    
    // 按日期分組
    const groupedByDate = {};
    appData.expenses.forEach(expense => {
        const date = expense.date;
        if (!groupedByDate[date]) {
            groupedByDate[date] = [];
        }
        groupedByDate[date].push(expense);
    });
    
    // 依日期排序
    const sortedDates = Object.keys(groupedByDate).sort().reverse();
    
    let html = '';
    sortedDates.forEach(date => {
        const expenses = groupedByDate[date];
        const dateObj = new Date(date);
        const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()];
        
        html += `
            <div class="mb-4">
                <div class="text-sm text-gray-600 mb-2 font-semibold">📅 ${formattedDate} (${weekday})</div>
                ${expenses.map(expense => createExpenseCard(expense)).join('')}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function createExpenseCard(expense) {
    const categoryColors = {
        '代收轉付收據': 'bg-blue-100 text-blue-700',
        '住宿費': 'bg-purple-100 text-purple-700',
        '交通費': 'bg-green-100 text-green-700',
        '餐費': 'bg-orange-100 text-orange-700',
        '其他費用': 'bg-gray-100 text-gray-700'
    };
    
    const categoryEmojis = {
        '代收轉付收據': '🧾',
        '住宿費': '🏨',
        '交通費': '🚗',
        '餐費': '🍽️',
        '其他費用': '📌'
    };
    
    // 費用審核狀態 badge
    const expStatusBadge = expense.expenseStatus && expense.expenseStatus !== 'pending'
        ? (() => {
            const sm = {
                'approved': { label: '已通過', cls: 'bg-green-100 text-green-700' },
                'rejected': { label: '已退回', cls: 'bg-red-100 text-red-700' },
                'needs_revision': { label: '需補件', cls: 'bg-orange-100 text-orange-700' }
            };
            const s = sm[expense.expenseStatus] || { label: expense.expenseStatus, cls: 'bg-gray-100 text-gray-700' };
            return `<span class="text-xs px-2 py-0.5 rounded-full ${s.cls} font-medium">${s.label}</span>`;
        })()
        : '';

    return `
        <div class="expense-card bg-white rounded-xl p-4 mb-2">
            <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="category-badge ${categoryColors[expense.category] || 'bg-gray-100 text-gray-700'}">
                            ${categoryEmojis[expense.category] || '📌'} ${expense.category}
                        </span>
                        ${expStatusBadge}
                    </div>
                    <div class="font-semibold text-gray-800">${expense.description}</div>
                    ${expense.expenseReviewNote ? `<p class="text-xs text-orange-600 mt-1">審核備註：${expense.expenseReviewNote}</p>` : ''}
                </div>
                <div class="flex items-center gap-1 ml-2">
                    <button onclick="editExpense(${expense.id})" class="text-blue-400 hover:text-blue-600" title="編輯">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                    <button onclick="deleteExpense(${expense.id})" class="text-red-400 hover:text-red-600" title="刪除">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="flex items-center justify-between">
                <div>
                    <div class="text-2xl font-bold text-purple-600">NT$ ${expense.ntd.toFixed(0).toLocaleString()}</div>
                    <div class="text-xs text-gray-500">${expense.currency} ${expense.amount.toLocaleString()} × ${expense.rate}</div>
                </div>
                ${expense.photo ? `
                    <div class="ml-3">
                        <img src="${expense.photo}" class="receipt-preview" onclick="showImagePreview(${expense.id})">
                    </div>
                ` : expense.hasPhoto ? `
                    <div class="ml-3 w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer" onclick="showImagePreview(${expense.id})">
                        <span class="text-2xl">📷</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function updateEmployeeList() {
    const container = document.getElementById('employeeList');
    
    if (appData.employees.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">尚無員工資料</div>';
        return;
    }
    
    const html = appData.employees.map(emp => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div class="flex-1">
                <div class="font-semibold">${emp.name}</div>
                <div class="text-xs text-gray-500">
                    ${emp.apply === 'y' ? '✓ 申請補助' : '✗ 不申請補助'} | 
                    到職: ${emp.startDate}
                </div>
            </div>
            <button onclick="deleteEmployee(${emp.id})" class="text-red-400 hover:text-red-600 ml-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

function updateStatistics() {
    const totalExpense = appData.expenses.reduce((sum, exp) => sum + exp.ntd, 0);
    const receiptCount = appData.expenses.length;
    
    // 計算總申請金額（不超過員工補助總額）
    const totalSubsidy = appData.employees
        .filter(emp => emp.apply === 'y')
        .reduce((sum, emp) => {
            // 計算補助比例
            let ratio = 1;
            if (emp.startDate !== '滿一年' && appData.tripInfo.startDate) {
                const startDate = new Date(emp.startDate);
                const tripDate = new Date(appData.tripInfo.startDate);
                const daysDiff = (tripDate - startDate) / (1000 * 60 * 60 * 24);
                ratio = Math.min(daysDiff / 365, 1);
            }
            
            const subsidyAmount = Math.min(appData.tripInfo.subsidyAmount * ratio, 10000);
            return sum + subsidyAmount;
        }, 0);
    
    const totalClaim = Math.min(totalExpense, totalSubsidy);
    
    document.getElementById('totalExpense').textContent = `NT$ ${totalExpense.toFixed(0).toLocaleString()}`;
    document.getElementById('totalClaim').textContent = `NT$ ${totalClaim.toFixed(0).toLocaleString()}`;
    document.getElementById('receiptCount').textContent = receiptCount;
}

// 匯出 Excel
function exportToExcel() {
    if (appData.expenses.length === 0) {
        alert('尚無費用記錄，無法產生申請單');
        return;
    }
    
    if (appData.employees.length === 0) {
        alert('請先新增員工資料');
        return;
    }
    
    showToast('⏳ 正在產生 Excel 檔案...');
    
    // 使用 setTimeout 讓 toast 有時間顯示
    setTimeout(() => {
        try {
            generateExcelFile();
        } catch (error) {
            console.error('Excel generation error:', error);
            alert('產生 Excel 時發生錯誤：' + error.message);
        }
    }, 100);
}

function generateExcelFile() {
    const wb = XLSX.utils.book_new();
    const wsData = [];
    
    // 空白行
    wsData.push([]);
    wsData.push([]);
    
    // 標題
    wsData.push(['', '員工自助旅遊費用申請單  Expenses Application']);
    wsData.push([]);
    
    // 匯款方式
    wsData.push(['', '匯款方式(下拉選單)→', appData.tripInfo.paymentMethod]);
    
    // 補助資訊標題行
    wsData.push(['', '補助資訊\n(人員、金額)', '', '出發日期', appData.tripInfo.startDate, '', '結束日期', appData.tripInfo.endDate]);
    wsData.push(['', '', '', '補助額度', appData.tripInfo.subsidyAmount, '', '補助方式\n(下拉選單)', appData.tripInfo.subsidyMethod]);
    
    // 員工資訊標題
    wsData.push(['', '', '', '員工姓名', '申請補助\n(下拉選單)', '請填滿一年\n或到職日', '補助比例', '補助金額', '匯款金額']);
    
    // 員工資料
    const employeeStartRow = wsData.length;
    appData.employees.forEach(emp => {
        // 計算補助比例
        let ratio = 0;
        if (emp.apply === 'y') {
            if (emp.startDate === '滿一年') {
                ratio = 1;
            } else if (appData.tripInfo.startDate) {
                const startDate = new Date(emp.startDate);
                const tripDate = new Date(appData.tripInfo.startDate);
                const daysDiff = (tripDate - startDate) / (1000 * 60 * 60 * 24);
                ratio = Math.min(daysDiff / 365, 1);
            }
        }
        
        const subsidyAmount = Math.min(appData.tripInfo.subsidyAmount * ratio, 10000);
        
        wsData.push(['', '', '', emp.name, emp.apply, emp.startDate, ratio, subsidyAmount, subsidyAmount]);
    });
    
    // 小計
    const totalSubsidy = appData.employees
        .filter(emp => emp.apply === 'y')
        .reduce((sum, emp) => {
            let ratio = 1;
            if (emp.startDate !== '滿一年' && appData.tripInfo.startDate) {
                const startDate = new Date(emp.startDate);
                const tripDate = new Date(appData.tripInfo.startDate);
                const daysDiff = (tripDate - startDate) / (1000 * 60 * 60 * 24);
                ratio = Math.min(daysDiff / 365, 1);
            }
            return sum + Math.min(appData.tripInfo.subsidyAmount * ratio, 10000);
        }, 0);
    
    wsData.push(['', '備註：小計金額因補助比例不同而可能產生無法除盡的狀況...', '', '', '', '', '', '', '小計', totalSubsidy]);
    
    // 地點和期間
    wsData.push(['', '地點\nLocation', appData.tripInfo.location]);
    wsData.push(['', '期間Period', `${appData.tripInfo.startDate} ~ ${appData.tripInfo.endDate}`]);
    
    // 費用明細標題
    wsData.push(['', '科目\nAccount', '日期\nDate', '說明\nDescription', '', '', '幣別\nCurrency', '金額\nAmount', '匯率\nEx. Rate', '新台幣\nNTD']);
    
    // 按類別分組費用
    const categories = ['代收轉付收據', '住宿費', '交通費', '餐費', '其他費用'];
    const expenseStartRow = wsData.length;
    
    categories.forEach(category => {
        const categoryExpenses = appData.expenses.filter(e => e.category === category);
        
        if (categoryExpenses.length > 0) {
            categoryExpenses.forEach((exp, index) => {
                if (index === 0) {
                    wsData.push(['', category, exp.date, exp.description, '', '', exp.currency, exp.amount, exp.rate, exp.ntd]);
                } else {
                    wsData.push(['', '', exp.date, exp.description, '', '', exp.currency, exp.amount, exp.rate, exp.ntd]);
                }
            });
        } else {
            wsData.push(['', category, '', '', '', '', '', '', '', 0]);
        }
    });
    
    // 總計
    const totalExpense = appData.expenses.reduce((sum, exp) => sum + exp.ntd, 0);
    const totalClaim = Math.min(totalExpense, totalSubsidy);
    
    wsData.push(['', '單據費用合計 Total Amount', '', '', '', '', '', '', '', totalExpense]);
    wsData.push(['', '總申請金額 Apply for amortise', '', '', '', '', '', '', '', totalClaim]);
    wsData.push(['', '付款總金額 Apply for amortise', '', '', '', '', '', '', '', totalSubsidy]);
    wsData.push([]);
    wsData.push(['', '申請人:', '(親簽)', '', 'Date :', new Date().toISOString().split('T')[0]]);
    
    // 建立工作表
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // 設定欄寬
    ws['!cols'] = [
        {wch: 2}, {wch: 20}, {wch: 12}, {wch: 30}, {wch: 10}, {wch: 10}, 
        {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}
    ];
    
    // 加入工作表
    XLSX.utils.book_append_sheet(wb, ws, '員工旅遊');
    
    // 產生檔案名稱
    const fileName = `員工自助旅遊費用申請單_${appData.tripInfo.location || '旅遊'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // 匯出
    XLSX.writeFile(wb, fileName);
    
    showToast('✓ Excel 申請單已產生！');
}

// 顯示圖片預覽
function showImagePreview(expenseId) {
    const expense = appData.expenses.find(e => e.id === expenseId);
    if (!expense) return;

    function showOverlay(src) {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black bg-opacity-90 z-[3000] flex items-center justify-center';
        overlay.onclick = () => overlay.remove();
        overlay.innerHTML = `
            <button class="absolute top-4 right-4 text-white text-3xl font-bold z-[3001]" onclick="this.parentElement.remove()">&times;</button>
            <img src="${src}" class="max-w-full max-h-full object-contain p-4">
        `;
        document.body.appendChild(overlay);
    }

    if (expense.photo) {
        showOverlay(expense.photo);
    } else if (expense.hasPhoto) {
        getPhoto(expenseId).then(data => {
            if (data) {
                expense.photo = data;
                showOverlay(data);
            }
        });
    }
}

// Toast 訊息
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg z-[3000]';
    toast.style.animation = 'slideDown 0.3s ease';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// === IndexedDB 照片儲存 ===
function openPhotoDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('travelExpensePhotos', 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('photos', { keyPath: 'id' });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

function savePhoto(id, data) {
    return openPhotoDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('photos', 'readwrite');
            tx.objectStore('photos').put({ id, data });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    });
}

function getPhoto(id) {
    return openPhotoDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('photos', 'readonly');
            const req = tx.objectStore('photos').get(id);
            req.onsuccess = () => resolve(req.result ? req.result.data : null);
            req.onerror = (e) => reject(e.target.error);
        });
    });
}

function deletePhoto(id) {
    return openPhotoDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('photos', 'readwrite');
            tx.objectStore('photos').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    });
}

// === 資料存取 ===
// localStorage 只存結構化資料（不含照片），照片存 IndexedDB
function saveData() {
    const dataToSave = {
        tripCode: appData.tripCode || null,
        tripInfo: appData.tripInfo,
        employees: appData.employees,
        expenses: appData.expenses.map(e => {
            const copy = Object.assign({}, e);
            delete copy.photo;
            copy.hasPhoto = !!e.photo;
            return copy;
        })
    };
    try {
        localStorage.setItem('travelExpenseApp', JSON.stringify(dataToSave));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            alert('儲存空間已滿，請刪除部分費用記錄後再試');
        }
    }
}

function loadData() {
    const saved = localStorage.getItem('travelExpenseApp');
    if (saved) {
        const parsed = JSON.parse(saved);
        appData = {
            tripCode: parsed.tripCode || null,
            tripInfo: parsed.tripInfo || appData.tripInfo,
            employees: parsed.employees || [],
            expenses: parsed.expenses || []
        };
        // 遷移舊資料：把 localStorage 中的照片搬到 IndexedDB
        migratePhotosToIDB().then(() => {
            loadAllPhotos();
        });
    }
}

function migratePhotosToIDB() {
    const needsMigration = appData.expenses.filter(e => e.photo && typeof e.photo === 'string' && e.photo.startsWith('data:'));
    if (needsMigration.length === 0) return Promise.resolve();

    return openPhotoDB().then(db => {
        const tx = db.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        needsMigration.forEach(e => {
            store.put({ id: e.id, data: e.photo });
        });
        return new Promise(resolve => {
            tx.oncomplete = () => {
                // 清除 localStorage 中的照片，重新儲存
                needsMigration.forEach(e => {
                    e.hasPhoto = true;
                    delete e.photo;
                });
                saveData();
                resolve();
            };
            tx.onerror = () => resolve();
        });
    }).catch(() => Promise.resolve());
}

function loadAllPhotos() {
    openPhotoDB().then(db => {
        const tx = db.transaction('photos', 'readonly');
        const store = tx.objectStore('photos');
        const req = store.getAll();
        req.onsuccess = () => {
            const photoMap = {};
            req.result.forEach(p => { photoMap[p.id] = p.data; });
            appData.expenses.forEach(exp => {
                if (exp.hasPhoto && photoMap[exp.id]) {
                    exp.photo = photoMap[exp.id];
                }
            });
            updateUI();
        };
    }).catch(() => {});
}

// === 匯出/匯入功能 ===

// 團長已匯入的團員費用
let mergedMembers = [];

// 下載 JSON 檔案
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// 產生旅遊 ID（用來比對團員歸屬）
function getTripId() {
    const info = appData.tripInfo;
    return `${info.location || '未設定'}_${info.startDate || ''}_${info.endDate || ''}`;
}

// 匯出旅遊資訊 Modal
function showExportConfigModal() {
    if (!appData.tripInfo.location && !appData.tripInfo.startDate) {
        alert('請先設定旅遊資訊');
        return;
    }
    document.getElementById('exportConfigModal').classList.add('active');
}

// 匯出旅遊資訊
function exportTripConfig() {
    const includeEmployees = document.getElementById('exportEmployees').checked;
    const includeExpenses = document.getElementById('exportExpenses').checked;

    const data = {
        type: 'trip-config',
        version: 2,
        tripCode: appData.tripCode || null,
        tripInfo: appData.tripInfo
    };

    if (includeEmployees) {
        data.employees = appData.employees;
    }
    if (includeExpenses) {
        data.expenses = appData.expenses.map(e => {
            const copy = Object.assign({}, e);
            delete copy.photo;
            delete copy.hasPhoto;
            return copy;
        });
    }

    const filename = `旅遊資訊_${appData.tripInfo.location || '旅遊'}_${new Date().toISOString().split('T')[0]}.json`;
    downloadJSON(data, filename);
    closeModal('exportConfigModal');
    showToast('✓ 旅遊資訊已匯出');
}

// 匯入旅遊資訊
function importTripConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.type !== 'trip-config') {
                alert('檔案格式錯誤：這不是旅遊資訊檔案');
                return;
            }

            if (data.tripInfo) {
                appData.tripInfo = data.tripInfo;
            }
            if (data.tripCode) {
                appData.tripCode = data.tripCode;
            }
            if (data.employees && data.employees.length > 0) {
                if (appData.employees.length > 0) {
                    if (confirm(`是否要覆蓋目前的員工名單？\n目前有 ${appData.employees.length} 人，匯入檔有 ${data.employees.length} 人`)) {
                        appData.employees = data.employees;
                    }
                } else {
                    appData.employees = data.employees;
                }
            }
            if (data.expenses && data.expenses.length > 0) {
                if (appData.expenses.length > 0) {
                    if (confirm(`是否要覆蓋目前的費用記錄？\n目前有 ${appData.expenses.length} 筆，匯入檔有 ${data.expenses.length} 筆`)) {
                        appData.expenses = data.expenses;
                    }
                } else {
                    appData.expenses = data.expenses;
                }
            }

            saveData();
            updateUI();
            showToast('✓ 旅遊資訊已匯入');
        } catch (err) {
            alert('匯入失敗：檔案格式無法解析');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// 團員匯出費用
function exportMemberExpenses() {
    if (appData.expenses.length === 0) {
        alert('尚無費用記錄可匯出');
        return;
    }

    const name = prompt('請輸入您的姓名（用於團長識別）：');
    if (!name || !name.trim()) return;

    const data = {
        type: 'member-expenses',
        version: 2,
        tripCode: appData.tripCode || null,
        memberName: name.trim(),
        tripId: getTripId(),
        expenses: appData.expenses.map(e => {
            const copy = Object.assign({}, e);
            delete copy.photo;
            delete copy.hasPhoto;
            return copy;
        }),
        exportDate: new Date().toISOString().split('T')[0]
    };

    const filename = `費用_${name.trim()}_${new Date().toISOString().split('T')[0]}.json`;
    downloadJSON(data, filename);
    showToast('✓ 費用 JSON 已匯出');
}

// 團長匯入團員費用
function importMemberExpenses(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let processed = 0;
    let imported = 0;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.type !== 'member-expenses') {
                    showToast('跳過：' + file.name + ' 不是團員費用檔案');
                } else {
                    // 若匯入的資料帶有 tripCode，存入
                    if (data.tripCode && !appData.tripCode) {
                        appData.tripCode = data.tripCode;
                        saveData();
                    }
                    // 檢查是否已匯入過同名團員
                    const existing = mergedMembers.findIndex(m => m.memberName === data.memberName);
                    if (existing >= 0) {
                        mergedMembers[existing] = data;
                    } else {
                        mergedMembers.push(data);
                    }
                    imported++;
                }
            } catch (err) {
                showToast('跳過：' + file.name + ' 格式錯誤');
            }

            processed++;
            if (processed === files.length) {
                updateMergedMembersList();
                if (imported > 0) {
                    showToast(`✓ 已匯入 ${imported} 位團員費用`);
                }
            }
        };
        reader.readAsText(file);
    });

    event.target.value = '';
}

// 更新已匯入團員列表
function updateMergedMembersList() {
    const container = document.getElementById('mergedMembersList');
    const btn = document.getElementById('mergedExcelBtn');

    if (mergedMembers.length === 0) {
        container.innerHTML = '';
        btn.classList.add('hidden');
        return;
    }

    btn.classList.remove('hidden');
    container.innerHTML = mergedMembers.map((m, i) => `
        <div class="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
            <div class="flex-1">
                <div class="font-semibold text-sm">${m.memberName}</div>
                <div class="text-xs text-gray-500">${m.expenses.length} 筆費用 | 匯出日: ${m.exportDate || '-'}</div>
            </div>
            <button onclick="removeMergedMember(${i})" class="text-red-400 hover:text-red-600 ml-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `).join('');
}

// 移除已匯入的團員
function removeMergedMember(index) {
    mergedMembers.splice(index, 1);
    updateMergedMembersList();
}

// 產生合併 Excel
function generateMergedExcel() {
    if (mergedMembers.length === 0) {
        alert('請先匯入團員費用');
        return;
    }
    if (appData.employees.length === 0) {
        alert('請先在員工名單中新增員工');
        return;
    }

    showToast('⏳ 正在產生合併 Excel...');

    setTimeout(() => {
        try {
            const wb = XLSX.utils.book_new();
            const wsData = [];

            wsData.push([]);
            wsData.push([]);
            wsData.push(['', '員工自助旅遊費用申請單  Expenses Application (合併)']);
            wsData.push([]);

            wsData.push(['', '匯款方式(下拉選單)→', appData.tripInfo.paymentMethod]);
            wsData.push(['', '補助資訊\n(人員、金額)', '', '出發日期', appData.tripInfo.startDate, '', '結束日期', appData.tripInfo.endDate]);
            wsData.push(['', '', '', '補助額度', appData.tripInfo.subsidyAmount, '', '補助方式\n(下拉選單)', appData.tripInfo.subsidyMethod]);

            wsData.push(['', '', '', '員工姓名', '申請補助\n(下拉選單)', '請填滿一年\n或到職日', '補助比例', '補助金額', '匯款金額']);

            appData.employees.forEach(emp => {
                let ratio = 0;
                if (emp.apply === 'y') {
                    if (emp.startDate === '滿一年') {
                        ratio = 1;
                    } else if (appData.tripInfo.startDate) {
                        const sd = new Date(emp.startDate);
                        const td = new Date(appData.tripInfo.startDate);
                        ratio = Math.min((td - sd) / (1000 * 60 * 60 * 24 * 365), 1);
                    }
                }
                const amt = Math.min(appData.tripInfo.subsidyAmount * ratio, 10000);
                wsData.push(['', '', '', emp.name, emp.apply, emp.startDate, ratio, amt, amt]);
            });

            const totalSubsidy = appData.employees
                .filter(emp => emp.apply === 'y')
                .reduce((sum, emp) => {
                    let ratio = 1;
                    if (emp.startDate !== '滿一年' && appData.tripInfo.startDate) {
                        const sd = new Date(emp.startDate);
                        const td = new Date(appData.tripInfo.startDate);
                        ratio = Math.min((td - sd) / (1000 * 60 * 60 * 24 * 365), 1);
                    }
                    return sum + Math.min(appData.tripInfo.subsidyAmount * ratio, 10000);
                }, 0);

            wsData.push(['', '', '', '', '', '', '', '', '小計', totalSubsidy]);
            wsData.push([]);

            wsData.push(['', '地點\nLocation', appData.tripInfo.location]);
            wsData.push(['', '期間Period', `${appData.tripInfo.startDate} ~ ${appData.tripInfo.endDate}`]);

            // 費用明細標題 - 多一欄「申報人」
            wsData.push(['', '申報人\nReporter', '科目\nAccount', '日期\nDate', '說明\nDescription', '', '幣別\nCurrency', '金額\nAmount', '匯率\nEx. Rate', '新台幣\nNTD']);

            // 合併所有團員費用
            const allExpenses = [];
            mergedMembers.forEach(m => {
                m.expenses.forEach(exp => {
                    allExpenses.push(Object.assign({}, exp, { reporter: m.memberName }));
                });
            });

            // 按類別分組
            const categories = ['代收轉付收據', '住宿費', '交通費', '餐費', '其他費用'];
            let totalExpense = 0;

            categories.forEach(category => {
                const catExpenses = allExpenses.filter(e => e.category === category);
                if (catExpenses.length > 0) {
                    catExpenses.forEach((exp, i) => {
                        totalExpense += exp.ntd;
                        wsData.push(['', exp.reporter, i === 0 ? category : '', exp.date, exp.description, '', exp.currency, exp.amount, exp.rate, exp.ntd]);
                    });
                } else {
                    wsData.push(['', '', category, '', '', '', '', '', '', 0]);
                }
            });

            const totalClaim = Math.min(totalExpense, totalSubsidy);

            wsData.push(['', '', '單據費用合計 Total Amount', '', '', '', '', '', '', totalExpense]);
            wsData.push(['', '', '總申請金額 Apply for amortise', '', '', '', '', '', '', totalClaim]);
            wsData.push(['', '', '付款總金額 Apply for amortise', '', '', '', '', '', '', totalSubsidy]);
            wsData.push([]);
            wsData.push(['', '申請人:', '(親簽)', '', 'Date :', new Date().toISOString().split('T')[0]]);

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                {wch: 2}, {wch: 12}, {wch: 20}, {wch: 12}, {wch: 25}, {wch: 5},
                {wch: 10}, {wch: 12}, {wch: 10}, {wch: 15}
            ];

            XLSX.utils.book_append_sheet(wb, ws, '合併申請');

            const fileName = `合併費用申請單_${appData.tripInfo.location || '旅遊'}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast('✓ 合併 Excel 已產生！');
        } catch (error) {
            console.error('Merged Excel error:', error);
            alert('產生合併 Excel 時發生錯誤：' + error.message);
        }
    }, 100);
}

// ============================================
// 雲端上傳與查詢功能
// ============================================

// 儲存 GAS URL
function saveGasUrl() {
    const url = document.getElementById('gasUrl').value.trim();
    if (!url) {
        alert('請輸入 GAS Web App URL');
        return;
    }
    localStorage.setItem('gasWebAppUrl', url);
    showToast('✓ GAS URL 已儲存');
}

// 取得 GAS URL
function getGasUrl() {
    return localStorage.getItem('gasWebAppUrl') || '';
}

// 載入 GAS URL 到輸入框
function loadGasUrl() {
    const url = getGasUrl();
    const input = document.getElementById('gasUrl');
    if (input && url) {
        input.value = url;
    }
}

// 上傳至雲端
async function submitToCloud() {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
        alert('請先設定 GAS Web App URL');
        return;
    }

    const submitterName = document.getElementById('submitterName').value.trim();
    if (!submitterName) {
        alert('請輸入提交人姓名');
        return;
    }

    if (appData.expenses.length === 0) {
        alert('尚無費用記錄，請先新增費用');
        return;
    }

    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const tripCodeDisplay = document.getElementById('tripCodeDisplay');

    progressDiv.classList.remove('hidden');
    tripCodeDisplay.classList.add('hidden');
    progressBar.style.width = '10%';
    progressText.textContent = '準備上傳資料...';

    try {
        const api = new TravelAPI(gasUrl);

        // 收集費用資料（含照片）
        progressText.textContent = '收集費用與照片資料...';
        progressBar.style.width = '20%';

        const expenses = [];
        for (let i = 0; i < appData.expenses.length; i++) {
            const exp = appData.expenses[i];
            const expData = {
                employeeName: submitterName,
                date: exp.date,
                category: exp.category,
                description: exp.description,
                currency: exp.currency,
                amount: exp.amount,
                exchangeRate: exp.rate,
                amountNTD: exp.ntd
            };

            // 從 IndexedDB 取照片
            if (exp.hasPhoto || exp.photo) {
                try {
                    let photoData = exp.photo;
                    if (!photoData && exp.id) {
                        photoData = await getPhoto(exp.id);
                    }
                    if (photoData) {
                        expData.photo = photoData;
                    }
                } catch (e) {
                    console.log('取得照片失敗:', e);
                }
            }

            expenses.push(expData);
            const progress = 20 + (i / appData.expenses.length) * 40;
            progressBar.style.width = progress + '%';
            progressText.textContent = `收集資料中 (${i + 1}/${appData.expenses.length})...`;
        }

        progressBar.style.width = '70%';
        progressText.textContent = appData.tripCode ? '重新上傳中，請稍候...' : '上傳中，請稍候...';

        const payload = {
            tripInfo: appData.tripInfo,
            employees: appData.employees,
            expenses: expenses,
            submittedBy: submitterName
        };
        // 更新模式：傳送現有 tripCode
        if (appData.tripCode) {
            payload.tripCode = appData.tripCode;
        }

        const result = await api.submitTrip(payload);

        if (result.success) {
            progressBar.style.width = '100%';
            progressText.textContent = '上傳完成！';
            tripCodeDisplay.classList.remove('hidden');
            document.getElementById('tripCodeValue').textContent = result.tripCode;

            // 記住 trip code
            appData.tripCode = result.tripCode;
            saveData();
            localStorage.setItem('lastTripCode', result.tripCode);
            updateTripCodeBanner();
            showToast(payload.tripCode ? '✓ 重新上傳成功！' : '✓ 上傳成功！');
        } else {
            throw new Error(result.error || '上傳失敗');
        }
    } catch (error) {
        progressBar.style.width = '0%';
        progressText.textContent = '上傳失敗：' + error.message;
        alert('上傳失敗：' + error.message);
    }
}

// 查詢審核狀態
async function checkTripStatus() {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
        alert('請先設定 GAS Web App URL');
        return;
    }

    const tripCode = document.getElementById('queryTripCode').value.trim();
    if (!tripCode) {
        alert('請輸入 Trip Code');
        return;
    }

    const statusResult = document.getElementById('statusResult');
    statusResult.classList.remove('hidden');
    statusResult.innerHTML = '<div class="text-center py-4 text-gray-500">查詢中...</div>';

    try {
        const api = new TravelAPI(gasUrl);
        const result = await api.getTripStatus(tripCode);

        if (result.success) {
            showStatusResult(result.trip, result.expenses || []);
        } else {
            statusResult.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">${result.error}</div>`;
        }
    } catch (error) {
        statusResult.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">查詢失敗：${error.message}</div>`;
    }
}

// 顯示審核狀態結果（含逐筆費用狀態）
function showStatusResult(trip, expenses) {
    const statusResult = document.getElementById('statusResult');
    const statusMap = {
        'pending': { label: '待審核', color: 'yellow', icon: '⏳' },
        'approved': { label: '已通過', color: 'green', icon: '✅' },
        'rejected': { label: '已退回', color: 'red', icon: '❌' },
        'needs_revision': { label: '需補件', color: 'orange', icon: '📝' }
    };

    const status = statusMap[trip.status] || { label: trip.status, color: 'gray', icon: '❓' };

    // 判斷是否有被退回/補件的費用
    const hasRejected = expenses.some(e => e.expenseStatus === 'rejected' || e.expenseStatus === 'needs_revision');

    let expensesHtml = '';
    if (expenses.length > 0) {
        const expStatusMap = {
            'pending': { label: '待審', cls: 'bg-yellow-100 text-yellow-700' },
            'approved': { label: '通過', cls: 'bg-green-100 text-green-700' },
            'rejected': { label: '退回', cls: 'bg-red-100 text-red-700' },
            'needs_revision': { label: '補件', cls: 'bg-orange-100 text-orange-700' }
        };

        expensesHtml = `
            <div class="mt-3 border-t pt-3">
                <p class="font-medium text-sm mb-2">逐筆審核狀態：</p>
                <div class="space-y-2">
                    ${expenses.map(exp => {
                        const es = expStatusMap[exp.expenseStatus] || expStatusMap['pending'];
                        return `
                            <div class="flex items-center justify-between text-xs p-2 bg-white rounded border">
                                <div class="flex-1">
                                    <span class="font-medium">${exp.category}</span>
                                    <span class="text-gray-500 ml-1">${exp.date}</span>
                                    <span class="text-gray-400 ml-1">${exp.description}</span>
                                </div>
                                <div class="flex items-center gap-2 ml-2">
                                    <span class="font-medium">NT$ ${Number(exp.amountNTD).toLocaleString()}</span>
                                    <span class="px-2 py-0.5 rounded-full ${es.cls} font-medium">${es.label}</span>
                                </div>
                            </div>
                            ${exp.expenseReviewNote ? `<div class="text-xs text-orange-600 ml-2 -mt-1 mb-1">備註：${exp.expenseReviewNote}</div>` : ''}
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    statusResult.innerHTML = `
        <div class="bg-${status.color}-50 border border-${status.color}-200 rounded-lg p-4">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-2xl">${status.icon}</span>
                <span class="font-bold text-${status.color}-800 text-lg">${status.label}</span>
            </div>
            <div class="space-y-1 text-sm text-gray-700">
                <p><span class="font-medium">Trip Code：</span>${trip.tripCode}</p>
                <p><span class="font-medium">旅遊地點：</span>${trip.location}</p>
                <p><span class="font-medium">日期：</span>${trip.startDate} ~ ${trip.endDate}</p>
                <p><span class="font-medium">提交人：</span>${trip.submittedBy}</p>
                <p><span class="font-medium">提交日期：</span>${trip.submittedDate}</p>
                ${trip.reviewNote ? `<p class="mt-2 p-2 bg-white rounded border"><span class="font-medium">審核備註：</span>${trip.reviewNote}</p>` : ''}
                ${trip.reviewDate ? `<p><span class="font-medium">審核日期：</span>${trip.reviewDate}</p>` : ''}
            </div>
            ${expensesHtml}
            ${hasRejected ? `
            <div class="mt-3">
                <button onclick="prepareReupload('${trip.tripCode}')" class="w-full py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">
                    修改並重新上傳
                </button>
            </div>
            ` : ''}
        </div>
    `;
}

// 準備重新上傳（設定 tripCode，切回首頁）
function prepareReupload(tripCode) {
    appData.tripCode = tripCode;
    saveData();
    updateTripCodeBanner();
    switchTab('home');
    showToast('已載入 Trip Code，修改費用後重新上傳');
}

// 清除 tripCode（建立全新申請）
function clearTripCode() {
    appData.tripCode = null;
    saveData();
    updateTripCodeBanner();
    showToast('已清除 Trip Code，下次上傳為全新申請');
}

// 更新 Trip Code Banner 顯示
function updateTripCodeBanner() {
    const banner = document.getElementById('tripCodeBanner');
    if (!banner) return;
    if (appData.tripCode) {
        banner.classList.remove('hidden');
        document.getElementById('currentTripCode').textContent = appData.tripCode;
        // 更新上傳按鈕文字
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.textContent = '重新上傳至雲端';
    } else {
        banner.classList.add('hidden');
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.textContent = '上傳至雲端';
    }
}

// 新增動畫樣式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from { transform: translate(-50%, -100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes slideUp {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, -100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
