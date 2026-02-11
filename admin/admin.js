// 旅遊費用審核後台 - JavaScript

const DEFAULT_API_URL = 'https://script.google.com/a/macros/hytech.one/s/AKfycbxtXTKtQjia4MvK1ZkCDIz4UdRsX7iMPy7lVZkrOu538yGR4k9qQOQi0SCOCrLjCNYX/exec';

let api = null;
let currentTrips = [];
let currentFilter = 'all';
let currentTripStatusFilter = 'all'; // 團務狀態篩選（全部/Submitted/Open/Closed）
let currentTripCode = null;
let currentAdminTab = 'dashboard';
let sidebarCollapsed = false;

// V2: Leader / sort / filter state
let currentRole = 'auditor'; // 'auditor' | 'leader'
let leaderToken = null;
let leaderName = '';
let leaderTripCode = '';
let currentExpenses = []; // cached for sort/filter
let currentEmployees = []; // cached for filter dropdown
let currentTripData = null; // cached trip detail
let currentTripMembers = []; // V3: cached trip members
let currentEmployeesMaster = []; // V3: cached employee master data
let expenseSortField = 'date';
let expenseSortDir = 'desc';
let expenseFilters = { member: 'all', category: 'all', status: 'all' };

// ============================================
// 角色 UI 控制
// ============================================

function applyRoleUI() {
    document.body.classList.remove('role-leader', 'role-auditor');
    document.body.classList.add('role-' + currentRole);

    // 更新登出按鈕文字
    const logoutBtns = document.querySelectorAll('[onclick="logout()"]');
    logoutBtns.forEach(btn => {
        if (currentRole === 'leader') {
            btn.innerHTML = '<i class="fa-solid fa-arrow-left mr-1"></i> 返回 APP';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-right-from-bracket mr-1"></i> 登出';
        }
    });
}

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    // 載入儲存的 GAS URL，若無則使用預設值
    const savedUrl = localStorage.getItem('adminGasUrl') || DEFAULT_API_URL;
    document.getElementById('adminGasUrl').value = savedUrl;
    if (!localStorage.getItem('adminGasUrl') && DEFAULT_API_URL) {
        localStorage.setItem('adminGasUrl', DEFAULT_API_URL);
    }

    // V2: 解析 URL query params (?tripCode=XXX&role=leader&gasUrl=YYY)
    const urlParams = new URLSearchParams(window.location.search);
    const paramRole = urlParams.get('role');
    const paramTripCode = urlParams.get('tripCode');
    const paramGasUrl = urlParams.get('gasUrl');

    if (paramGasUrl) {
        localStorage.setItem('adminGasUrl', paramGasUrl);
        document.getElementById('adminGasUrl').value = paramGasUrl;
    }

    if (paramRole === 'leader' && paramTripCode) {
        currentRole = 'leader';
        leaderTripCode = paramTripCode;
        const gasUrl = paramGasUrl || localStorage.getItem('adminGasUrl');
        if (gasUrl) {
            api = new TravelAPI(gasUrl);
            localStorage.setItem('adminGasUrl', gasUrl);
        }
        showLeaderLogin(paramTripCode);
        return;
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
    const adminToken = sessionStorage.getItem('adminToken');
    const isAuthenticated = adminToken || leaderToken;

    if (!isAuthenticated && hash !== '#login') {
        location.hash = '#login';
        return;
    }

    if (hash === '#login') {
        showLogin();
    } else if (hash === '#dashboard') {
        if (currentRole === 'leader') {
            // Leader can only see their trip
            showDetail(leaderTripCode);
        } else {
            showDashboard();
        }
    } else if (hash.startsWith('#detail/')) {
        const tripCode = hash.replace('#detail/', '');
        if (currentRole === 'leader' && tripCode !== leaderTripCode) {
            showDetail(leaderTripCode);
        } else {
            showDetail(tripCode);
        }
    }
}

// ============================================
// 登入
// ============================================

async function login() {
    // 審核人員：使用 localStorage 或預設值，不需要輸入 GAS URL
    const gasUrl = localStorage.getItem('adminGasUrl') || DEFAULT_API_URL;
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('loginError');

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
            currentRole = 'auditor';
            applyRoleUI();
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
    if (currentRole === 'leader') {
        // 團長：關閉視窗返回 APP
        window.close();
        // fallback: 如果無法關閉視窗，導向 APP
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 100);
        return;
    }

    // 審核人員：正常登出
    sessionStorage.removeItem('adminToken');
    leaderToken = null;
    leaderName = '';
    currentRole = 'auditor';
    api = null;
    location.hash = '#login';
}

// ============================================
// V2: Leader 登入
// ============================================

function showLeaderLogin(tripCode) {
    // Hide all, show login page with leader UI
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('loginPage').classList.add('w-full');
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('md:flex');
    document.getElementById('mobileHeader').classList.add('hidden');
    document.getElementById('mobileHeader').classList.remove('flex');
    document.getElementById('mainContent').classList.add('hidden');

    // Switch login form to leader mode
    const loginTitle = document.querySelector('#loginPage h1');
    const loginDesc = document.querySelector('#loginPage h1 + p');
    if (loginTitle) loginTitle.textContent = '團長管理登入';
    if (loginDesc) loginDesc.textContent = `旅遊代號：${tripCode}`;

    // Hide GAS URL field (already set)
    const gasUrlField = document.getElementById('adminGasUrl');
    if (gasUrlField) gasUrlField.closest('div').style.display = api ? 'none' : '';

    // Change password label and placeholder
    const pwLabel = document.querySelector('#adminPassword').previousElementSibling;
    if (pwLabel) pwLabel.textContent = '團長密碼';
    const pwInput = document.getElementById('adminPassword');
    pwInput.placeholder = '輸入團長密碼';

    // V3.1.54: 修正 Enter 鍵 race condition - 改為呼叫 leaderLogin()
    pwInput.setAttribute('onkeydown', "if(event.key==='Enter')leaderLogin()");

    // Override login button
    const loginBtn = document.querySelector('#loginPage button[onclick="login()"]');
    if (loginBtn) {
        loginBtn.setAttribute('onclick', 'leaderLogin()');
        loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-2"></i>團長登入';
    }
}

async function leaderLogin() {
    const gasUrl = document.getElementById('adminGasUrl').value.trim() || localStorage.getItem('adminGasUrl');
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!gasUrl) {
        errorDiv.textContent = '請設定 GAS Web App URL';
        errorDiv.classList.remove('hidden');
        return;
    }
    if (!password) {
        errorDiv.textContent = '請輸入團長密碼';
        errorDiv.classList.remove('hidden');
        return;
    }

    errorDiv.classList.add('hidden');

    try {
        if (!api) {
            api = new TravelAPI(gasUrl);
            localStorage.setItem('adminGasUrl', gasUrl);
        }
        const result = await api.loginLeader(leaderTripCode, password);
        if (result.success) {
            leaderToken = result.token;
            leaderName = result.leaderName || '';
            currentRole = 'leader';

            // 套用角色 UI
            applyRoleUI();

            // Update sidebar user info for leader
            const userInfoName = document.querySelector('.user-info .text-sm.font-bold');
            const userInfoRole = document.querySelector('.user-info .text-xs.text-slate-400');
            if (userInfoName) userInfoName.textContent = leaderName || '團長';
            if (userInfoRole) userInfoRole.textContent = '團長模式';

            // Go directly to trip detail
            showDetail(leaderTripCode);
        } else {
            errorDiv.textContent = result.error || '登入失敗';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        errorDiv.textContent = '連線失敗：' + error.message;
        errorDiv.classList.remove('hidden');
    }
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
    // Sidebar 只在桌面版顯示，手機版用 mobileHeader
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('hidden', 'md:flex');
    document.getElementById('mobileHeader').classList.remove('hidden');
    document.getElementById('mobileHeader').classList.add('flex', 'md:hidden');
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
    // Sidebar 只在桌面版顯示，手機版用 mobileHeader
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('hidden', 'md:flex');
    document.getElementById('mobileHeader').classList.remove('hidden');
    document.getElementById('mobileHeader').classList.add('flex', 'md:hidden');
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
        employeeList: '員工清單',
        settings: '設定'
    };
    document.getElementById('pageTitle').textContent = titles[tab] || tab;

    // Toggle tab content visibility
    hideAllTabContent();
    if (tab === 'dashboard' || tab === 'expenses') {
        document.getElementById('dashboardPage').classList.remove('hidden');
    } else if (tab === 'employeeList') {
        document.getElementById('employeeListPage').classList.remove('hidden');
        loadAllEmployeeData(); // 載入所有員工資料
    } else if (tab === 'settings') {
        document.getElementById('settingsPage').classList.remove('hidden');
    }

    // Update sidebar menu active state
    document.querySelectorAll('.admin-menu-item').forEach(item => {
        const itemTab = item.dataset.tab;
        const indicator = item.querySelector('.active-indicator');
        // 保留原有的 auditor-only/leader-only class
        const roleClass = item.classList.contains('auditor-only') ? ' auditor-only' : (item.classList.contains('leader-only') ? ' leader-only' : '');
        if (itemTab === tab) {
            item.className = 'admin-menu-item flex items-center gap-4 px-6 py-3 transition-colors bg-indigo-600 text-white relative' + roleClass;
            if (!indicator) {
                const div = document.createElement('div');
                div.className = 'active-indicator absolute left-0 top-0 bottom-0 w-1 bg-indigo-300';
                item.appendChild(div);
            }
        } else {
            item.className = 'admin-menu-item flex items-center gap-4 px-6 py-3 transition-colors text-slate-400 hover:bg-slate-700 hover:text-white relative' + roleClass;
            if (indicator) indicator.remove();
        }
        item.dataset.tab = itemTab;
    });
}

