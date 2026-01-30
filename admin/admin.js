// 旅遊費用審核後台 - JavaScript

let api = null;
let currentTrips = [];
let currentFilter = 'all';
let currentTripCode = null;
let currentAdminTab = 'dashboard';
let sidebarCollapsed = false;

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
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
    document.getElementById('loginPage').classList.add('w-full');
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('md:flex');
    document.getElementById('mobileHeader').classList.add('hidden');
    document.getElementById('mobileHeader').classList.remove('flex');
    document.getElementById('mainContent').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('sidebar').classList.add('md:flex');
    document.getElementById('mobileHeader').classList.remove('hidden');
    document.getElementById('mobileHeader').classList.add('flex');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('flex');

    // Fill in settings GAS URL
    const settingsGasUrl = document.getElementById('settingsGasUrl');
    if (settingsGasUrl) settingsGasUrl.value = localStorage.getItem('adminGasUrl') || '';

    // Show dashboard tab and hide detail
    switchAdminTab('dashboard');
    document.getElementById('detailPage').classList.add('hidden');
    loadTrips();
}

function showDetail(tripCode) {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('sidebar').classList.add('md:flex');
    document.getElementById('mobileHeader').classList.remove('hidden');
    document.getElementById('mobileHeader').classList.add('flex');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('flex');

    // Hide all tab content, show detail
    hideAllTabContent();
    document.getElementById('detailPage').classList.remove('hidden');

    // Update toolbar
    document.getElementById('pageTitle').textContent = '申請詳情';

    currentTripCode = tripCode;
    loadTripDetail(tripCode);
}

function goBack() {
    location.hash = '#dashboard';
}

// ============================================
// Sidebar & Tab Navigation
// ============================================

function switchAdminTab(tab) {
    currentAdminTab = tab;

    // Hide detail page
    document.getElementById('detailPage').classList.add('hidden');

    // Update page title
    const titles = {
        dashboard: '儀表板',
        expenses: '費用審核',
        members: '團員管理',
        settings: '設定'
    };
    document.getElementById('pageTitle').textContent = titles[tab] || tab;

    // Toggle tab content visibility
    hideAllTabContent();
    if (tab === 'dashboard' || tab === 'expenses') {
        document.getElementById('dashboardPage').classList.remove('hidden');
    } else if (tab === 'members') {
        document.getElementById('membersPage').classList.remove('hidden');
    } else if (tab === 'settings') {
        document.getElementById('settingsPage').classList.remove('hidden');
    }

    // Update sidebar menu active state
    document.querySelectorAll('.admin-menu-item').forEach(item => {
        const itemTab = item.dataset.tab;
        const indicator = item.querySelector('.active-indicator');
        if (itemTab === tab) {
            item.className = 'admin-menu-item flex items-center gap-4 px-6 py-3 transition-colors bg-indigo-600 text-white relative';
            if (!indicator) {
                const div = document.createElement('div');
                div.className = 'active-indicator absolute left-0 top-0 bottom-0 w-1 bg-indigo-300';
                item.appendChild(div);
            }
        } else {
            item.className = 'admin-menu-item flex items-center gap-4 px-6 py-3 transition-colors text-slate-400 hover:bg-slate-700 hover:text-white relative';
            if (indicator) indicator.remove();
        }
        item.dataset.tab = itemTab;
    });
}

function hideAllTabContent() {
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('detailPage').classList.add('hidden');
    document.getElementById('membersPage').classList.add('hidden');
    document.getElementById('settingsPage').classList.add('hidden');
}

function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebarToggleIcon');
    const logoFull = document.getElementById('sidebarLogoFull');
    const logoCollapsed = document.getElementById('sidebarLogoCollapsed');

    if (sidebarCollapsed) {
        sidebar.classList.remove('w-64');
        sidebar.classList.add('w-20');
        icon.classList.remove('fa-chevron-left');
        icon.classList.add('fa-chevron-right');
        logoFull.classList.add('hidden');
        logoCollapsed.classList.remove('hidden');
        // Hide text labels
        document.querySelectorAll('.menu-label, .user-info').forEach(el => el.classList.add('hidden'));
    } else {
        sidebar.classList.remove('w-20');
        sidebar.classList.add('w-64');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-left');
        logoFull.classList.remove('hidden');
        logoCollapsed.classList.add('hidden');
        document.querySelectorAll('.menu-label, .user-info').forEach(el => el.classList.remove('hidden'));
    }
}

