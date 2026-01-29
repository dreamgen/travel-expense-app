// 旅遊費用申請 APP - JavaScript

// 全域資料
let appData = {
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
    } else if (modalId === 'addEmployeeModal') {
        document.getElementById('employeeForm').reset();
    }
}

// 新增費用
function addExpense(e) {
    e.preventDefault();
    
    const photoFile = document.getElementById('receiptPhoto').files[0];
    let photoData = null;
    
    if (photoFile) {
        const reader = new FileReader();
        reader.onload = function(e) {
            photoData = e.target.result;
            saveExpense(photoData);
        };
        reader.readAsDataURL(photoFile);
    } else {
        saveExpense(null);
    }
}

function saveExpense(photoData) {
    const expense = {
        id: Date.now(),
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
    
    appData.expenses.push(expense);
    saveData();
    updateUI();
    closeModal('addExpenseModal');
    
    // 顯示成功訊息
    showToast('✓ 費用已新增');
}

// 刪除費用
function deleteExpense(id) {
    if (confirm('確定要刪除這筆費用嗎？')) {
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
    
    return `
        <div class="expense-card bg-white rounded-xl p-4 mb-2">
            <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="category-badge ${categoryColors[expense.category] || 'bg-gray-100 text-gray-700'}">
                            ${categoryEmojis[expense.category] || '📌'} ${expense.category}
                        </span>
                    </div>
                    <div class="font-semibold text-gray-800">${expense.description}</div>
                </div>
                <button onclick="deleteExpense(${expense.id})" class="text-red-400 hover:text-red-600 ml-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
            
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-2xl font-bold text-purple-600">NT$ ${expense.ntd.toFixed(0).toLocaleString()}</div>
                    <div class="text-xs text-gray-500">${expense.currency} ${expense.amount.toLocaleString()} × ${expense.rate}</div>
                </div>
                ${expense.photo ? `
                    <div class="ml-3">
                        <img src="${expense.photo}" class="receipt-preview" onclick="showImagePreview('${expense.photo}')">
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
function showImagePreview(src) {
    // 可以實作圖片放大查看功能
    window.open(src, '_blank');
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

// 資料存取
function saveData() {
    localStorage.setItem('travelExpenseApp', JSON.stringify(appData));
}

function loadData() {
    const saved = localStorage.getItem('travelExpenseApp');
    if (saved) {
        appData = JSON.parse(saved);
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
