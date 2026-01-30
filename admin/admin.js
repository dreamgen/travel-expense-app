// 旅遊費用審核後台 - JavaScript

let api = null;
let currentTrips = [];
let currentFilter = 'all';
let currentTripCode = null;

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // 載入儲存的 GAS URL
    const savedUrl = localStorage.getItem('adminGasUrl');
    if (savedUrl) {
        document.getElementById('adminGasUrl').value = savedUrl;
    }

    // 檢查是否已登入
    const token = sessionStorage.getItem('adminToken');
    const gasUrl = localStorage.getItem('adminGasUrl');
    if (token && gasUrl) {
        api = new TravelAPI(gasUrl);
        showDashboard();
    }

    // 處理 hash routing
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
});

// ============================================
// 路由
// ============================================

function handleRoute() {
    const hash = location.hash || '#login';
    const token = sessionStorage.getItem('adminToken');

    if (!token && hash !== '#login') {
        location.hash = '#login';
        return;
    }

    if (hash === '#login') {
        showLogin();
    } else if (hash === '#dashboard') {
        showDashboard();
    } else if (hash.startsWith('#detail/')) {
        const tripCode = hash.replace('#detail/', '');
        showDetail(tripCode);
    }
}

// ============================================
// 登入
// ============================================

async function login() {
    const gasUrl = document.getElementById('adminGasUrl').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!gasUrl) {
        errorDiv.textContent = '請輸入 GAS Web App URL';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (!password) {
        errorDiv.textContent = '請輸入密碼';
        errorDiv.classList.remove('hidden');
        return;
    }

    errorDiv.classList.add('hidden');

    try {
        api = new TravelAPI(gasUrl);
        const result = await api.adminLogin(password);

        if (result.success) {
            localStorage.setItem('adminGasUrl', gasUrl);
            sessionStorage.setItem('adminToken', result.token);
            location.hash = '#dashboard';
        } else {
            errorDiv.textContent = result.error || '登入失敗';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = '連線失敗：' + error.message;
        errorDiv.classList.remove('hidden');
    }
}

function logout() {
    sessionStorage.removeItem('adminToken');
    api = null;
    location.hash = '#login';
}

// ============================================
// 頁面切換
// ============================================

function showLogin() {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('detailPage').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');
    document.getElementById('detailPage').classList.add('hidden');
    loadTrips();
}

function showDetail(tripCode) {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('detailPage').classList.remove('hidden');
    currentTripCode = tripCode;
    loadTripDetail(tripCode);
}

function goBack() {
    location.hash = '#dashboard';
}

// ============================================
// 儀表板 - 申請列表
// ============================================

async function loadTrips() {
    const token = sessionStorage.getItem('adminToken');
    const listDiv = document.getElementById('tripsList');

    try {
        const result = await api.adminGetTrips(token);

        if (result.authError) {
            logout();
            return;
        }

        if (result.success) {
            currentTrips = result.trips;
            renderTrips();
        } else {
            listDiv.innerHTML = `<div class="text-center py-12 text-red-500">${result.error}</div>`;
        }
    } catch (error) {
        listDiv.innerHTML = `<div class="text-center py-12 text-red-500">載入失敗：${error.message}</div>`;
    }
}

function filterTrips(filter) {
    currentFilter = filter;

    // 更新篩選按鈕樣式
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.className = 'filter-btn px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap bg-blue-600 text-white';
        } else {
            btn.className = 'filter-btn px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap bg-gray-200 text-gray-700';
        }
    });

    renderTrips();
}