function hideAllTabContent() {
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('detailPage').classList.add('hidden');
    const employeeListPage = document.getElementById('employeeListPage');
    if (employeeListPage) employeeListPage.classList.add('hidden');
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
            try { updateDashboardStats(); } catch (e) { console.warn('updateDashboardStats failed:', e); }
            renderTrips();
        } else {
            listDiv.innerHTML = `<div class="text-center py-12 text-red-500 col-span-full"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p>${result.error}</p></div>`;
        }
    } catch (error) {
        listDiv.innerHTML = `<div class="text-center py-12 text-red-500 col-span-full"><i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i><p>載入失敗：${error.message}</p></div>`;
    }
}

function updateDashboardStats() {
    const openCount = currentTrips.filter(t => (t.tripStatus || 'Open') === 'Open').length;
    const submitted = currentTrips.filter(t => t.tripStatus === 'Submitted').length;
    const pendingReview = currentTrips.filter(t => t.tripStatus === 'Submitted' && t.status === 'pending').length;
    const closed = currentTrips.filter(t => t.tripStatus === 'Closed').length;

    const el = (id) => document.getElementById(id);
    if (el('statOpenCount')) el('statOpenCount').textContent = openCount;
    if (el('statSubmittedCount')) el('statSubmittedCount').textContent = submitted;
    if (el('statSubmittedSub')) el('statSubmittedSub').textContent = `已送審 ${submitted} · 待審 ${pendingReview}`;
    if (el('statClosedCount')) el('statClosedCount').textContent = closed;
}

function filterTrips(filter) {
    currentFilter = filter;
    renderTrips();
}

function filterTripsByTripStatus(filter) {
    currentTripStatusFilter = filter;
    renderTrips();
}

// 設定團務狀態篩選（按鈕式）
function setTripStatusFilter(filter, btn) {
    currentTripStatusFilter = filter;
    // 更新按鈕 active 狀態
    document.querySelectorAll('#tripStatusFilterBar .trip-filter-btn').forEach(b => {
        if (b === btn) {
            b.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
            b.classList.add('bg-indigo-600', 'text-white');
        } else {
            b.classList.remove('bg-indigo-600', 'text-white');
            b.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
        }
    });
    renderTrips();
}