function toggleMobileMenu() {
    const overlay = document.getElementById('mobileMenuOverlay');
    overlay.classList.toggle('hidden');
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
            updateDashboardStats();
            renderTrips();
        } else {
            listDiv.innerHTML = `<div class="text-center py-12 text-red-500 col-span-full"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p>${result.error}</p></div>`;
        }
    } catch (error) {
        listDiv.innerHTML = `<div class="text-center py-12 text-red-500 col-span-full"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p>載入失敗：${error.message}</p></div>`;
    }
}

function updateDashboardStats() {
    const pending = currentTrips.filter(t => t.status === 'pending').length;
    const locked = currentTrips.filter(t => t.isLocked).length;

    document.getElementById('statPendingCount').textContent = pending;
    document.getElementById('statTripCount').textContent = currentTrips.length;
    document.getElementById('statTripSub').textContent = `共 ${currentTrips.length} 件申請`;
    document.getElementById('statLockedCount').textContent = locked;
}

function filterTrips(filter) {
    currentFilter = filter;
    renderTrips();
}

function renderTrips() {
    const listDiv = document.getElementById('tripsList');
    let trips = currentTrips;
    const searchTerm = (document.getElementById('tripSearchInput')?.value || '').toLowerCase();

    // Apply filter
    if (currentFilter !== 'all') {
        trips = trips.filter(t => t.status === currentFilter);
    }

    // Apply search
    if (searchTerm) {
        trips = trips.filter(t =>
            (t.location || '').toLowerCase().includes(searchTerm) ||
            (t.submittedBy || '').toLowerCase().includes(searchTerm) ||
            (t.tripCode || '').toLowerCase().includes(searchTerm)
        );
    }

    // Update count label
    const countLabel = document.getElementById('tripCountLabel');
    if (countLabel) countLabel.textContent = `${trips.length} 筆申請`;

    if (trips.length === 0) {
        listDiv.innerHTML = `<div class="text-center py-12 text-gray-400 col-span-full">
            <i class="fa-solid fa-inbox text-4xl mb-3 opacity-30"></i>
            <p class="text-sm">暫無申請記錄</p>
        </div>`;
        return;
    }

    listDiv.innerHTML = trips.map(trip => {
        const status = getStatusInfo(trip.status);
        const lockIcon = trip.isLocked ? '<i class="fa-solid fa-lock text-gray-500 ml-1"></i>' : '';
        return `
            <div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition cursor-pointer group" onclick="location.hash='#detail/${trip.tripCode}'">
                <div class="p-4">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                ${(trip.submittedBy || '?').charAt(0)}
                            </div>
                            <div>
                                <div class="font-bold text-gray-900 text-sm">${trip.location || '未設定地點'} ${lockIcon}</div>
                                <div class="text-xs text-gray-400">${trip.submittedBy || '未知'} · ${trip.submittedDate || ''}</div>
                            </div>
                        </div>
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-${status.color}-100 text-${status.color}-700">
                            <i class="fa-solid ${status.faIcon}"></i> ${status.label}
                        </span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-gray-500">
                        <span><i class="fa-regular fa-calendar mr-1"></i>${trip.startDate || ''} ~ ${trip.endDate || ''}</span>
                        <span class="font-mono text-gray-400">${trip.tripCode}</span>
                    </div>
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

    // Update toolbar trip code
    const pageTripCode = document.getElementById('pageTripCode');
    if (pageTripCode) pageTripCode.innerHTML = `Trip Code: <span class="font-mono font-bold text-indigo-600 bg-indigo-50 px-1 rounded">${tripCode}</span>`;

    try {
        const result = await api.adminGetTripDetail(token, tripCode);

        if (result.authError) {
            logout();
            return;
        }

        if (result.success) {
            renderTripDetail(result);
        } else {
            contentDiv.innerHTML = `<div class="text-center py-12 text-red-500"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p>${result.error}</p></div>`;
        }
    } catch (error) {
        contentDiv.innerHTML = `<div class="text-center py-12 text-red-500"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p>載入失敗：${error.message}</p></div>`;
    }
}

function renderTripDetail(data) {
    const contentDiv = document.getElementById('detailContent');
    const trip = data.trip;
    const expenses = data.expenses;
    const employees = data.employees;
    const status = getStatusInfo(trip.status);

    document.getElementById('pageTitle').textContent = trip.location || '申請詳情';

    // Update lock status badge
    const lockBadge = document.getElementById('lockStatusBadge');
    if (lockBadge) {
        if (trip.isLocked) {
            lockBadge.innerHTML = '<div class="w-2 h-2 rounded-full bg-red-500"></div><span>已結案</span>';
            lockBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-xs font-bold border border-red-200 text-red-700';
        } else {
            lockBadge.innerHTML = '<div class="w-2 h-2 rounded-full bg-green-500"></div><span>進行中</span>';
            lockBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-xs font-bold border border-green-200 text-green-700';
        }
    }

    let totalNTD = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    expenses.forEach(e => {
        totalNTD += (Number(e.amountNTD) || 0);
        if (e.expenseStatus === 'approved') approvedCount++;
        if (e.expenseStatus === 'pending') pendingCount++;
    });

    let html = `
        <!-- Status + Trip Info (2-column on desktop) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- 狀態卡 -->
            <div class="bg-${status.color}-50 border border-${status.color}-200 rounded-xl p-5">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-10 h-10 rounded-full bg-${status.color}-100 flex items-center justify-center">
                        <i class="fa-solid ${status.faIcon} text-${status.color}-600"></i>
                    </div>
                    <div>
                        <span class="font-bold text-${status.color}-800 text-lg">${status.label}</span>
                        ${trip.reviewDate ? `<p class="text-xs text-${status.color}-600">審核日期：${trip.reviewDate}</p>` : ''}
                    </div>
                </div>
                ${trip.reviewNote ? `<p class="text-sm text-${status.color}-700 mt-2 bg-white/50 p-3 rounded-lg"><i class="fa-solid fa-comment-dots mr-1"></i>${trip.reviewNote}</p>` : ''}
            </div>

            <!-- 旅遊資訊 -->
            <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <h3 class="font-bold text-gray-800 mb-3 text-sm"><i class="fa-solid fa-plane mr-2 text-indigo-500"></i>旅遊資訊</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between"><span class="text-gray-500">地點</span><span class="font-medium">${trip.location}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">日期</span><span class="font-medium">${trip.startDate} ~ ${trip.endDate}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">補助額度</span><span class="font-medium">NT$ ${Number(trip.subsidyAmount).toLocaleString()}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">付款方式</span><span class="font-medium">${trip.paymentMethod}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">提交人</span><span class="font-medium">${trip.submittedBy}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">提交日期</span><span class="font-medium">${trip.submittedDate}</span></div>
                </div>
            </div>
        </div>

        <!-- 員工名單 -->
        ${employees.length > 0 ? `
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h3 class="font-bold text-gray-800 mb-3 text-sm"><i class="fa-solid fa-users mr-2 text-indigo-500"></i>員工名單 (${employees.length} 人)</h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                ${employees.map(emp => `
                    <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <div class="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">${emp.name.charAt(0)}</div>
                        <span class="text-sm font-medium">${emp.name}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <!-- 費用明細（逐筆審核） -->
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
                <h3 class="font-bold text-gray-800 text-sm"><i class="fa-solid fa-receipt mr-2 text-indigo-500"></i>費用明細 (${expenses.length} 筆)</h3>
                <div class="flex items-center gap-2 text-xs flex-wrap">
                    <span class="px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium"><i class="fa-solid fa-check mr-1"></i>已通過 ${approvedCount}</span>
                    <span class="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium"><i class="fa-solid fa-hourglass mr-1"></i>待審 ${pendingCount}</span>
                    <span class="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">合計 NT$ ${totalNTD.toLocaleString()}</span>
                </div>
            </div>
            ${pendingCount > 0 ? `
            <button onclick="approveAllExpenses('${trip.tripCode}')" class="w-full mb-4 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition shadow-sm">
                <i class="fa-solid fa-check-double mr-1"></i> 全部通過 (${pendingCount} 筆待審)
            </button>
            ` : ''}
            <div class="space-y-3">
                ${expenses.map(exp => {
        const expStatus = getExpenseStatusInfo(exp.expenseStatus);
        const catIcon = getCategoryIcon(exp.category);
        return `
                    <div class="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 transition" id="exp-card-${exp.expenseId}">
                        <div class="flex items-start gap-3">
                            <div class="w-9 h-9 ${catIcon.bg} rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid ${catIcon.icon} ${catIcon.text} text-sm"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <span class="font-semibold text-sm text-gray-800">${exp.description}</span>
                                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-${expStatus.color}-100 text-${expStatus.color}-700 font-medium">
                                                <i class="fa-solid ${expStatus.faIcon} mr-0.5"></i>${expStatus.label}
                                            </span>
                                        </div>
                                        <div class="text-xs text-gray-400 mt-0.5">${exp.employeeName} · ${exp.category} · ${exp.date}</div>
                                    </div>
                                    <span class="font-bold text-gray-800 text-sm ml-2 whitespace-nowrap">NT$ ${Number(exp.amountNTD).toLocaleString()}</span>
                                </div>
                                <div class="flex items-center justify-between mt-1">
                                    <span class="text-[10px] text-gray-400">${exp.currency} ${exp.amount} × ${exp.exchangeRate}</span>
                                    ${exp.photoFileId ? `<button onclick="viewPhoto('${exp.photoFileId}')" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"><i class="fa-solid fa-image mr-1"></i>查看單據</button>` : '<span class="text-[10px] text-gray-300">無照片</span>'}
                                </div>
                                ${exp.expenseReviewNote ? `<p class="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded-lg"><i class="fa-solid fa-comment-dots mr-1"></i>${exp.expenseReviewNote}</p>` : ''}
                                <!-- 逐筆審核按鈕 -->
                                <div class="flex gap-2 mt-3">
                                    <button onclick="reviewExpense('${trip.tripCode}', '${exp.expenseId}', 'approved', '')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold ${exp.expenseStatus === 'approved' ? 'bg-green-200 text-green-800' : 'bg-green-50 text-green-700 hover:bg-green-100'} transition">
                                        <i class="fa-solid fa-check mr-1"></i>通過
                                    </button>
                                    <button onclick="reviewExpense('${trip.tripCode}', '${exp.expenseId}', 'rejected', '')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold ${exp.expenseStatus === 'rejected' ? 'bg-red-200 text-red-800' : 'bg-red-50 text-red-700 hover:bg-red-100'} transition">
                                        <i class="fa-solid fa-xmark mr-1"></i>退回
                                    </button>
                                    <button onclick="showExpenseNoteInput('${trip.tripCode}', '${exp.expenseId}')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold ${exp.expenseStatus === 'needs_revision' ? 'bg-orange-200 text-orange-800' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'} transition">
                                        <i class="fa-solid fa-pen mr-1"></i>備註
                                    </button>
                                </div>
                                <!-- 備註輸入區（預設隱藏） -->
                                <div id="note-input-${exp.expenseId}" class="hidden mt-2">
                                    <textarea id="note-text-${exp.expenseId}" rows="2" class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-indigo-500" placeholder="輸入審核備註..."></textarea>
                                    <button onclick="submitExpenseNote('${trip.tripCode}', '${exp.expenseId}')" class="mt-1 w-full py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">
                                        <i class="fa-solid fa-paper-plane mr-1"></i>送出備註（需補件）
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    `;
    }).join('')}
            </div>
        </div>

        <!-- Trip 整體審核操作 -->
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h3 class="font-bold text-gray-800 mb-1 text-sm"><i class="fa-solid fa-gavel mr-2 text-indigo-500"></i>整體審核（覆蓋）</h3>
            <p class="text-xs text-gray-400 mb-4">此操作會直接設定 Trip 狀態，不影響逐筆費用狀態</p>
            <div class="grid grid-cols-3 gap-3">
                <button onclick="showReviewModal('${trip.tripCode}', 'approved')" class="py-3 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition shadow-sm">
                    <i class="fa-solid fa-check mr-1"></i> 通過
                </button>
                <button onclick="showReviewModal('${trip.tripCode}', 'rejected')" class="py-3 rounded-xl font-semibold text-sm bg-red-500 text-white hover:bg-red-600 transition shadow-sm">
                    <i class="fa-solid fa-xmark mr-1"></i> 退回
                </button>
                <button onclick="showReviewModal('${trip.tripCode}', 'needs_revision')" class="py-3 rounded-xl font-semibold text-sm bg-orange-500 text-white hover:bg-orange-600 transition shadow-sm">
                    <i class="fa-solid fa-pen mr-1"></i> 補件
                </button>
            </div>
        </div>

        <!-- 鎖定管理 -->
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h3 class="font-bold text-gray-800 mb-1 text-sm"><i class="fa-solid fa-lock mr-2 text-indigo-500"></i>鎖定管理</h3>
            <p class="text-xs text-gray-400 mb-4">鎖定後，團員將無法再上傳/更新此案件</p>
            <div class="flex items-center justify-between p-4 ${trip.isLocked ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} rounded-xl border mb-3">
                <div>
                    <p class="font-medium text-sm ${trip.isLocked ? 'text-red-800' : 'text-green-800'}">
                        <i class="fa-solid ${trip.isLocked ? 'fa-lock' : 'fa-lock-open'} mr-1"></i>
                        ${trip.isLocked ? '案件已鎖定' : '案件未鎖定'}
                    </p>
                    <p class="text-xs ${trip.isLocked ? 'text-red-600' : 'text-green-600'}">
                        ${trip.isLocked ? '團員目前無法上傳更新' : '團員可自由上傳更新'}
                    </p>
                </div>
            </div>
            ${trip.isLocked ? `
                <button onclick="unlockTrip('${trip.tripCode}')" class="w-full py-3 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition shadow-sm">
                    <i class="fa-solid fa-lock-open mr-1"></i> 解除鎖定
                </button>
            ` : `
                <button onclick="lockTrip('${trip.tripCode}')" class="w-full py-3 rounded-xl font-semibold text-sm bg-gray-700 text-white hover:bg-gray-800 transition shadow-sm">
                    <i class="fa-solid fa-lock mr-1"></i> 鎖定案件
                </button>
            `}
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
            loading.innerHTML = `<i class="fa-solid fa-circle-exclamation text-red-400 text-2xl mb-2"></i><p class="text-sm">載入失敗：${result.error}</p>`;
        }
    } catch (error) {
        loading.innerHTML = `<i class="fa-solid fa-circle-exclamation text-red-400 text-2xl mb-2"></i><p class="text-sm">載入失敗：${error.message}</p>`;
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
        'approved': { label: '確認通過', color: 'bg-green-600 hover:bg-green-700' },
        'rejected': { label: '確認退回', color: 'bg-red-500 hover:bg-red-600' },
        'needs_revision': { label: '確認需補件', color: 'bg-orange-500 hover:bg-orange-600' }
    };

    const info = actionMap[action];
    title.textContent = info.label;
    btn.textContent = info.label;
    btn.className = `w-full py-3 rounded-xl font-semibold text-white transition ${info.color}`;

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
            loadTripDetail(tripCode);
            showToast('審核操作完成', 'success');
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
            showToast('費用審核完成', 'success');
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
        const detail = await api.adminGetTripDetail(token, tripCode);
        if (detail.authError) { logout(); return; }
        if (!detail.success) { alert(detail.error); return; }

        const pendingExpenses = detail.expenses.filter(e => e.expenseStatus === 'pending');
        if (pendingExpenses.length === 0) {
            showToast('沒有待審費用', 'info');
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
            showToast(result.message || '批次審核完成', 'success');
            loadTripDetail(tripCode);
        } else {
            alert('批次審核失敗：' + result.error);
        }
    } catch (error) {
        alert('批次審核失敗：' + error.message);
    }
}

// ============================================
// 鎖定/解鎖操作
// ============================================

async function lockTrip(tripCode) {
    if (!confirm('確定要鎖定此案件嗎？\n\n鎖定後團員將無法上傳/更新費用。')) return;

    const token = sessionStorage.getItem('adminToken');
    try {
        const result = await api.adminLockTrip(token, tripCode);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast('案件已鎖定', 'success');
            loadTripDetail(tripCode);
            loadTrips();
        } else {
            alert('鎖定失敗：' + result.error);
        }
    } catch (error) {
        alert('鎖定失敗：' + error.message);
    }
}

async function unlockTrip(tripCode) {
    if (!confirm('確定要解鎖此案件嗎？\n\n解鎖後團員可繼續上傳/更新費用。')) return;

    const token = sessionStorage.getItem('adminToken');
    try {
        const result = await api.adminUnlockTrip(token, tripCode);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast('案件已解鎖', 'success');
            loadTripDetail(tripCode);
            loadTrips();
        } else {
            alert('解鎖失敗：' + result.error);
        }
    } catch (error) {
        alert('解鎖失敗：' + error.message);
    }
}

// ============================================
// 工具函式
// ============================================

function getCategoryIcon(category) {
    const map = {
        '代收轉付收據': { icon: 'fa-file-invoice', bg: 'bg-blue-100', text: 'text-blue-600' },
        '住宿費': { icon: 'fa-bed', bg: 'bg-purple-100', text: 'text-purple-600' },
        '交通費': { icon: 'fa-car', bg: 'bg-green-100', text: 'text-green-600' },
        '餐費': { icon: 'fa-utensils', bg: 'bg-orange-100', text: 'text-orange-600' },
        '其他費用': { icon: 'fa-tag', bg: 'bg-gray-100', text: 'text-gray-600' }
    };
    return map[category] || { icon: 'fa-tag', bg: 'bg-gray-100', text: 'text-gray-600' };
}

function getExpenseStatusInfo(status) {
    const map = {
        'pending': { label: '待審', color: 'yellow', faIcon: 'fa-hourglass' },
        'approved': { label: '通過', color: 'green', faIcon: 'fa-check' },
        'rejected': { label: '退回', color: 'red', faIcon: 'fa-xmark' },
        'needs_revision': { label: '補件', color: 'orange', faIcon: 'fa-pen' }
    };
    return map[status] || { label: status || '待審', color: 'gray', faIcon: 'fa-question' };
}

function getStatusInfo(status) {
    const map = {
        'pending': { label: '待審核', color: 'yellow', faIcon: 'fa-hourglass' },
        'approved': { label: '已通過', color: 'green', faIcon: 'fa-check' },
        'rejected': { label: '已退回', color: 'red', faIcon: 'fa-xmark' },
        'needs_revision': { label: '需補件', color: 'orange', faIcon: 'fa-pen' }
    };
    return map[status] || { label: status || '未知', color: 'gray', faIcon: 'fa-question' };
}

function showToast(message, type) {
    type = type || 'info';

    const iconMap = {
        success: 'fa-circle-check text-green-500',
        error: 'fa-circle-exclamation text-red-500',
        info: 'fa-circle-info text-indigo-500',
        warning: 'fa-triangle-exclamation text-amber-500'
    };

    const borderMap = {
        success: 'border-l-green-500',
        error: 'border-l-red-500',
        info: 'border-l-indigo-500',
        warning: 'border-l-amber-500'
    };

    // Clean emoji prefix
    const cleanMessage = message.replace(/^[✓⏳⚠❌📝]\s*/, '');

    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto bg-white border-l-4 ${borderMap[type] || borderMap.info} p-4 rounded-lg shadow-lg flex items-center gap-3 min-w-[280px]`;
    toast.style.animation = 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.innerHTML = `
        <i class="fa-solid ${iconMap[type] || iconMap.info} text-lg"></i>
        <div>
            <h4 class="font-bold text-sm text-gray-900">${cleanMessage}</h4>
        </div>
    `;

    if (container) {
        container.appendChild(toast);
    } else {
        toast.classList.add('fixed', 'top-4', 'right-4', 'z-[9999]');
        document.body.appendChild(toast);
    }

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// 註冊 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Admin SW registered:', reg.scope))
            .catch(err => console.log('Admin SW registration failed:', err));
    });
}