function renderTrips() {
    const listDiv = document.getElementById('tripsList');
    let trips = currentTrips;

    if (currentFilter !== 'all') {
        trips = trips.filter(t => t.status === currentFilter);
    }

    const subtitle = document.getElementById('dashboardSubtitle');
    subtitle.textContent = `${trips.length} 筆申請`;

    if (trips.length === 0) {
        listDiv.innerHTML = '<div class="text-center py-12 text-gray-400">暫無申請記錄</div>';
        return;
    }

    listDiv.innerHTML = trips.map(trip => {
        const status = getStatusInfo(trip.status);
        return `
            <div class="bg-white rounded-xl p-4 shadow cursor-pointer hover:shadow-md transition" onclick="location.hash='#detail/${trip.tripCode}'">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="font-bold text-gray-800">${trip.location || '未設定地點'}</p>
                        <p class="text-sm text-gray-500">${trip.startDate || ''} ~ ${trip.endDate || ''}</p>
                    </div>
                    <span class="status-badge bg-${status.color}-100 text-${status.color}-800">${status.icon} ${status.label}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                    <div class="text-gray-600">
                        <span class="font-medium">${trip.submittedBy || '未知'}</span>
                        <span class="text-gray-400 ml-2">${trip.submittedDate || ''}</span>
                    </div>
                    <span class="text-gray-400 font-mono text-xs">${trip.tripCode}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// 詳情頁
// ============================================

async function loadTripDetail(tripCode) {
    const token = sessionStorage.getItem('adminToken');
    const contentDiv = document.getElementById('detailContent');

    document.getElementById('detailTripCode').textContent = tripCode;

    try {
        const result = await api.adminGetTripDetail(token, tripCode);

        if (result.authError) {
            logout();
            return;
        }

        if (result.success) {
            renderTripDetail(result);
        } else {
            contentDiv.innerHTML = `<div class="text-center py-12 text-red-500">${result.error}</div>`;
        }
    } catch (error) {
        contentDiv.innerHTML = `<div class="text-center py-12 text-red-500">載入失敗：${error.message}</div>`;
    }
}

function renderTripDetail(data) {
    const contentDiv = document.getElementById('detailContent');
    const trip = data.trip;
    const expenses = data.expenses;
    const employees = data.employees;
    const status = getStatusInfo(trip.status);

    document.getElementById('detailTitle').textContent = trip.location || '申請詳情';

    let totalNTD = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    expenses.forEach(e => {
        totalNTD += (Number(e.amountNTD) || 0);
        if (e.expenseStatus === 'approved') approvedCount++;
        if (e.expenseStatus === 'pending') pendingCount++;
    });

    let html = `
        <!-- 狀態卡 -->
        <div class="bg-${status.color}-50 border border-${status.color}-200 rounded-xl p-4 mb-4">
            <div class="flex items-center gap-2 mb-1">
                <span class="text-2xl">${status.icon}</span>
                <span class="font-bold text-${status.color}-800 text-lg">${status.label}</span>
            </div>
            ${trip.reviewNote ? `<p class="text-sm text-${status.color}-700 mt-1">備註：${trip.reviewNote}</p>` : ''}
            ${trip.reviewDate ? `<p class="text-xs text-${status.color}-600 mt-1">審核日期：${trip.reviewDate}</p>` : ''}
        </div>

        <!-- 旅遊資訊 -->
        <div class="bg-white rounded-xl p-4 mb-4 shadow">
            <h3 class="font-bold text-gray-800 mb-3">旅遊資訊</h3>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-gray-500">地點</span><span class="font-medium">${trip.location}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">日期</span><span class="font-medium">${trip.startDate} ~ ${trip.endDate}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">補助額度</span><span class="font-medium">NT$ ${Number(trip.subsidyAmount).toLocaleString()}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">付款方式</span><span class="font-medium">${trip.paymentMethod}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">補助方式</span><span class="font-medium">${trip.subsidyMethod}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">提交人</span><span class="font-medium">${trip.submittedBy}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">提交日期</span><span class="font-medium">${trip.submittedDate}</span></div>
            </div>
        </div>

        <!-- 員工名單 -->
        ${employees.length > 0 ? `
        <div class="bg-white rounded-xl p-4 mb-4 shadow">
            <h3 class="font-bold text-gray-800 mb-3">員工名單 (${employees.length} 人)</h3>
            <div class="space-y-2">
                ${employees.map(emp => `
                    <div class="flex justify-between items-center text-sm p-2 bg-gray-50 rounded-lg">
                        <span class="font-medium">${emp.name}</span>
                        <span class="text-gray-500">${emp.department || ''}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <!-- 費用明細（逐筆審核） -->
        <div class="bg-white rounded-xl p-4 mb-4 shadow">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-bold text-gray-800">費用明細 (${expenses.length} 筆，合計 NT$ ${totalNTD.toLocaleString()})</h3>
            </div>
            <!-- 審核進度摘要 -->
            <div class="flex items-center gap-2 mb-3 text-sm">
                <span class="px-2 py-1 rounded-full bg-green-100 text-green-700">已通過 ${approvedCount}</span>
                <span class="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">待審 ${pendingCount}</span>
                <span class="px-2 py-1 rounded-full bg-gray-100 text-gray-600">共 ${expenses.length} 筆</span>
            </div>
            ${pendingCount > 0 ? `
            <button onclick="approveAllExpenses('${trip.tripCode}')" class="w-full mb-3 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition">
                全部通過 (${pendingCount} 筆待審)
            </button>
            ` : ''}
            <div class="space-y-3">
                ${expenses.map(exp => {
                    const expStatus = getExpenseStatusInfo(exp.expenseStatus);
                    return `
                    <div class="border border-gray-100 rounded-lg p-3" id="exp-card-${exp.expenseId}">
                        <div class="flex justify-between items-start mb-1">
                            <div class="flex items-center gap-2">
                                <span class="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">${exp.category}</span>
                                <span class="text-xs text-gray-400">${exp.date}</span>
                                <span class="text-xs px-2 py-1 rounded-full bg-${expStatus.color}-100 text-${expStatus.color}-700 font-medium">${expStatus.icon} ${expStatus.label}</span>
                            </div>
                            <span class="font-bold text-gray-800">NT$ ${Number(exp.amountNTD).toLocaleString()}</span>
                        </div>
                        <p class="text-sm text-gray-700 mt-1">${exp.description}</p>
                        <div class="flex justify-between items-center mt-1">
                            <span class="text-xs text-gray-400">${exp.employeeName} | ${exp.currency} ${exp.amount} x ${exp.exchangeRate}</span>
                            ${exp.photoFileId ? `<button onclick="viewPhoto('${exp.photoFileId}')" class="text-xs text-blue-600 hover:text-blue-800 font-medium">查看單據</button>` : '<span class="text-xs text-gray-300">無照片</span>'}
                        </div>
                        ${exp.expenseReviewNote ? `<p class="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded">審核備註：${exp.expenseReviewNote}</p>` : ''}
                        <!-- 逐筆審核按鈕 -->
                        <div class="flex gap-2 mt-2">
                            <button onclick="reviewExpense('${trip.tripCode}', '${exp.expenseId}', 'approved', '')" class="flex-1 py-1.5 rounded text-xs font-semibold ${exp.expenseStatus === 'approved' ? 'bg-green-200 text-green-800' : 'bg-green-50 text-green-700 hover:bg-green-100'} transition">
                                通過
                            </button>
                            <button onclick="reviewExpense('${trip.tripCode}', '${exp.expenseId}', 'rejected', '')" class="flex-1 py-1.5 rounded text-xs font-semibold ${exp.expenseStatus === 'rejected' ? 'bg-red-200 text-red-800' : 'bg-red-50 text-red-700 hover:bg-red-100'} transition">
                                退回
                            </button>
                            <button onclick="showExpenseNoteInput('${trip.tripCode}', '${exp.expenseId}')" class="flex-1 py-1.5 rounded text-xs font-semibold ${exp.expenseStatus === 'needs_revision' ? 'bg-orange-200 text-orange-800' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'} transition">
                                備註
                            </button>
                        </div>
                        <!-- 備註輸入區（預設隱藏） -->
                        <div id="note-input-${exp.expenseId}" class="hidden mt-2">
                            <textarea id="note-text-${exp.expenseId}" rows="2" class="w-full border border-gray-200 rounded-lg p-2 text-sm" placeholder="輸入審核備註..."></textarea>
                            <button onclick="submitExpenseNote('${trip.tripCode}', '${exp.expenseId}')" class="mt-1 w-full py-1.5 rounded text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">
                                送出備註（需補件）
                            </button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>

        <!-- Trip 整體審核操作（保留） -->
        <div class="bg-white rounded-xl p-4 mb-4 shadow">
            <h3 class="font-bold text-gray-800 mb-3">整體審核（覆蓋）</h3>
            <p class="text-xs text-gray-500 mb-3">此操作會直接設定 Trip 狀態，不影響逐筆費用狀態</p>
            <div class="grid grid-cols-3 gap-3">
                <button onclick="showReviewModal('${trip.tripCode}', 'approved')" class="py-3 rounded-lg font-semibold text-sm bg-green-500 text-white hover:bg-green-600 transition">
                    通過
                </button>
                <button onclick="showReviewModal('${trip.tripCode}', 'rejected')" class="py-3 rounded-lg font-semibold text-sm bg-red-500 text-white hover:bg-red-600 transition">
                    退回
                </button>
                <button onclick="showReviewModal('${trip.tripCode}', 'needs_revision')" class="py-3 rounded-lg font-semibold text-sm bg-orange-500 text-white hover:bg-orange-600 transition">
                    補件
                </button>
            </div>
        </div>
    `;

    contentDiv.innerHTML = html;
}

// ============================================
// 照片檢視
// ============================================

async function viewPhoto(fileId) {
    const modal = document.getElementById('photoModal');
    const img = document.getElementById('photoModalImg');
    const loading = document.getElementById('photoModalLoading');

    modal.classList.add('active');
    img.style.display = 'none';
    loading.style.display = 'block';

    try {
        const token = sessionStorage.getItem('adminToken');
        const result = await api.adminGetPhoto(token, fileId);

        if (result.authError) {
            logout();
            return;
        }

        if (result.success) {
            img.src = result.photo;
            img.style.display = 'block';
            loading.style.display = 'none';
        } else {
            loading.textContent = '載入失敗：' + result.error;
        }
    } catch (error) {
        loading.textContent = '載入失敗：' + error.message;
    }
}

function closePhotoModal(event) {
    if (event.target === document.getElementById('photoModal')) {
        document.getElementById('photoModal').classList.remove('active');
    }
}

// ============================================
// 審核操作
// ============================================

function showReviewModal(tripCode, action) {
    const modal = document.getElementById('reviewModal');
    const title = document.getElementById('reviewModalTitle');
    const btn = document.getElementById('reviewSubmitBtn');

    document.getElementById('reviewTripCode').value = tripCode;
    document.getElementById('reviewAction').value = action;
    document.getElementById('reviewNote').value = '';

    const actionMap = {
        'approved': { label: '確認通過', color: 'bg-green-500 hover:bg-green-600' },
        'rejected': { label: '確認退回', color: 'bg-red-500 hover:bg-red-600' },
        'needs_revision': { label: '確認需補件', color: 'bg-orange-500 hover:bg-orange-600' }
    };

    const info = actionMap[action];
    title.textContent = info.label;
    btn.textContent = info.label;
    btn.className = `w-full py-3 rounded-lg font-semibold text-white transition ${info.color}`;

    modal.classList.add('active');
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
}

async function submitReview() {
    const tripCode = document.getElementById('reviewTripCode').value;
    const action = document.getElementById('reviewAction').value;
    const note = document.getElementById('reviewNote').value.trim();
    const token = sessionStorage.getItem('adminToken');

    try {
        const result = await api.adminReview(token, tripCode, action, note);

        if (result.authError) {
            logout();
            return;
        }

        if (result.success) {
            closeReviewModal();
            // 重新載入詳情
            loadTripDetail(tripCode);
            showToast('✓ 審核操作完成');
        } else {
            alert('審核失敗：' + result.error);
        }
    } catch (error) {
        alert('審核失敗：' + error.message);
    }
}

// ============================================
// 逐筆費用審核
// ============================================

async function reviewExpense(tripCode, expenseId, action, note) {
    const token = sessionStorage.getItem('adminToken');
    try {
        const result = await api.adminReviewExpense(token, tripCode, expenseId, action, note);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast('費用審核完成');
            loadTripDetail(tripCode);
        } else {
            alert('審核失敗：' + result.error);
        }
    } catch (error) {
        alert('審核失敗：' + error.message);
    }
}

function showExpenseNoteInput(tripCode, expenseId) {
    const noteDiv = document.getElementById('note-input-' + expenseId);
    if (noteDiv) {
        noteDiv.classList.toggle('hidden');
        if (!noteDiv.classList.contains('hidden')) {
            document.getElementById('note-text-' + expenseId).focus();
        }
    }
}

async function submitExpenseNote(tripCode, expenseId) {
    const noteText = document.getElementById('note-text-' + expenseId).value.trim();
    if (!noteText) {
        alert('請輸入備註');
        return;
    }
    await reviewExpense(tripCode, expenseId, 'needs_revision', noteText);
}

async function approveAllExpenses(tripCode) {
    if (!confirm('確定要通過所有待審費用嗎？')) return;

    const token = sessionStorage.getItem('adminToken');
    try {
        // 先取得最新的費用列表
        const detail = await api.adminGetTripDetail(token, tripCode);
        if (detail.authError) { logout(); return; }
        if (!detail.success) { alert(detail.error); return; }

        const pendingExpenses = detail.expenses.filter(e => e.expenseStatus === 'pending');
        if (pendingExpenses.length === 0) {
            showToast('沒有待審費用');
            return;
        }

        const reviews = pendingExpenses.map(e => ({
            expenseId: e.expenseId,
            reviewAction: 'approved',
            note: ''
        }));

        const result = await api.adminBatchReviewExpenses(token, tripCode, reviews);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast(result.message);
            loadTripDetail(tripCode);
        } else {
            alert('批次審核失敗：' + result.error);
        }
    } catch (error) {
        alert('批次審核失敗：' + error.message);
    }
}

// ============================================
// 工具函式
// ============================================

function getExpenseStatusInfo(status) {
    const map = {
        'pending': { label: '待審', color: 'yellow', icon: '' },
        'approved': { label: '通過', color: 'green', icon: '' },
        'rejected': { label: '退回', color: 'red', icon: '' },
        'needs_revision': { label: '補件', color: 'orange', icon: '' }
    };
    return map[status] || { label: status || '待審', color: 'gray', icon: '' };
}

function getStatusInfo(status) {
    const map = {
        'pending': { label: '待審核', color: 'yellow', icon: '⏳' },
        'approved': { label: '已通過', color: 'green', icon: '✅' },
        'rejected': { label: '已退回', color: 'red', icon: '❌' },
        'needs_revision': { label: '需補件', color: 'orange', icon: '📝' }
    };
    return map[status] || { label: status || '未知', color: 'gray', icon: '❓' };
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg z-[9999] text-sm font-medium';
    toast.style.animation = 'slideDown 0.3s ease';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideUpOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 動畫樣式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from { transform: translate(-50%, -100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes slideUpOut {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, -100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 註冊 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Admin SW registered:', reg.scope))
            .catch(err => console.log('Admin SW registration failed:', err));
    });
}