function renderTrips() {
    const listDiv = document.getElementById('tripsList');
    let trips = currentTrips;
    const searchTerm = (document.getElementById('tripSearchInput')?.value || '').toLowerCase();

    // Apply review status filter
    if (currentFilter !== 'all') {
        trips = trips.filter(t => t.status === currentFilter);
    }

    // V2: Apply tripStatus filter
    if (currentTripStatusFilter !== 'all') {
        trips = trips.filter(t => (t.tripStatus || 'Open') === currentTripStatusFilter);
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
        const tsInfo = getTripStatusInfo(trip.tripStatus);
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
                        <div class="flex flex-col items-end gap-1">
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-${status.color}-100 text-${status.color}-700">
                                <i class="fa-solid ${status.faIcon}"></i> ${status.label}
                            </span>
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-${tsInfo.color}-50 text-${tsInfo.color}-600">
                                <i class="fa-solid ${tsInfo.faIcon}"></i> ${tsInfo.label}
                            </span>
                        </div>
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
    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
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
            // V2: Cache data for sort/filter
            currentExpenses = result.expenses || [];
            currentEmployees = result.employees || [];
            currentTripData = result.trip || {};
            currentTripMembers = result.tripMembers || [];
            currentEmployeesMaster = result.employeesMaster || [];
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
    const tripStatusInfo = getTripStatusInfo(trip.tripStatus);

    document.getElementById('pageTitle').textContent = trip.location || '申請詳情';

    // Update lock status badge
    const lockBadge = document.getElementById('lockStatusBadge');
    if (lockBadge) {
        if (trip.isLocked) {
            lockBadge.innerHTML = '<div class="w-2 h-2 rounded-full bg-red-500"></div><span>已鎖定</span>';
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

    // V2: Collect unique members and categories for filter dropdowns
    const memberNames = [...new Set(expenses.map(e => e.employeeName).filter(Boolean))];
    const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];

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
                <!-- V2: Trip Status (團務狀態) -->
                <div class="flex items-center gap-2 mt-2">
                    <span class="text-xs text-gray-500">團務狀態：</span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-${tripStatusInfo.color}-100 text-${tripStatusInfo.color}-700">
                        <i class="fa-solid ${tripStatusInfo.faIcon}"></i> ${tripStatusInfo.label}
                    </span>
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
                    ${trip.leaderName ? `<div class="flex justify-between"><span class="text-gray-500">團長</span><span class="font-medium">${trip.leaderName}</span></div>` : ''}
                    <div class="flex justify-between"><span class="text-gray-500">提交日期</span><span class="font-medium">${trip.submittedDate}</span></div>
                </div>
            </div>
        </div>

        <!-- V2: 團務狀態管理 (團長專用) -->
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm leader-only">
            <h3 class="font-bold text-gray-800 mb-1 text-sm"><i class="fa-solid fa-clipboard-check mr-2 text-indigo-500"></i>團務狀態管理</h3>
            <p class="text-xs text-gray-400 mb-4">控制旅遊團的送審/結案流程（與審核狀態獨立）</p>
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-4">
                <span class="text-sm text-gray-600">目前狀態：</span>
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-${tripStatusInfo.color}-100 text-${tripStatusInfo.color}-700">
                    <i class="fa-solid ${tripStatusInfo.faIcon}"></i> ${tripStatusInfo.label}
                </span>
            </div>
            <div class="grid grid-cols-3 gap-3">
                <button onclick="updateTripStatus('${trip.tripCode}', 'Open')" class="py-2.5 rounded-xl text-xs font-semibold ${(trip.tripStatus || 'Open') === 'Open' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'} transition">
                    <i class="fa-solid fa-folder-open mr-1"></i> 進行中
                </button>
                <button onclick="updateTripStatus('${trip.tripCode}', 'Submitted')" class="py-2.5 rounded-xl text-xs font-semibold ${trip.tripStatus === 'Submitted' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'} transition">
                    <i class="fa-solid fa-paper-plane mr-1"></i> 送出審核
                </button>
                <button onclick="updateTripStatus('${trip.tripCode}', 'Closed')" class="py-2.5 rounded-xl text-xs font-semibold ${trip.tripStatus === 'Closed' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition">
                    <i class="fa-solid fa-box-archive mr-1"></i> 結案
                </button>
            </div>
        </div>

        <!-- 員工名單 (團長專用) -->
        ${employees.length > 0 ? `
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm leader-only">
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
                <h3 class="font-bold text-gray-800 text-sm"><i class="fa-solid fa-receipt mr-2 text-indigo-500"></i>費用明細 (<span id="expenseDisplayCount">${expenses.length}</span> 筆)</h3>
                <div class="flex items-center gap-2 text-xs flex-wrap">
                    <span class="px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium"><i class="fa-solid fa-check mr-1"></i>已通過 ${approvedCount}</span>
                    <span class="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium"><i class="fa-solid fa-hourglass mr-1"></i>待審 ${pendingCount}</span>
                    <span class="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">合計 NT$ ${totalNTD.toLocaleString()}</span>
                </div>
            </div>

            <!-- V2: Sort & Filter Bar -->
            <div class="flex flex-col md:flex-row gap-2 mb-4 p-3 bg-gray-50 rounded-xl">
                <!-- Sort buttons -->
                <div class="flex items-center gap-1 text-xs">
                    <span class="text-gray-500 font-medium mr-1">排序：</span>
                    <button onclick="sortExpenses('date')" class="px-2 py-1 rounded-lg font-medium transition ${expenseSortField === 'date' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-100'}">
                        日期 ${expenseSortField === 'date' ? (expenseSortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                    <button onclick="sortExpenses('amount')" class="px-2 py-1 rounded-lg font-medium transition ${expenseSortField === 'amount' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-100'}">
                        金額 ${expenseSortField === 'amount' ? (expenseSortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                    <button onclick="sortExpenses('name')" class="px-2 py-1 rounded-lg font-medium transition ${expenseSortField === 'name' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-100'}">
                        提交人 ${expenseSortField === 'name' ? (expenseSortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                </div>
                <!-- Filter dropdowns -->
                <div class="flex items-center gap-1 text-xs flex-wrap">
                    <span class="text-gray-500 font-medium mr-1">篩選：</span>
                    <select id="filterMember" onchange="applyExpenseFilters()" class="px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white">
                        <option value="all">所有團員</option>
                        ${memberNames.map(n => `<option value="${n}" ${expenseFilters.member === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                    <select id="filterCategory" onchange="applyExpenseFilters()" class="px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white">
                        <option value="all">所有類別</option>
                        ${categories.map(c => `<option value="${c}" ${expenseFilters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                    <select id="filterStatus" onchange="applyExpenseFilters()" class="px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white">
                        <option value="all">所有狀態</option>
                        <option value="pending" ${expenseFilters.status === 'pending' ? 'selected' : ''}>待審核</option>
                        <option value="approved" ${expenseFilters.status === 'approved' ? 'selected' : ''}>已通過</option>
                        <option value="rejected" ${expenseFilters.status === 'rejected' ? 'selected' : ''}>已退回</option>
                        <option value="needs_revision" ${expenseFilters.status === 'needs_revision' ? 'selected' : ''}>需補件</option>
                        <option value="modified_pending" ${expenseFilters.status === 'modified_pending' ? 'selected' : ''}>已變更待重審</option>
                    </select>
                </div>
            </div>

            ${pendingCount > 0 && currentRole === 'auditor' ? `
            <button onclick="approveAllExpenses('${trip.tripCode}')" class="w-full mb-4 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition shadow-sm">
                <i class="fa-solid fa-check-double mr-1"></i> 全部通過 (${pendingCount} 筆待審)
            </button>
            ` : ''}
            <div class="space-y-3" id="expenseListContainer">
            </div>
        </div>

        <!-- 團長專用：員工資料確認 + Excel 申請表匯出 -->
        ${currentRole === 'leader' ? `
        <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm leader-only">
            <h3 class="font-bold text-gray-800 mb-1 text-sm"><i class="fa-solid fa-users mr-2 text-blue-600"></i>員工資料確認</h3>
            <p class="text-xs text-gray-400 mb-3">匯出前請確認員工對應是否正確</p>
            <div class="overflow-x-auto">
                <table class="w-full text-xs border-collapse" id="empVerifyTable">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="border border-gray-300 px-2 py-1.5 text-left">登入姓名</th>
                            <th class="border border-gray-300 px-2 py-1.5 text-left">員工姓名</th>
                            <th class="border border-gray-300 px-2 py-1.5 text-center">到職日</th>
                            <th class="border border-gray-300 px-2 py-1.5 text-right">可補助金額</th>
                            <th class="border border-gray-300 px-2 py-1.5 text-right">單據金額</th>
                            <th class="border border-gray-300 px-2 py-1.5 text-center">申請補助</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                const masterById = {};
                const masterByName = {};
                (currentEmployeesMaster || []).forEach(emp => {
                    if (emp.employeeID) masterById[emp.employeeID] = emp;
                    if (emp.name) masterByName[emp.name] = emp;
                });
                const members = currentTripMembers || [];
                const allExpenses = currentExpenses || [];
                if (members.length === 0) return '<tr><td colspan="6" class="border border-gray-300 px-2 py-3 text-center text-gray-400">尚無成員資料</td></tr>';
                return members.map(m => {
                    const master = (m.employeeID && masterById[m.employeeID]) || masterByName[m.memberName] || {};
                    const realName = master.name || '-';
                    const startDate = master.startDate || '-';
                    const limit = Number(master.monthlyLimit) || 0;
                    const memberExp = allExpenses.filter(e => e.employeeName === m.memberName || e.belongTo === m.memberName);
                    const expTotal = memberExp.reduce((s, e) => s + (Number(e.amountNTD) || 0), 0);
                    const hasExpense = expTotal > 0;
                    const nameMatch = realName !== '-';
                    const nameClass = nameMatch ? 'text-green-700 font-semibold' : 'text-red-500 font-semibold';
                    const applyBadge = hasExpense
                        ? '<span class="inline-block px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold">Y</span>'
                        : '<span class="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">N</span>';
                    return '<tr>'
                        + '<td class="border border-gray-300 px-2 py-1.5">' + m.memberName + '</td>'
                        + '<td class="border border-gray-300 px-2 py-1.5 ' + nameClass + '">' + realName + '</td>'
                        + '<td class="border border-gray-300 px-2 py-1.5 text-center">' + startDate + '</td>'
                        + '<td class="border border-gray-300 px-2 py-1.5 text-right">' + limit.toLocaleString() + '</td>'
                        + '<td class="border border-gray-300 px-2 py-1.5 text-right">' + expTotal.toLocaleString() + '</td>'
                        + '<td class="border border-gray-300 px-2 py-1.5 text-center">' + applyBadge + '</td>'
                        + '</tr>';
                }).join('');
            })()}
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-200 mt-4 pt-4">
                <h3 class="font-bold text-gray-800 mb-1 text-sm"><i class="fa-solid fa-file-excel mr-2 text-green-600"></i>匯出申請單</h3>
                <p class="text-xs text-gray-400 mb-4">產生 Excel 格式的費用申請表</p>
                <button onclick="leaderExportToExcel()" class="w-full py-3 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition shadow-sm">
                    <i class="fa-solid fa-download mr-1"></i> 產生 Excel 申請單
                </button>
            </div>
        </div>
        ` : ''
        }

        <!--Trip 整體審核操作（僅審核人員可見）-->
                ${currentRole === 'auditor' ? `
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
        ` : ''}

        <!--鎖定管理(團長專用)-->
            <div class="bg-white rounded-xl p-5 border border-gray-200 shadow-sm leader-only">
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

    // V2: Render expenses with sort/filter
    renderFilteredExpenses();
}

// ============================================
// 照片檢視
// ============================================

async function viewPhoto(fileId) {
    const modal = document.getElementById('photoModal');
    const img = document.getElementById('photoModalImg');
    const loading = document.getElementById('photoModalLoading');

    // V2: Reset lightbox state
    resetLightbox();
    modal.classList.add('active');
    img.style.display = 'none';
    loading.style.display = 'block';
    loading.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><p class="text-sm">載入照片中...</p>';

    try {
        const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
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
            loading.innerHTML = `< i class="fa-solid fa-circle-exclamation text-red-400 text-2xl mb-2" ></i > <p class="text-sm">載入失敗：${result.error}</p>`;
        }
    } catch (error) {
        loading.innerHTML = `< i class="fa-solid fa-circle-exclamation text-red-400 text-2xl mb-2" ></i > <p class="text-sm">載入失敗：${error.message}</p>`;
    }
}

function closePhotoModal(event) {
    const modal = document.getElementById('photoModal');
    if (event.target === modal || event.target.closest('.photo-modal-close')) {
        modal.classList.remove('active');
        resetLightbox();
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
    btn.className = `w - full py - 3 rounded - xl font - semibold text - white transition ${info.color} `;

    modal.classList.add('active');
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
}

async function submitReview() {
    const tripCode = document.getElementById('reviewTripCode').value;
    const action = document.getElementById('reviewAction').value;
    const note = document.getElementById('reviewNote').value.trim();
    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');

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
    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
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

    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
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

    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
    try {
        const result = await api.adminLockTrip(token, tripCode);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast('案件已鎖定', 'success');
            loadTripDetail(tripCode);
            // 團長模式下不呼叫 loadTrips()，避免因 token 不匹配觸發 logout 導致 currentRole 被重設
            if (currentRole !== 'leader') loadTrips();
        } else {
            alert('鎖定失敗：' + result.error);
        }
    } catch (error) {
        alert('鎖定失敗：' + error.message);
    }
}

async function unlockTrip(tripCode) {
    if (!confirm('確定要解鎖此案件嗎？\n\n解鎖後團員可繼續上傳/更新費用。')) return;

    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
    try {
        const result = await api.adminUnlockTrip(token, tripCode);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast('案件已解鎖', 'success');
            loadTripDetail(tripCode);
            // 團長模式下不呼叫 loadTrips()，避免因 token 不匹配觸發 logout 導致 currentRole 被重設
            if (currentRole !== 'leader') loadTrips();
        } else {
            alert('解鎖失敗：' + result.error);
        }
    } catch (error) {
        alert('解鎖失敗：' + error.message);
    }
}

// ============================================
// V2: 排序 & 篩選
// ============================================

function sortExpenses(field) {
    if (expenseSortField === field) {
        expenseSortDir = expenseSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        expenseSortField = field;
        expenseSortDir = field === 'amount' ? 'desc' : 'asc';
    }
    renderFilteredExpenses();
}

function applyExpenseFilters() {
    const memberSel = document.getElementById('filterMember');
    const catSel = document.getElementById('filterCategory');
    const statusSel = document.getElementById('filterStatus');
    expenseFilters.member = memberSel ? memberSel.value : 'all';
    expenseFilters.category = catSel ? catSel.value : 'all';
    expenseFilters.status = statusSel ? statusSel.value : 'all';
    renderFilteredExpenses();
}

function getFilteredAndSortedExpenses() {
    let exps = [...currentExpenses];

    // Filter
    if (expenseFilters.member !== 'all') {
        exps = exps.filter(e => e.employeeName === expenseFilters.member || e.belongTo === expenseFilters.member);
    }
    if (expenseFilters.category !== 'all') {
        exps = exps.filter(e => e.category === expenseFilters.category);
    }
    if (expenseFilters.status !== 'all') {
        exps = exps.filter(e => e.expenseStatus === expenseFilters.status);
    }

    // Sort
    exps.sort((a, b) => {
        let cmp = 0;
        if (expenseSortField === 'date') {
            cmp = (a.date || '').localeCompare(b.date || '');
        } else if (expenseSortField === 'amount') {
            cmp = (Number(a.amountNTD) || 0) - (Number(b.amountNTD) || 0);
        } else if (expenseSortField === 'name') {
            cmp = (a.employeeName || '').localeCompare(b.employeeName || '');
        }
        return expenseSortDir === 'asc' ? cmp : -cmp;
    });

    return exps;
}

function renderFilteredExpenses() {
    const container = document.getElementById('expenseListContainer');
    if (!container) return;

    const expenses = getFilteredAndSortedExpenses();
    const trip = currentTripData;
    const tripCode = trip.tripCode || currentTripCode;

    // Update display count
    const countEl = document.getElementById('expenseDisplayCount');
    if (countEl) countEl.textContent = expenses.length;

    // Update sort button styles
    document.querySelectorAll('[onclick^="sortExpenses"]').forEach(btn => {
        const field = btn.getAttribute('onclick').match(/'(\w+)'/)?.[1];
        if (field === expenseSortField) {
            btn.className = 'px-2 py-1 rounded-lg font-medium transition bg-indigo-100 text-indigo-700';
            btn.innerHTML = btn.textContent.replace(/[↑↓]/, '').trim() + ' ' + (expenseSortDir === 'asc' ? '↑' : '↓');
        } else {
            btn.className = 'px-2 py-1 rounded-lg font-medium transition bg-white text-gray-600 hover:bg-gray-100';
            btn.innerHTML = btn.textContent.replace(/[↑↓]/, '').trim();
        }
    });

    if (expenses.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">沒有符合條件的費用</div>';
        return;
    }

    // V2: Leader mode — group by "我的" vs "團員的"
    if (currentRole === 'leader' && leaderName) {
        const myExps = expenses.filter(e => e.employeeName === leaderName);
        const otherExps = expenses.filter(e => e.employeeName !== leaderName);
        let html = '';
        if (myExps.length > 0) {
            html += `<div class="text-xs font-bold text-indigo-600 mb-2 mt-1"><i class="fa-solid fa-user mr-1"></i>我的單據(${myExps.length})</div>`;
            html += myExps.map(exp => renderExpenseCard(exp, tripCode)).join('');
        }
        if (otherExps.length > 0) {
            html += `<div class="text-xs font-bold text-gray-500 mb-2 mt-4"><i class="fa-solid fa-users mr-1"></i>團員單據(${otherExps.length})</div>`;
            html += otherExps.map(exp => renderExpenseCard(exp, tripCode)).join('');
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = expenses.map(exp => renderExpenseCard(exp, tripCode)).join('');
    }
}

function renderExpenseCard(exp, tripCode) {
    const expStatus = getExpenseStatusInfo(exp.expenseStatus);
    const catIcon = getCategoryIcon(exp.category);
    const belongToInfo = (exp.belongTo && exp.belongTo !== exp.employeeName) ? ` → <span class="text-indigo-500">${exp.belongTo}</span>` : '';
    const modifiedByInfo = exp.lastModifiedBy ? `<span class="text-[10px] text-purple-400 ml-1"><i class="fa-solid fa-pen-fancy mr-0.5"></i>修改：${exp.lastModifiedBy}</span>` : '';

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
                            <div class="text-xs text-gray-400 mt-0.5">${exp.employeeName}${belongToInfo} · ${exp.category} · ${exp.date} ${modifiedByInfo}</div>
                        </div>
                        <span class="font-bold text-gray-800 text-sm ml-2 whitespace-nowrap">NT$ ${Number(exp.amountNTD).toLocaleString()}</span>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                        <span class="text-[10px] text-gray-400">${exp.currency} ${exp.amount} × ${exp.exchangeRate}</span>
                        <div class="flex items-center gap-2">
                            ${currentRole === 'leader' ? `<button onclick="showEditExpenseModal('${tripCode}', '${exp.expenseId}')" class="text-xs text-purple-600 hover:text-purple-800 font-medium"><i class="fa-solid fa-pen-to-square mr-1"></i>編輯</button>` : ''}
                            ${exp.photoFileId ? `<button onclick="viewPhoto('${exp.photoFileId}')" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"><i class="fa-solid fa-image mr-1"></i>查看單據</button>` : '<span class="text-[10px] text-gray-300">無照片</span>'}
                        </div>
                    </div>
                    ${exp.expenseReviewNote ? `<p class="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded-lg"><i class="fa-solid fa-comment-dots mr-1"></i>${exp.expenseReviewNote}</p>` : ''}
                    <!-- 逐筆審核按鈕（僅審核人員可見） -->
                    ${currentRole === 'auditor' ? `
                    <div class="flex gap-2 mt-3">
                        <button onclick="reviewExpense('${tripCode}', '${exp.expenseId}', 'approved', '')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold ${exp.expenseStatus === 'approved' ? 'bg-green-200 text-green-800' : 'bg-green-50 text-green-700 hover:bg-green-100'} transition">
                            <i class="fa-solid fa-check mr-1"></i>通過
                        </button>
                        <button onclick="reviewExpense('${tripCode}', '${exp.expenseId}', 'rejected', '')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold ${exp.expenseStatus === 'rejected' ? 'bg-red-200 text-red-800' : 'bg-red-50 text-red-700 hover:bg-red-100'} transition">
                            <i class="fa-solid fa-xmark mr-1"></i>退回
                        </button>
                        <button onclick="showExpenseNoteInput('${tripCode}', '${exp.expenseId}')" class="flex-1 py-1.5 rounded-lg text-xs font-semibold ${exp.expenseStatus === 'needs_revision' ? 'bg-orange-200 text-orange-800' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'} transition">
                            <i class="fa-solid fa-pen mr-1"></i>備註
                        </button>
                    </div>
                    <!-- 備註輸入區（預設隱藏） -->
                    <div id="note-input-${exp.expenseId}" class="hidden mt-2">
                        <textarea id="note-text-${exp.expenseId}" rows="2" class="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-indigo-500" placeholder="輸入審核備註..."></textarea>
                        <button onclick="submitExpenseNote('${tripCode}', '${exp.expenseId}')" class="mt-1 w-full py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition">
                            <i class="fa-solid fa-paper-plane mr-1"></i>送出備註（需補件）
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
}

// ============================================
// V2: 團務狀態管理
// ============================================

async function updateTripStatus(tripCode, newStatus) {
    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
    try {
        const result = await api.submitTripStatus(tripCode, newStatus, token);
        if (result.authError) { logout(); return; }
        if (result.success) {
            showToast(`團務狀態已更新為 ${getTripStatusInfo(result.tripStatus).label} `, 'success');
            loadTripDetail(tripCode);
        } else {
            alert('更新失敗：' + result.error);
        }
    } catch (error) {
        alert('更新失敗：' + error.message);
    }
}

// ============================================
// V2: 代客修正 (Edit Expense)
// ============================================

function showEditExpenseModal(tripCode, expenseId) {
    const exp = currentExpenses.find(e => e.expenseId === expenseId);
    if (!exp) return;

    const modal = document.getElementById('editExpenseModal');
    document.getElementById('editExpTripCode').value = tripCode;
    document.getElementById('editExpId').value = expenseId;
    document.getElementById('editExpAmount').value = exp.amountNTD || exp.amount || '';
    document.getElementById('editExpCategory').value = exp.category || '';
    document.getElementById('editExpDescription').value = exp.description || '';
    document.getElementById('editExpBelongTo').value = exp.belongTo || exp.employeeName || '';

    // Populate belongTo dropdown options
    const belongToSelect = document.getElementById('editExpBelongTo');
    if (belongToSelect.tagName === 'SELECT') {
        belongToSelect.innerHTML = '';
        const names = [...new Set([
            ...(currentEmployees || []).map(e => e.name),
            ...(currentExpenses || []).map(e => e.employeeName),
            ...(currentExpenses || []).map(e => e.belongTo)
        ].filter(Boolean))];
        names.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            if (n === (exp.belongTo || exp.employeeName)) opt.selected = true;
            belongToSelect.appendChild(opt);
        });
    }

    modal.classList.add('active');
}

function closeEditExpenseModal() {
    document.getElementById('editExpenseModal').classList.remove('active');
}

async function submitEditExpense() {
    const tripCode = document.getElementById('editExpTripCode').value;
    const expenseId = document.getElementById('editExpId').value;
    const updates = {
        amount: document.getElementById('editExpAmount').value,
        category: document.getElementById('editExpCategory').value,
        description: document.getElementById('editExpDescription').value,
        belongTo: document.getElementById('editExpBelongTo').value
    };
    const token = currentRole === 'leader' ? leaderToken : sessionStorage.getItem('adminToken');
    const modifiedBy = currentRole === 'leader' ? leaderName : 'Admin';

    try {
        const result = await api.adminEditExpense(token, tripCode, expenseId, updates, modifiedBy);
        if (result.authError) { logout(); return; }
        if (result.success) {
            closeEditExpenseModal();
            showToast('費用已更新', 'success');
            loadTripDetail(tripCode);
        } else {
            alert('更新失敗：' + result.error);
        }
    } catch (error) {
        alert('更新失敗：' + error.message);
    }
}

// ============================================
// V2: Lightbox Zoom/Pan
// ============================================

let lightboxState = { scale: 1, translateX: 0, translateY: 0, isDragging: false, startX: 0, startY: 0, lastTouchDist: 0 };

function initLightbox() {
    const modal = document.getElementById('photoModal');
    const img = document.getElementById('photoModalImg');
    if (!modal || !img) return;

    // Mouse wheel zoom
    modal.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        lightboxState.scale = Math.max(0.5, Math.min(5, lightboxState.scale + delta));
        applyLightboxTransform();
    }, { passive: false });

    // Mouse drag pan
    img.addEventListener('mousedown', function (e) {
        if (lightboxState.scale <= 1) return;
        e.preventDefault();
        lightboxState.isDragging = true;
        lightboxState.startX = e.clientX - lightboxState.translateX;
        lightboxState.startY = e.clientY - lightboxState.translateY;
        img.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function (e) {
        if (!lightboxState.isDragging) return;
        lightboxState.translateX = e.clientX - lightboxState.startX;
        lightboxState.translateY = e.clientY - lightboxState.startY;
        applyLightboxTransform();
    });

    document.addEventListener('mouseup', function () {
        lightboxState.isDragging = false;
        if (img) img.style.cursor = lightboxState.scale > 1 ? 'grab' : 'default';
    });

    // Touch pinch-to-zoom + pan
    img.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            lightboxState.lastTouchDist = getTouchDist(e.touches);
        } else if (e.touches.length === 1 && lightboxState.scale > 1) {
            lightboxState.isDragging = true;
            lightboxState.startX = e.touches[0].clientX - lightboxState.translateX;
            lightboxState.startY = e.touches[0].clientY - lightboxState.translateY;
        }
    }, { passive: false });

    img.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = getTouchDist(e.touches);
            const scaleDelta = (dist - lightboxState.lastTouchDist) * 0.005;
            lightboxState.scale = Math.max(0.5, Math.min(5, lightboxState.scale + scaleDelta));
            lightboxState.lastTouchDist = dist;
            applyLightboxTransform();
        } else if (e.touches.length === 1 && lightboxState.isDragging) {
            e.preventDefault();
            lightboxState.translateX = e.touches[0].clientX - lightboxState.startX;
            lightboxState.translateY = e.touches[0].clientY - lightboxState.startY;
            applyLightboxTransform();
        }
    }, { passive: false });

    img.addEventListener('touchend', function () {
        lightboxState.isDragging = false;
        lightboxState.lastTouchDist = 0;
    });

    // Double-click to toggle zoom
    img.addEventListener('dblclick', function () {
        if (lightboxState.scale > 1) {
            resetLightbox();
        } else {
            lightboxState.scale = 2.5;
            applyLightboxTransform();
        }
    });
}

function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function applyLightboxTransform() {
    const img = document.getElementById('photoModalImg');
    if (img) {
        img.style.transform = `scale(${lightboxState.scale}) translate(${lightboxState.translateX / lightboxState.scale}px, ${lightboxState.translateY / lightboxState.scale}px)`;
        img.style.cursor = lightboxState.scale > 1 ? 'grab' : 'default';
    }
}

function resetLightbox() {
    lightboxState.scale = 1;
    lightboxState.translateX = 0;
    lightboxState.translateY = 0;
    applyLightboxTransform();
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
        'needs_revision': { label: '補件', color: 'orange', faIcon: 'fa-pen' },
        'modified_pending': { label: '待重審', color: 'amber', faIcon: 'fa-pen-to-square' }
    };
    return map[status] || { label: status || '待審', color: 'gray', faIcon: 'fa-question' };
}

function getStatusInfo(status) {
    const map = {
        'pending': { label: '待審核', color: 'yellow', faIcon: 'fa-hourglass' },
        'approved': { label: '已通過', color: 'green', faIcon: 'fa-check' },
        'rejected': { label: '已退回', color: 'red', faIcon: 'fa-xmark' },
        'needs_revision': { label: '需補件', color: 'orange', faIcon: 'fa-pen' },
        'modified_pending': { label: '已變更待重審', color: 'amber', faIcon: 'fa-pen-to-square' }
    };
    return map[status] || { label: status || '未知', color: 'gray', faIcon: 'fa-question' };
}

function getTripStatusInfo(tripStatus) {
    const map = {
        'Open': { label: '進行中', color: 'blue', faIcon: 'fa-folder-open' },
        'Submitted': { label: '已送審', color: 'indigo', faIcon: 'fa-paper-plane' },
        'Closed': { label: '已結案', color: 'gray', faIcon: 'fa-box-archive' }
    };
    return map[tripStatus] || map['Open'];
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
    toast.className = `pointer - events - auto bg - white border - l - 4 ${borderMap[type] || borderMap.info} p - 4 rounded - lg shadow - lg flex items - center gap - 3 min - w - [280px]`;
    toast.style.animation = 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.innerHTML = `
        < i class="fa-solid ${iconMap[type] || iconMap.info} text-lg" ></i >
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

// V2: Init lightbox after DOM ready
document.addEventListener('DOMContentLoaded', function () {
    initLightbox();
});

// ============================================
// V3: 審核人員專用 - 員工清單頁面
// ============================================

let allEmployeeData = []; // 所有 Trip 的員工彙總資料
let employeeListTripFilter = 'all';

async function loadAllEmployeeData() {
    const tbody = document.getElementById('employeeListBody');
    const countEl = document.getElementById('employeeListCount');
    const filterSelect = document.getElementById('employeeListTripFilter');

    tbody.innerHTML = `
        < tr >
        <td colspan="9" class="px-4 py-8 text-center text-gray-400">
            <i class="fa-solid fa-spinner fa-spin text-xl mb-2"></i>
            <p class="text-sm">載入員工資料中...</p>
        </td>
        </tr >
        `;

    try {
        const token = sessionStorage.getItem('adminToken');
        // 確保 trips 已載入
        if (currentTrips.length === 0) {
            const tripsResult = await api.adminGetTrips(token);
            if (tripsResult.success) {
                currentTrips = tripsResult.trips;
            }
        }

        // 填入 Trip 篩選選項
        let filterHtml = '<option value="all">所有旅遊</option>';
        currentTrips.forEach(t => {
            filterHtml += `< option value = "${t.tripCode}" > ${t.tripCode} - ${t.location || ''}</option > `;
        });
        filterSelect.innerHTML = filterHtml;

        // V3: 使用 EmployeesMaster 和 TripMembers 建立員工視圖
        const employeeMasterMap = new Map(); // employeeID -> master data
        const employeeTripMap = new Map();   // employeeID -> trips[]
        allEmployeeData = [];

        // 逐一取得每個 Trip 的詳情
        for (const trip of currentTrips) {
            try {
                const detailResult = await api.adminGetTripDetail(token, trip.tripCode);
                if (detailResult.success) {
                    const tripData = detailResult.trip || {};
                    const expenses = detailResult.expenses || [];
                    const tripMembers = detailResult.tripMembers || [];
                    const employeesMaster = detailResult.employeesMaster || [];

                    // 建立 EmployeesMaster map（只需執行一次，但為了簡化每次都更新）
                    employeesMaster.forEach(emp => {
                        if (emp.employeeID) {
                            employeeMasterMap.set(emp.employeeID, emp);
                        }
                    });

                    // 處理 TripMembers 資料
                    tripMembers.forEach(member => {
                        const memberExpenses = expenses.filter(e =>
                            e.employeeName === member.memberName || e.belongTo === member.memberName
                        );

                        const totalAmount = memberExpenses.reduce((sum, e) => sum + (Number(e.amountNTD) || 0), 0);
                        const approvedAmount = memberExpenses
                            .filter(e => e.expenseStatus === 'approved')
                            .reduce((sum, e) => sum + (Number(e.amountNTD) || 0), 0);

                        const pendingCount = memberExpenses.filter(e =>
                            e.expenseStatus === 'pending' || e.expenseStatus === 'modified_pending'
                        ).length;
                        const approvedCount = memberExpenses.filter(e => e.expenseStatus === 'approved').length;

                        // 補助狀態判斷
                        let subsidyStatus = '未提交';
                        if (memberExpenses.length > 0) {
                            if (approvedCount === memberExpenses.length) {
                                subsidyStatus = '已核銷';
                            } else if (pendingCount > 0) {
                                subsidyStatus = '審核中';
                            } else {
                                subsidyStatus = '部分核銷';
                            }
                        }

                        const employeeData = {
                            name: member.memberName,
                            employeeID: member.employeeID || '',
                            email: '',
                            department: '',
                            tripCode: trip.tripCode,
                            travelDate: `${tripData.startDate || ''} ~${tripData.endDate || ''} `,
                            subsidyStatus: subsidyStatus,
                            approvedAmount: approvedAmount,
                            totalAmount: totalAmount,
                            expenseCount: memberExpenses.length,
                            monthlyLimit: 0,
                            usedAmount: 0
                        };

                        // 如果有綁定員工 ID，從 EmployeesMaster 取得詳細資訊
                        if (member.employeeID && employeeMasterMap.has(member.employeeID)) {
                            const masterData = employeeMasterMap.get(member.employeeID);
                            // V3.1.58: 使用真實員工姓名，而非 memberName
                            employeeData.name = masterData.name || member.memberName;
                            employeeData.email = masterData.email || '';
                            employeeData.department = masterData.department || '';
                            employeeData.monthlyLimit = masterData.monthlyLimit || 0;
                            employeeData.usedAmount = masterData.usedAmount || 0;

                            // 累計跨旅程統計
                            if (!employeeTripMap.has(member.employeeID)) {
                                employeeTripMap.set(member.employeeID, []);
                            }
                            employeeTripMap.get(member.employeeID).push({
                                tripCode: trip.tripCode,
                                approvedAmount: approvedAmount
                            });
                        }

                        allEmployeeData.push(employeeData);
                    });

                    // V2: Fallback - 處理舊的 Employees 資料（沒有員工綁定的成員）
                    const employees = detailResult.employees || [];
                    const existingMembers = new Set(tripMembers.map(m => m.memberName));

                    employees.forEach(emp => {
                        // 如果該員工已在 TripMembers 中，跳過
                        if (existingMembers.has(emp.name)) return;

                        const empExpenses = expenses.filter(e =>
                            e.employeeName === emp.name || e.belongTo === emp.name
                        );

                        const totalAmount = empExpenses.reduce((sum, e) => sum + (Number(e.amountNTD) || 0), 0);
                        const approvedAmount = empExpenses
                            .filter(e => e.expenseStatus === 'approved')
                            .reduce((sum, e) => sum + (Number(e.amountNTD) || 0), 0);

                        const pendingCount = empExpenses.filter(e =>
                            e.expenseStatus === 'pending' || e.expenseStatus === 'modified_pending'
                        ).length;
                        const approvedCount = empExpenses.filter(e => e.expenseStatus === 'approved').length;

                        let subsidyStatus = '未提交';
                        if (empExpenses.length > 0) {
                            if (approvedCount === empExpenses.length) {
                                subsidyStatus = '已核銷';
                            } else if (pendingCount > 0) {
                                subsidyStatus = '審核中';
                            } else {
                                subsidyStatus = '部分核銷';
                            }
                        }

                        allEmployeeData.push({
                            name: emp.name,
                            employeeID: '',
                            email: '',
                            department: emp.department || '',
                            tripCode: trip.tripCode,
                            travelDate: `${tripData.startDate || ''} ~${tripData.endDate || ''} `,
                            subsidyStatus: subsidyStatus,
                            approvedAmount: approvedAmount,
                            totalAmount: totalAmount,
                            expenseCount: empExpenses.length,
                            monthlyLimit: 0,
                            usedAmount: 0
                        });
                    });
                }
            } catch (err) {
                console.error(`Failed to load detail for ${trip.tripCode}: `, err);
            }
        }

        // 計算跨旅程總計
        allEmployeeData.forEach(emp => {
            if (emp.employeeID && employeeTripMap.has(emp.employeeID)) {
                const trips = employeeTripMap.get(emp.employeeID);
                emp.crossTripTotal = trips.reduce((sum, t) => sum + t.approvedAmount, 0);
            } else {
                emp.crossTripTotal = 0;
            }
        });

        renderEmployeeList();
    } catch (error) {
        tbody.innerHTML = `
        < tr >
        <td colspan="9" class="px-4 py-8 text-center text-red-400">
            <i class="fa-solid fa-circle-exclamation text-xl mb-2"></i>
            <p class="text-sm">載入失敗：${error.message}</p>
        </td>
            </tr >
        `;
    }
}

function filterEmployeeList() {
    employeeListTripFilter = document.getElementById('employeeListTripFilter').value;
    renderEmployeeList();
}

function renderEmployeeList() {
    const tbody = document.getElementById('employeeListBody');
    const countEl = document.getElementById('employeeListCount');

    let filtered = allEmployeeData;
    if (employeeListTripFilter !== 'all') {
        filtered = allEmployeeData.filter(e => e.tripCode === employeeListTripFilter);
    }

    countEl.textContent = `${filtered.length} 筆`;

    if (filtered.length === 0) {
        tbody.innerHTML = `
        < tr >
        <td colspan="9" class="px-4 py-8 text-center text-gray-400">
            <i class="fa-solid fa-user-group text-4xl mb-3 opacity-30"></i>
            <p class="text-sm">沒有符合條件的員工資料</p>
        </td>
            </tr >
        `;
        return;
    }

    tbody.innerHTML = filtered.map(emp => `
        < tr class="hover:bg-gray-50" >
            <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                        ${emp.name.charAt(0)}
                    </div>
                    <div>
                        <span class="font-medium">${emp.name}</span>
                        ${emp.department ? `<div class="text-[10px] text-gray-400">${emp.department}</div>` : ''}
                    </div>
                </div>
            </td>
            <td class="px-4 py-3">
                ${emp.employeeID ?
            `<span class="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${emp.employeeID}</span>` :
            `<span class="text-gray-300 text-xs">未綁定</span>`
        }
            </td>
            <td class="px-4 py-3 text-gray-600 text-xs">
                ${emp.email || `<span class="text-gray-300">-</span>`}
            </td>
            <td class="px-4 py-3 text-gray-500 font-mono text-xs">${emp.tripCode}</td>
            <td class="px-4 py-3 text-gray-500 text-xs">${emp.travelDate}</td>
            <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${emp.subsidyStatus === '已核銷' ? 'bg-green-100 text-green-700' :
            emp.subsidyStatus === '審核中' ? 'bg-yellow-100 text-yellow-700' :
                emp.subsidyStatus === '部分核銷' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
        }">
                    ${emp.subsidyStatus}
                </span>
                ${emp.expenseCount > 0 ?
            `<span class="text-[10px] text-gray-400 block mt-1">${emp.expenseCount} 筆費用</span>` :
            ''
        }
            </td>
            <td class="px-4 py-3 text-right font-mono text-sm font-bold text-green-600">
                NT$ ${emp.approvedAmount.toLocaleString()}
            </td>
            <td class="px-4 py-3 text-right">
                ${emp.employeeID ?
            `<span class="font-mono text-sm font-bold text-purple-600">NT$ ${emp.crossTripTotal.toLocaleString()}</span>` :
            `<span class="text-gray-300 text-xs">-</span>`
        }
            </td>
            <td class="px-4 py-3 text-right">
                ${emp.monthlyLimit > 0 ?
            `<div class="text-sm text-gray-500">NT$ ${emp.monthlyLimit.toLocaleString()}</div>
                     <div class="text-[10px] text-gray-400 mt-0.5">
                        已用: ${((emp.crossTripTotal / emp.monthlyLimit) * 100).toFixed(0)}%
                     </div>` :
            `<span class="text-gray-300 text-xs">-</span>`
        }
            </td>
        </tr >
        `).join('');
}

// ============================================
// V3: 團長專用 Excel 匯出功能
// ============================================

function leaderExportToExcel() {
    if (!currentExpenses || currentExpenses.length === 0) {
        alert('尚無費用記錄，無法產生申請單');
        return;
    }

    // 員工資料可能為空（舊版資料或團長模式），不阻擋匯出
    if (!currentEmployees || currentEmployees.length === 0) {
        console.warn('員工清單為空，將從費用記錄中推導員工資料');
    }

    showToast('正在產生 Excel 檔案...', 'info');

    setTimeout(() => {
        try {
            generateLeaderExcelFile();
        } catch (error) {
            console.error('Excel generation error:', error);
            alert('產生 Excel 時發生錯誤：' + error.message);
        }
    }, 100);
}

function generateLeaderExcelFile() {
    const trip = currentTripData;
    const expenses = currentExpenses;

    // Helper for borders
    const borderStyle = { style: 'thin', color: { rgb: "000000" } };
    const allBorders = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle
    };

    // Helper for styles
    const styles = {
        title: {
            font: { bold: true, sz: 16 },
            alignment: { horizontal: "center", vertical: "center" }
        },
        headerCenter: {
            font: { bold: true },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: allBorders,
            fill: { fgColor: { rgb: "EFEFEF" } } // Optional gray background
        },
        cellCenter: {
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: allBorders
        },
        cellLeft: {
            alignment: { horizontal: "left", vertical: "center", wrapText: true },
            border: allBorders
        },
        cellRight: {
            alignment: { horizontal: "right", vertical: "center" },
            border: allBorders
        },
        labelRight: {
            font: { bold: true },
            alignment: { horizontal: "right", vertical: "center" }
            // No borders for layout labels outside tables
        }
    };

    // 1. Prepare Data Grid (100 rows x 9 columns A-I)
    // We will construct an Array of Arrays (AoA) for basic data, then apply merges and styles to the sheet object.
    // Columns: A(0), B(1), C(2), D(3), E(4), F(5), G(6), H(7), I(8)

    // --- Row 1: Title ---
    const wsData = [
        ['員工自助旅遊費用申請單  Expenses Application', '', '', '', '', '', '', '', '']
    ];

    // --- Row 2: Payment Method ---
    // A2-E2 Empty, F2 label, G2-I2 value (Merged?)
    // Based on image: "匯款方式(下拉選單)→" spans F, G is Value?
    // Let's assume F2 label, G2 Value.
    const row2 = ['', '', '', '', '', '匯款方式(下拉選單)→', trip.paymentMethod || '', '', ''];
    wsData.push(row2);

    // --- Row 3-9: Subsidy Info Block ---
    // A3-C9 Merged: "補助資訊..."
    // D3: Label, E3: Value ...

    // Row 3
    const row3 = ['補助資訊\n(人員、金額)', '', '', '出發日期', trip.startDate || '', '', '結束日期', trip.endDate || '', ''];
    wsData.push(row3);

    // Row 4
    const row4 = ['', '', '', '補助額度', Number(trip.subsidyAmount || 0), '', '補助方式\n(下拉選單)', trip.subsidyMethod || '', ''];
    wsData.push(row4);

    // Row 5: Employee Table Header within Info Block
    // Cols: D:Name, E:Apply?, F:Tenure, G:Ratio, H:SubAmt, I:RemitAmt
    const row5 = ['', '', '', '員工姓名', '申請補助\n(下拉選單)', '請填滿一年\n或到職日', '補助比例', '補助金額', '匯款金額'];
    wsData.push(row5);

    // --- Build Employee List from V3 TripMembers + EmployeesMaster ---
    // Build employeesMaster lookup map by name (since tripMembers has memberName)
    const masterByName = {};
    const masterById = {};
    currentEmployeesMaster.forEach(emp => {
        if (emp.name) masterByName[emp.name] = emp;
        if (emp.employeeID) masterById[emp.employeeID] = emp;
    });

    // Build employees array from tripMembers (V3) or fallback to expenses
    const empList = [];
    if (currentTripMembers && currentTripMembers.length > 0) {
        currentTripMembers.forEach(member => {
            // Look up master data by employeeID first, then by name
            const master = (member.employeeID && masterById[member.employeeID])
                || masterByName[member.memberName]
                || {};
            empList.push({
                name: master.name || member.memberName,  // 優先使用主檔姓名，fallback 到 memberName
                memberName: member.memberName,  // 保留原始 memberName 用於比對費用
                employeeID: member.employeeID || master.employeeID || '',
                role: member.role || 'Member',
                startDate: master.startDate || '',
                monthlyLimit: Number(master.monthlyLimit) || 10000,
                isActive: master.isActive
            });
        });
    } else {
        // Fallback: derive unique employees from expenses
        const uniqueNames = [...new Set(expenses.map(e => e.employeeName).filter(n => n))];
        uniqueNames.forEach(name => {
            const master = masterByName[name] || {};
            empList.push({
                name: master.name || name,
                memberName: name,
                employeeID: master.employeeID || '',
                role: 'Member',
                startDate: master.startDate || '',
                monthlyLimit: Number(master.monthlyLimit) || 10000,
                isActive: master.isActive
            });
        });
    }

    // Calculate subsidy for each employee
    const empMaxRows = 4;   // minimum rows for template structure
    let currentEmpRow = 0;
    let totalSubsidy = 0;

    empList.forEach(emp => {
        // Check if member has any expense amount (單據金額)
        const memberExpenses = expenses.filter(e =>
            e.employeeName === emp.memberName || e.belongTo === emp.memberName
        );
        const memberExpTotal = memberExpenses.reduce((s, e) => s + (Number(e.amountNTD) || 0), 0);
        const hasExpense = memberExpTotal > 0;

        // 申請補助：有單據金額就是 Y，沒有就是 N
        const applyStatus = hasExpense ? 'y' : 'n';

        // Calculate subsidy ratio based on 入職日期
        let ratio = 0;
        let startDateDisplay = '';

        if (hasExpense && emp.startDate && trip.startDate) {
            const startDate = new Date(emp.startDate);
            const tripDate = new Date(trip.startDate);
            const daysDiff = (tripDate - startDate) / (1000 * 60 * 60 * 24);

            if (daysDiff >= 365) {
                ratio = 1;
                startDateDisplay = '滿一年';
            } else if (daysDiff > 0) {
                ratio = Math.round((daysDiff / 365) * 100) / 100;
                startDateDisplay = emp.startDate;
            } else {
                startDateDisplay = emp.startDate;
            }
        } else if (emp.startDate) {
            startDateDisplay = emp.startDate;
        }

        // Subsidy amount (only if applying)
        const subsidyAmount = hasExpense ? Math.round(emp.monthlyLimit * ratio) : 0;
        totalSubsidy += subsidyAmount;

        const ratioDisplay = Math.round(ratio * 100) + '%';

        const row = ['', '', '', emp.name, applyStatus, startDateDisplay, ratioDisplay, subsidyAmount, subsidyAmount];
        wsData.push(row);
        currentEmpRow++;
    });

    // Fill remaining empty rows to maintain structure if less than 4
    while (currentEmpRow < empMaxRows) {
        wsData.push(['', '', '', '', '', '', '', '', '']);
        currentEmpRow++;
    }

    // --- Note & Subtotal ---
    const rowNote = ['備註：小計金額因補助比例不同而可能產生無法除盡的狀況，若導致小計金額與單據金額不一致實屬正常，若選擇統一匯款，則將以單據金額為主；若選擇分開匯款，請指定未除盡款項之匯款對象，否則視為放棄。', '', '', '', '', '', '', '小計', totalSubsidy];
    wsData.push(rowNote);

    // --- Row 11: Location ---
    // A11 "地點 Location", B11-I11 Value
    const rowLoc = ['地點\nLocation', trip.location || '', '', '', '', '', '', '', ''];
    wsData.push(rowLoc);

    // --- Row 12: Period ---
    // A12 "期間 Period", B12-I12 Value
    const rowPeriod = ['期間Period', `${trip.startDate || ''} ~${trip.endDate || ''} `, '', '', '', '', '', '', ''];
    wsData.push(rowPeriod);

    // --- Row 13: Expenses Header ---
    // A:科目, B:日期, C-E:說明(Merged), F:幣別, G:金額, H:匯率, I:新台幣
    const rowExpHeader = ['科目\nAccount', '日期\nDate', '說明\nDescription', '', '', '幣別\nCurrency', '金額\nAmount', '匯率\nEx. Rate', '新台幣\nNTD'];
    wsData.push(rowExpHeader);

    // --- Expenses Data ---
    // Fixed categories or dynamic? Code used fixed mapping.
    const categories = ['代收轉付收據', '住宿費', '交通費', '餐費', '其他費用'];
    let totalExpense = 0;

    categories.forEach(cat => {
        // Filter expenses
        const catExps = expenses.filter(e => e.category === cat);
        // Ensure at least one line per category
        const count = Math.max(catExps.length, 1);

        for (let i = 0; i < count; i++) {
            const exp = catExps[i]; // might be undefined
            const amount = exp ? (Number(exp.amount) || Number(exp.amountNTD) || 0) : '';
            const rate = exp ? (Number(exp.exchangeRate) || 1) : '';
            const ntd = exp ? (Number(exp.amountNTD) || 0) : '';
            totalExpense += (Number(ntd) || 0);

            // A col: Category name only on first row of block? 
            // Better: merge A col for the block? Or repeat?
            // Image shows Category Merged vertically.

            const r = [
                i === 0 ? cat : '', // Label
                exp ? (exp.date || '') : '',
                exp ? (exp.description || '') : '',
                '', '', // C-E merged
                exp ? (exp.currency || 'TWD') : '',
                amount,
                rate,
                ntd
            ];
            wsData.push(r);
        }
    });

    // --- Footer Totals ---
    const totalClaim = Math.min(totalExpense, totalSubsidy);
    wsData.push(['單據費用合計 Total Amount', '', '', '', '', '', '', '', totalExpense]);
    wsData.push(['總申請金額 Apply for amortise', '', '', '', '', '', '', '', totalClaim]);
    wsData.push(['付款總金額 Apply for amortise', '', '', '', '', '', '', '', totalSubsidy]); // Logic? "付款總金額" same as requested?

    // --- Signatures ---
    wsData.push([]); // Spacer
    wsData.push(['申請人:', '', '', '', '', '', 'Date :', '', new Date().toISOString().split('T')[0]]);
    // Merges: A-B? C-F?

    // 2. Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 3. Define Merges
    const merges = [];

    // Title (A1:I1) -> s:{r:0, c:0}, e:{r:0, c:8}
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });

    // Payment info (F2 Label, G2-I2 Value) -> actually row index 1
    // Let's say "匯款方式" is F2
    // Value G2:I2 ?
    merges.push({ s: { r: 1, c: 6 }, e: { r: 1, c: 8 } });

    const infoBlockEndRow = 2 + 1 + 1 + Math.max(empList.length, 4) - 1;
    // Row indices:
    // 0: Title
    // 1: Payment
    // 2: "補助資訊" + "出發日期"
    // 3: "補助額度"
    // 4: "員工姓名" (Header)
    // 5...: Employee Data
    const dataStartRow = 5;
    const dataEndRow = dataStartRow + Math.max(empList.length, 4) - 1;

    // "補助資訊" merges A3 to C(EndRow)
    merges.push({ s: { r: 2, c: 0 }, e: { r: dataEndRow, c: 2 } });

    // Note Block (A(EndRow+1) : H(EndRow+1))
    const noteRowIdx = dataEndRow + 1;
    merges.push({ s: { r: noteRowIdx, c: 0 }, e: { r: noteRowIdx, c: 7 } });

    // Location (A: Loc, B-I Value)
    const locRowIdx = noteRowIdx + 1;
    merges.push({ s: { r: locRowIdx, c: 1 }, e: { r: locRowIdx, c: 8 } });

    // Period
    const perRowIdx = locRowIdx + 1;
    merges.push({ s: { r: perRowIdx, c: 1 }, e: { r: perRowIdx, c: 8 } });

    // Expense Header
    const expHeadRowIdx = perRowIdx + 1;
    // Description C-E
    merges.push({ s: { r: expHeadRowIdx, c: 2 }, e: { r: expHeadRowIdx, c: 4 } });

    // Expense Data Merges
    let currentRow = expHeadRowIdx + 1;
    categories.forEach(cat => {
        const catExps = expenses.filter(e => e.category === cat);
        const count = Math.max(catExps.length, 1);

        // Merge Category Name (Column A) vertically
        if (count > 1) {
            merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow + count - 1, c: 0 } });
        }

        // Merge Description (C-E) horizontally for each row
        for (let i = 0; i < count; i++) {
            merges.push({ s: { r: currentRow + i, c: 2 }, e: { r: currentRow + i, c: 4 } });
        }

        currentRow += count;
    });

    // Totals Merges (A-H merged label?)
    // "單據費用合計" A-H, Value I
    for (let i = 0; i < 3; i++) {
        merges.push({ s: { r: currentRow + i, c: 0 }, e: { r: currentRow + i, c: 7 } });
    }

    // Signature Merges
    const sigRow = currentRow + 4; // Spacer + 1
    // A: Last label?

    ws['!merges'] = merges;

    // 4. Apply Styles
    // We iterate over the range and apply styles
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' }; // ensure cell exists

            let cellStyle = { ...styles.cellCenter }; // Default

            // --- Specific Styles ---

            // Title (Row 0)
            if (R === 0) cellStyle = styles.title;

            // Payment Row (Row 1) (No border usually? Or whole table?)
            // Let's apply borders to everything inside the "Table" areas.

            // Info Block + Data
            if (R >= 2 && R <= dataEndRow) {
                if (C >= 0 && C <= 2) {
                    // "補助資訊" - centered
                    cellStyle = styles.cellCenter;
                } else {
                    // Data part
                    if (R === 4) cellStyle = styles.headerCenter; // Table header
                    else cellStyle = styles.cellCenter;
                }
            }

            // Note (Row noteRowIdx)
            if (R === noteRowIdx) {
                if (C === 0) {
                    cellStyle = { ...styles.cellLeft, alignment: { wrapText: true, horizontal: 'left', vertical: 'top' } };
                    // Small font for note
                    cellStyle.font = { sz: 9 };
                }
                if (C === 8) cellStyle = styles.cellRight;
            }

            // Location / Period
            if (R === locRowIdx || R === perRowIdx) {
                if (C === 0) cellStyle = styles.cellCenter; // Label
                else cellStyle = styles.cellLeft;      // Value
            }

            // Expense Header
            if (R === expHeadRowIdx) cellStyle = styles.headerCenter;

            // Expense Data
            if (R > expHeadRowIdx && R < currentRow) {
                // Formatting specific columns
                if (C === 0) cellStyle = styles.cellCenter; // Category
                if (C === 2) cellStyle = styles.cellLeft;   // Desc
                if (C >= 5) cellStyle = styles.cellRight;   // Numbers
            }

            // Bottom Totals
            if (R >= currentRow && R < currentRow + 3) {
                if (C === 0) cellStyle = styles.cellRight; // Label aligned right
                if (C === 8) cellStyle = styles.cellRight; // Value
            }

            ws[cellRef].s = cellStyle;
        }
    }

    // 5. Column Widths
    ws['!cols'] = [
        { wch: 12 }, // A Account
        { wch: 12 }, // B Date
        { wch: 15 }, // C Desc
        { wch: 15 }, // D
        { wch: 10 }, // E
        { wch: 10 }, // F Currency
        { wch: 12 }, // G Amount
        { wch: 8 },  // H Rate
        { wch: 12 }  // I NTD
    ];

    // Export
    const fileName = `員工自助旅遊費用申請單_${trip.location || '旅遊'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile({ SheetNames: ['員工旅遊'], Sheets: { '員工旅遊': ws } }, fileName);

    showToast('Excel 申請單已產生！', 'success');
}

// 註冊 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Admin SW registered:', reg.scope))
            .catch(err => console.log('Admin SW registration failed:', err));
    });
}
