// 旅遊費用申請 APP - JavaScript

// 預設 API URL（零設定）
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxbnPEwPq0MjVcwk4pl6fSxhn8cGu--vY6gNN7KrjgaUMw6ubo8xOZb2IEbygwCAXBs/exec';

// 全域資料
let appData = {
    tripCode: null,
    role: null,             // 'leader' | 'member' | null
    userName: '',           // 持久化使用者姓名
    tripInfo: {
        location: '',
        startDate: '',
        endDate: '',
        subsidyAmount: 10000,
        paymentMethod: '統一匯款',
        subsidyMethod: '實支實付'
    },
    isLocked: false,        // 結案鎖定狀態
    employees: [],
    expenses: [],
    localLastModified: null,  // 本地最後修改時間
    lastSyncTime: null        // 最後同步時間戳
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
document.addEventListener('DOMContentLoaded', function () {
    loadData();

    // 若無角色資料，顯示 Onboarding
    if (!appData.role) {
        showOnboarding();
    } else {
        hideOnboarding();
        updateUI();
        updateHeader();
        updateTripTab();
        updateSettingsVisibility();
    }

    setupEventListeners();

    // 設定今天為預設日期
    const today = new Date().toISOString().split('T')[0];
    const expenseDateEl = document.getElementById('expenseDate');
    if (expenseDateEl) expenseDateEl.value = today;

    // 載入 GAS URL 設定
    loadGasUrl();

    // 背景檢查 config.json 是否有新版 API URL
    checkConfigUpdate();

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
    document.getElementById('expenseCurrency').addEventListener('change', function () {
        const selectedOption = this.options[this.selectedIndex];
        const rate = selectedOption.dataset.rate;
        document.getElementById('expenseRate').value = rate;
        updateNTDPreview();
    });

    // 金額或匯率改變時更新預覽
    document.getElementById('expenseAmount').addEventListener('input', updateNTDPreview);
    document.getElementById('expenseRate').addEventListener('input', updateNTDPreview);

    // 單據照片上傳預覽
    document.getElementById('receiptPhoto').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                document.getElementById('photoPreviewImg').src = e.target.result;
                document.getElementById('photoPreview').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    // 表單提交
    document.getElementById('expenseForm').addEventListener('submit', addExpense);
    document.getElementById('employeeForm').addEventListener('submit', addEmployee);

    // 提交人姓名更新 Header + appData
    const submitterNameInput = document.getElementById('submitterName');
    if (submitterNameInput) {
        submitterNameInput.addEventListener('change', function () {
            const name = this.value.trim();
            if (name) {
                appData.userName = name;
                saveData();
                updateHeader();
                // 同步到設定頁的暱稱欄
                const settingsUserName = document.getElementById('settingsUserName');
                if (settingsUserName) settingsUserName.value = name;
            }
        });
    }
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
    document.getElementById('tripTab').classList.toggle('hidden', tab !== 'trip');
    document.getElementById('settingsTab').classList.toggle('hidden', tab !== 'settings');

    // FAB 只在記帳 Tab 顯示
    const fab = document.getElementById('fabButton');
    if (fab) fab.classList.toggle('hidden', tab !== 'home');

    // 更新按鈕狀態（active = indigo-600, inactive = gray-400）
    const tabs = {
        home: document.getElementById('homeTabBtn'),
        trip: document.getElementById('tripTabBtn'),
        settings: document.getElementById('settingsTabBtn')
    };
    Object.keys(tabs).forEach(key => {
        const btn = tabs[key];
        if (!btn) return;
        if (key === tab) {
            btn.classList.remove('text-gray-400', 'hover:text-gray-600');
            btn.classList.add('text-indigo-600');
        } else {
            btn.classList.remove('text-indigo-600');
            btn.classList.add('text-gray-400', 'hover:text-gray-600');
        }
    });
}

// FAB 按鈕點擊（鎖定時禁止新增）
function handleFabClick() {
    if (appData.isLocked) {
        showToast('此旅遊已結案鎖定，無法新增費用', 'warning');
        return;
    }
    showAddExpenseModal();
}

// ============================================
// Onboarding 引導流程
// ============================================

function showOnboarding() {
    const screen = document.getElementById('onboardingScreen');
    const mainApp = document.getElementById('mainApp');
    if (screen) screen.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
    // 若有舊的 userName 預填
    const nameInput = document.getElementById('onboardingName');
    if (nameInput && appData.userName) nameInput.value = appData.userName;
}

function hideOnboarding() {
    const screen = document.getElementById('onboardingScreen');
    const mainApp = document.getElementById('mainApp');
    if (screen) screen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
}

function selectRole(role) {
    const nameInput = document.getElementById('onboardingName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        showToast('請先輸入您的姓名', 'warning');
        if (nameInput) nameInput.focus();
        return;
    }

    if (role === 'leader') {
        appData.role = 'leader';
        appData.userName = name;
        appData.tripCode = generateTripCode();
        completeOnboarding();
    } else if (role === 'member') {
        // 顯示 TripCode 輸入區
        const roleSection = document.getElementById('onboardingRoleSection');
        const tripCodeSection = document.getElementById('onboardingTripCodeSection');
        if (roleSection) roleSection.classList.add('hidden');
        if (tripCodeSection) tripCodeSection.classList.remove('hidden');
        // 暫存 userName
        appData.userName = name;
        appData.role = 'member';
    }
}

function cancelTripCodeInput() {
    const roleSection = document.getElementById('onboardingRoleSection');
    const tripCodeSection = document.getElementById('onboardingTripCodeSection');
    if (roleSection) roleSection.classList.remove('hidden');
    if (tripCodeSection) tripCodeSection.classList.add('hidden');
    appData.role = null;
}

function confirmJoinTrip() {
    const tripCodeInput = document.getElementById('onboardingTripCode');
    const code = tripCodeInput ? tripCodeInput.value.trim().toUpperCase() : '';
    if (!code) {
        showToast('請輸入 Trip Code', 'warning');
        if (tripCodeInput) tripCodeInput.focus();
        return;
    }
    appData.tripCode = code;
    completeOnboarding();
}

function generateTripCode() {
    return 'TRIP-' + Math.floor(1000 + Math.random() * 9000);
}

function completeOnboarding() {
    saveData();
    hideOnboarding();
    updateUI();
    updateHeader();
    updateTripTab();
    updateSettingsVisibility();
    updateTripCodeBanner();

    if (appData.role === 'leader') {
        showToast('已建立旅遊 ' + appData.tripCode, 'success');
    } else if (appData.role === 'member') {
        showToast('已加入旅遊 ' + appData.tripCode, 'success');
        // 團員自動觸發下載同步
        setTimeout(() => downloadFromCloud(), 500);
    }
}

// ============================================
// Header 更新
// ============================================

function updateHeader() {
    const headerRole = document.getElementById('headerRole');
    const headerUserName = document.getElementById('headerUserName');
    const userAvatar = document.getElementById('userAvatar');

    if (headerRole) {
        if (appData.role === 'leader') headerRole.textContent = '團長';
        else if (appData.role === 'member') headerRole.textContent = '團員';
        else headerRole.textContent = '員旅費用通';
    }

    const name = appData.userName || '使用者';
    if (headerUserName) headerUserName.textContent = name;
    if (userAvatar) userAvatar.textContent = name.charAt(0);

    // TripCode 顯示在 header（可複製）
    const headerTripCode = document.getElementById('headerTripCode');
    if (headerTripCode) {
        if (appData.tripCode) {
            headerTripCode.textContent = appData.tripCode;
            headerTripCode.classList.remove('hidden');
        } else {
            headerTripCode.classList.add('hidden');
        }
    }
}

function copyTripCode() {
    if (!appData.tripCode) return;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(appData.tripCode).then(() => {
            showToast('Trip Code 已複製', 'success');
        });
    } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = appData.tripCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Trip Code 已複製', 'success');
    }
}

// ============================================
// 旅遊 Tab 差異化
// ============================================

function updateTripTab() {
    const leaderView = document.getElementById('tripTabLeader');
    const memberView = document.getElementById('tripTabMember');

    if (appData.role === 'leader') {
        if (leaderView) leaderView.classList.remove('hidden');
        if (memberView) memberView.classList.add('hidden');
        updateLeaderTripTab();
    } else if (appData.role === 'member') {
        if (leaderView) leaderView.classList.add('hidden');
        if (memberView) memberView.classList.remove('hidden');
        updateMemberTripTab();
    }
}

function updateLeaderTripTab() {
    // TripCode 分享卡片
    const shareTripCode = document.getElementById('leaderTripCode');
    if (shareTripCode) shareTripCode.textContent = appData.tripCode || '---';

    // 旅遊資訊（可編輯）
    const leaderTripName = document.getElementById('leaderTripName');
    const leaderStartDate = document.getElementById('leaderStartDate');
    const leaderEndDate = document.getElementById('leaderEndDate');
    if (leaderTripName) leaderTripName.value = appData.tripInfo.location || '';
    if (leaderStartDate) leaderStartDate.value = appData.tripInfo.startDate || '';
    if (leaderEndDate) leaderEndDate.value = appData.tripInfo.endDate || '';

    // 鎖定狀態判斷上傳按鈕
    const leaderUploadBtn = document.getElementById('leaderUploadBtn');
    if (leaderUploadBtn) {
        if (appData.isLocked) {
            leaderUploadBtn.disabled = true;
            leaderUploadBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            leaderUploadBtn.disabled = false;
            leaderUploadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    // 團員列表
    updateLeaderEmployeeList();
}

function updateLeaderEmployeeList() {
    const container = document.getElementById('leaderEmployeeList');
    if (!container) return;

    if (appData.employees.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">尚無團員資料</div>';
        return;
    }

    container.innerHTML = appData.employees.map(emp => `
        <div class="flex items-center gap-3 p-3 border-b border-gray-50 last:border-b-0">
            <div class="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">${emp.name.charAt(0)}</div>
            <div class="flex-1">
                <div class="font-semibold text-sm">${emp.name}</div>
                <div class="text-xs text-gray-400">
                    ${emp.apply === 'y' ? '<i class="fa-solid fa-check text-green-500 mr-1"></i>申請補助' : '<i class="fa-solid fa-xmark text-gray-400 mr-1"></i>不申請'}
                </div>
            </div>
        </div>
    `).join('');
}

function updateMemberTripTab() {
    // 旅遊資訊（唯讀）
    const memberTripLocation = document.getElementById('memberTripLocation');
    const memberTripDate = document.getElementById('memberTripDate');
    if (memberTripLocation) memberTripLocation.textContent = appData.tripInfo.location || '未設定';
    if (memberTripDate) {
        if (appData.tripInfo.startDate && appData.tripInfo.endDate) {
            memberTripDate.innerHTML = '<i class="fa-regular fa-calendar mr-1"></i> ' + appData.tripInfo.startDate + ' ~ ' + appData.tripInfo.endDate;
        } else {
            memberTripDate.innerHTML = '<i class="fa-regular fa-calendar mr-1"></i> 未設定日期';
        }
    }

    // 審核狀態看板
    updateAuditStatus();

    // 團員名單（唯讀）
    updateMemberEmployeeList();
}

function updateAuditStatus() {
    let pending = 0, approved = 0, rejected = 0;
    appData.expenses.forEach(exp => {
        const status = exp.expenseStatus || 'pending';
        if (status === 'approved') approved++;
        else if (status === 'rejected' || status === 'needs_revision') rejected++;
        else pending++;
    });

    const pendingEl = document.getElementById('auditPending');
    const approvedEl = document.getElementById('auditApproved');
    const rejectedEl = document.getElementById('auditRejected');
    if (pendingEl) pendingEl.textContent = pending;
    if (approvedEl) approvedEl.textContent = approved;
    if (rejectedEl) rejectedEl.textContent = rejected;
}

function filterRejected() {
    switchTab('home');
    // 簡易篩選：利用 showToast 提示，待未來擴充
    showToast('顯示被退回的費用項目', 'info');
    // Scroll to first rejected item
    setTimeout(() => {
        const cards = document.querySelectorAll('#expenseList .bg-red-100');
        if (cards.length > 0) cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
}

function updateMemberEmployeeList() {
    const container = document.getElementById('memberEmployeeList');
    if (!container) return;

    if (appData.employees.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">尚無團員資料</div>';
        return;
    }

    container.innerHTML = appData.employees.map(emp => `
        <div class="flex items-center gap-3 p-3 border-b border-gray-50 last:border-b-0">
            <div class="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">${emp.name.charAt(0)}</div>
            <div class="font-semibold text-sm">${emp.name}</div>
        </div>
    `).join('');
}

function saveLeaderTripInfo() {
    const name = document.getElementById('leaderTripName');
    const start = document.getElementById('leaderStartDate');
    const end = document.getElementById('leaderEndDate');
    if (name) appData.tripInfo.location = name.value.trim();
    if (start) appData.tripInfo.startDate = start.value;
    if (end) appData.tripInfo.endDate = end.value;
    saveData();
    updateUI();
    updateTripTab();
    showToast('旅遊資訊已儲存', 'success');
}

// ============================================
// 設定 Tab 角色差異顯示
// ============================================

function updateSettingsVisibility() {
    const leaderSections = document.querySelectorAll('.settings-leader-only');
    const memberSections = document.querySelectorAll('.settings-member-only');

    if (appData.role === 'leader') {
        leaderSections.forEach(el => el.classList.remove('hidden'));
        memberSections.forEach(el => el.classList.add('hidden'));
    } else if (appData.role === 'member') {
        leaderSections.forEach(el => el.classList.add('hidden'));
        memberSections.forEach(el => el.classList.remove('hidden'));
    }
}

function resetTrip() {
    if (!confirm('確定要離開並重設旅遊嗎？\n\n此操作將清除所有本地資料（費用紀錄、旅遊設定），無法復原。')) {
        return;
    }
    localStorage.removeItem('travelExpenseApp');
    localStorage.removeItem('gasWebAppUrl');
    localStorage.removeItem('lastTripCode');
    location.reload();
}

function saveUserName() {
    const input = document.getElementById('settingsUserName');
    if (input) {
        appData.userName = input.value.trim();
        saveData();
        updateHeader();
        // 同步更新 submitterName
        const submitterName = document.getElementById('submitterName');
        if (submitterName) submitterName.value = appData.userName;
        showToast('暱稱已更新', 'success');
    }
}

function manualCheckUpdate() {
    checkConfigUpdate(true);
}

function toggleAdvancedApi() {
    const section = document.getElementById('advancedApiSection');
    if (section) section.classList.toggle('hidden');
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
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
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
        deletePhoto(id).catch(() => { });
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
    updateTripTabInfo();
    updateExpenseList();
    updateEmployeeList();
    updateStatistics();
    loadTripSettings();
    updateSyncStatus();
    updateTripTabInfo();
    updateHeader();
    updateTripTab();
    updateSettingsVisibility();
}

// 更新旅遊 Tab 資訊
function updateTripTabInfo() {
    const info = appData.tripInfo;

    // 團員視角：唯讀資訊
    const memberLocationEl = document.getElementById('memberTripLocation');
    if (memberLocationEl) {
        memberLocationEl.textContent = info.location || '未設定旅遊地點';
    }

    const memberDateEl = document.getElementById('memberTripDate');
    if (memberDateEl) {
        if (info.startDate && info.endDate) {
            memberDateEl.innerHTML = `<i class="fa-regular fa-calendar mr-1"></i> ${info.startDate} ~ ${info.endDate}`;
        } else {
            memberDateEl.innerHTML = `<i class="fa-regular fa-calendar mr-1"></i> 未設定日期`;
        }
    }

    // 同步 submitterName input 與 appData.userName
    const submitterName = document.getElementById('submitterName');
    if (submitterName && appData.userName) {
        submitterName.value = appData.userName;
    }

    // 同步 settings 頁暱稱
    const settingsUserName = document.getElementById('settingsUserName');
    if (settingsUserName && appData.userName) {
        settingsUserName.value = appData.userName;
    }
}

// 更新同步狀態指示燈
function updateSyncStatus() {
    const dot = document.getElementById('syncStatusDot');
    const text = document.getElementById('syncStatusText');
    const indicator = document.getElementById('syncStatusIndicator');
    const tripTabDot = document.getElementById('tripTabDot');
    const unsyncedBadge = document.getElementById('unsyncedBadge');
    const lockBanner = document.getElementById('lockBanner');
    const fabButton = document.getElementById('fabButton');
    if (!dot || !text || !indicator) return;

    if (appData.isLocked) {
        // 已結案鎖定
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-500 border border-gray-200';
        dot.className = 'w-2 h-2 rounded-full bg-gray-400';
        text.textContent = '已結案';
        if (lockBanner) lockBanner.classList.remove('hidden');
        if (fabButton) {
            fabButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.add('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.add('hidden');
    } else if (!appData.lastSyncTime || (appData.localLastModified && appData.localLastModified > appData.lastSyncTime)) {
        // 有未備份的本地修改
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 text-xs font-medium text-yellow-700 border border-yellow-200';
        dot.className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';
        text.textContent = '未備份';
        if (lockBanner) lockBanner.classList.add('hidden');
        if (fabButton) {
            fabButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.remove('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.remove('hidden');
    } else {
        // 已同步
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-xs font-medium text-green-700 border border-green-200';
        dot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
        text.textContent = '已同步';
        if (lockBanner) lockBanner.classList.add('hidden');
        if (fabButton) {
            fabButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.add('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.add('hidden');
    }
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

    // 更新費用數量
    const countEl = document.getElementById('expenseCount');
    if (countEl) countEl.textContent = `${appData.expenses.length} 筆資料`;

    if (appData.expenses.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400">
                <i class="fa-solid fa-receipt text-4xl mb-3 opacity-30"></i>
                <p class="text-sm">目前沒有任何費用紀錄</p>
                <p class="text-xs mt-1 text-gray-300">點擊右下角 + 新增</p>
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
                <div class="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1">
                    <i class="fa-regular fa-calendar text-indigo-400"></i> ${formattedDate} (${weekday})
                </div>
                ${expenses.map(expense => createExpenseCard(expense)).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
}

function createExpenseCard(expense) {
    const categoryIcons = {
        '代收轉付收據': { icon: 'fa-file-invoice', bg: 'bg-blue-100', text: 'text-blue-600' },
        '住宿費': { icon: 'fa-bed', bg: 'bg-purple-100', text: 'text-purple-600' },
        '交通費': { icon: 'fa-car', bg: 'bg-green-100', text: 'text-green-600' },
        '餐費': { icon: 'fa-utensils', bg: 'bg-orange-100', text: 'text-orange-600' },
        '其他費用': { icon: 'fa-tag', bg: 'bg-gray-100', text: 'text-gray-600' }
    };

    const catStyle = categoryIcons[expense.category] || categoryIcons['其他費用'];

    // 費用審核狀態 badge
    const expStatusBadge = expense.expenseStatus && expense.expenseStatus !== 'pending'
        ? (() => {
            const sm = {
                'approved': { label: '已通過', cls: 'bg-green-100 text-green-700', icon: 'fa-check-circle' },
                'rejected': { label: '已退回', cls: 'bg-red-100 text-red-700', icon: 'fa-times-circle' },
                'needs_revision': { label: '需補件', cls: 'bg-orange-100 text-orange-700', icon: 'fa-exclamation-circle' }
            };
            const s = sm[expense.expenseStatus] || { label: expense.expenseStatus, cls: 'bg-gray-100 text-gray-700', icon: 'fa-circle-question' };
            return `<span class="text-[10px] px-2 py-0.5 rounded-full ${s.cls} font-medium"><i class="fa-solid ${s.icon} mr-0.5"></i>${s.label}</span>`;
        })()
        : '';

    return `
        <div class="bg-white rounded-xl p-4 mb-2 shadow-sm border border-gray-100">
            <div class="flex items-start gap-3">
                <!-- Category Icon -->
                <div class="w-10 h-10 ${catStyle.bg} rounded-lg flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid ${catStyle.icon} ${catStyle.text}"></i>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-semibold text-sm text-gray-800">${expense.description}</span>
                                ${expStatusBadge}
                            </div>
                            <div class="text-xs text-gray-400 mt-0.5">${expense.category}</div>
                            ${expense.expenseReviewNote ? `<p class="text-xs text-orange-600 mt-1"><i class="fa-solid fa-comment-dots mr-1"></i>${expense.expenseReviewNote}</p>` : ''}
                        </div>
                        <div class="flex items-center gap-1 ml-2 flex-shrink-0">
                            <button onclick="editExpense(${expense.id})" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition" title="編輯">
                                <i class="fa-solid fa-pen-to-square text-xs"></i>
                            </button>
                            <button onclick="deleteExpense(${expense.id})" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="刪除">
                                <i class="fa-solid fa-trash text-xs"></i>
                            </button>
                        </div>
                    </div>

                    <div class="flex items-end justify-between mt-2">
                        <div>
                            <div class="text-lg font-bold text-indigo-600">NT$ ${expense.ntd.toFixed(0).toLocaleString()}</div>
                            <div class="text-[10px] text-gray-400">${expense.currency} ${expense.amount.toLocaleString()} × ${expense.rate}</div>
                        </div>
                        ${expense.photo ? `
                            <div class="ml-3">
                                <img src="${expense.photo}" class="w-14 h-14 rounded-lg object-cover cursor-pointer border border-gray-200" onclick="showImagePreview(${expense.id})">
                            </div>
                        ` : expense.hasPhoto ? `
                            <div class="ml-3 w-14 h-14 bg-gray-50 rounded-lg flex items-center justify-center cursor-pointer border border-gray-200" onclick="showImagePreview(${expense.id})">
                                <i class="fa-solid fa-image text-gray-300"></i>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateEmployeeList() {
    const container = document.getElementById('employeeList');

    const emptyHtml = '<div class="p-4 text-center text-gray-400 text-sm">尚無員工資料</div>';

    if (appData.employees.length === 0) {
        if (container) container.innerHTML = emptyHtml;
        // 同步旅遊 Tab 的角色分流列表
        updateLeaderEmployeeList();
        updateMemberEmployeeList();
        return;
    }

    // 設定頁員工列表（可刪除）
    if (container) {
        const html = appData.employees.map(emp => `
            <div class="flex items-center justify-between p-3 border-b border-gray-50 last:border-b-0">
                <div class="flex items-center gap-3 flex-1">
                    <div class="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">${emp.name.charAt(0)}</div>
                    <div>
                        <div class="font-semibold text-sm">${emp.name}</div>
                        <div class="text-xs text-gray-400">
                            ${emp.apply === 'y' ? '<i class="fa-solid fa-check text-green-500 mr-1"></i>申請補助' : '<i class="fa-solid fa-xmark text-gray-400 mr-1"></i>不申請'}
                            <span class="mx-1">|</span> 到職: ${emp.startDate}
                        </div>
                    </div>
                </div>
                <button onclick="deleteEmployee(${emp.id})" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="刪除">
                    <i class="fa-solid fa-xmark text-xs"></i>
                </button>
            </div>
        `).join('');
        container.innerHTML = html;
    }

    // 同步旅遊 Tab 的角色分流列表
    updateLeaderEmployeeList();
    updateMemberEmployeeList();
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

    // 新 UI 格式：數字不含 NT$ 前綴（前綴已在 HTML 中）
    const totalExpenseEl = document.getElementById('totalExpense');
    if (totalExpenseEl) totalExpenseEl.textContent = totalExpense.toFixed(0).toLocaleString();

    const totalClaimEl = document.getElementById('totalClaim');
    if (totalClaimEl) totalClaimEl.textContent = `$${totalClaim.toFixed(0).toLocaleString()}`;

    const receiptCountEl = document.getElementById('receiptCount');
    if (receiptCountEl) receiptCountEl.textContent = receiptCount;

    // 更新 Trip Code Badge
    const tripCodeBadge = document.getElementById('tripCodeBadge');
    if (tripCodeBadge) {
        if (appData.tripCode) {
            tripCodeBadge.textContent = appData.tripCode;
            tripCodeBadge.classList.remove('hidden');
        } else {
            tripCodeBadge.classList.add('hidden');
        }
    }

    // 更新預算進度條
    const budgetBar = document.getElementById('budgetBar');
    const budgetPercent = document.getElementById('budgetPercent');
    if (budgetBar && totalSubsidy > 0) {
        const pct = Math.min((totalExpense / totalSubsidy) * 100, 100);
        budgetBar.style.width = pct.toFixed(1) + '%';
        if (budgetPercent) budgetPercent.textContent = `${pct.toFixed(0)}% 已使用`;
    } else if (budgetBar) {
        budgetBar.style.width = '0%';
        if (budgetPercent) budgetPercent.textContent = '';
    }
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
        { wch: 2 }, { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
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
function showToast(message, type) {
    const container = document.getElementById('toastContainer');

    // 自動偵測類型
    if (!type) {
        if (message.includes('✓') || message.includes('成功') || message.includes('完成')) type = 'success';
        else if (message.includes('⚠') || message.includes('警告') || message.includes('鎖定')) type = 'warning';
        else if (message.includes('失敗') || message.includes('錯誤')) type = 'error';
        else type = 'info';
    }

    const iconMap = {
        success: 'fa-circle-check text-green-500',
        warning: 'fa-triangle-exclamation text-amber-500',
        error: 'fa-circle-xmark text-red-500',
        info: 'fa-circle-info text-indigo-500'
    };

    // 清除 emoji 前綴
    const cleanMessage = message.replace(/^[✓⏳⚠❌📝]\s*/, '');

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-white text-gray-800 px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 text-sm font-medium border border-gray-100';
    toast.style.animation = 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.innerHTML = `
        <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>
        <span>${cleanMessage}</span>
    `;

    if (container) {
        container.appendChild(toast);
    } else {
        // Fallback: append to body
        toast.classList.add('fixed', 'top-4', 'left-1/2', 'transform', '-translate-x-1/2', 'z-[3000]');
        document.body.appendChild(toast);
    }

    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
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
    // 更新本地最後修改時間
    appData.localLastModified = new Date().toISOString();

    const dataToSave = {
        tripCode: appData.tripCode || null,
        role: appData.role || null,
        userName: appData.userName || '',
        tripInfo: appData.tripInfo,
        isLocked: appData.isLocked || false,
        employees: appData.employees,
        localLastModified: appData.localLastModified,
        lastSyncTime: appData.lastSyncTime || null,
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
            role: parsed.role || null,
            userName: parsed.userName || '',
            tripInfo: parsed.tripInfo || appData.tripInfo,
            isLocked: parsed.isLocked || false,
            employees: parsed.employees || [],
            expenses: parsed.expenses || [],
            localLastModified: parsed.localLastModified || null,
            lastSyncTime: parsed.lastSyncTime || null
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
    }).catch(() => { });
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
    reader.onload = function (e) {
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
        reader.onload = function (e) {
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
            <div class="flex items-center gap-3 flex-1">
                <div class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">${m.memberName.charAt(0)}</div>
                <div>
                    <div class="font-semibold text-sm">${m.memberName}</div>
                    <div class="text-xs text-gray-500">${m.expenses.length} 筆費用 | 匯出日: ${m.exportDate || '-'}</div>
                </div>
            </div>
            <button onclick="removeMergedMember(${i})" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                <i class="fa-solid fa-xmark text-xs"></i>
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
                { wch: 2 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 25 }, { wch: 5 },
                { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
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

// 取得 GAS URL（優先使用 localStorage，否則回傳預設值）
function getGasUrl() {
    return localStorage.getItem('gasWebAppUrl') || DEFAULT_API_URL;
}

// 載入 GAS URL 到輸入框
function loadGasUrl() {
    const url = getGasUrl();
    const input = document.getElementById('gasUrl');
    if (input && url) {
        input.value = url;
    }
}

// 檢查 config.json 是否有新版 API URL
async function checkConfigUpdate(manual = false) {
    try {
        const resp = await fetch('./config.json?t=' + Date.now());
        if (!resp.ok) {
            if (manual) showToast('無法取得設定檔', 'error');
            return;
        }
        const config = await resp.json();
        const currentUrl = getGasUrl();
        const remoteUrl = config.gas_webapp_url;

        if (remoteUrl && remoteUrl !== currentUrl && remoteUrl !== DEFAULT_API_URL) {
            // 顯示 config update modal
            const msgEl = document.getElementById('configUpdateMessage');
            if (msgEl) msgEl.textContent = config.update_message || '發現新版本連線設定，建議更新以確保功能正常。';
            const modal = document.getElementById('configUpdateModal');
            if (modal) modal.classList.remove('hidden');

            // 儲存待更新的 URL 供確認時使用
            window._pendingConfigUrl = remoteUrl;
        } else if (manual) {
            showToast('已是最新版本', 'success');
        }
    } catch (e) {
        if (manual) showToast('檢查更新失敗', 'error');
    }
}

function confirmConfigUpdate() {
    if (window._pendingConfigUrl) {
        localStorage.setItem('gasWebAppUrl', window._pendingConfigUrl);
        location.reload();
    }
}

function dismissConfigUpdate() {
    const modal = document.getElementById('configUpdateModal');
    if (modal) modal.classList.add('hidden');
    window._pendingConfigUrl = null;
}

// 上傳至雲端
async function submitToCloud() {
    // 鎖定檢查
    if (appData.isLocked) {
        showToast('此旅遊已結案鎖定，無法上傳', 'warning');
        return;
    }

    const gasUrl = getGasUrl();
    if (!gasUrl) {
        showToast('尚未設定 API 連線', 'error');
        return;
    }

    const submitterName = appData.userName || '';
    if (!submitterName) {
        showToast('請先設定您的姓名', 'warning');
        switchTab('settings');
        return;
    }

    if (appData.expenses.length === 0) {
        showToast('尚無費用記錄，請先新增費用', 'warning');
        return;
    }

    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const tripCodeDisplay = document.getElementById('tripCodeDisplay');

    if (progressDiv) progressDiv.classList.remove('hidden');
    if (tripCodeDisplay) tripCodeDisplay.classList.add('hidden');
    if (progressBar) progressBar.style.width = '10%';
    if (progressText) progressText.textContent = '準備上傳資料...';

    try {
        const api = new TravelAPI(gasUrl);

        // 如果有 TripCode，執行同名檢核
        if (appData.tripCode) {
            progressText.textContent = '檢查同名資料...';
            progressBar.style.width = '15%';

            try {
                const dupResult = await api.checkDuplicate(appData.tripCode, submitterName);
                if (dupResult.success && dupResult.hasDuplicate) {
                    const lastUpdated = dupResult.lastUpdated
                        ? new Date(dupResult.lastUpdated).toLocaleString()
                        : '未知';
                    const proceed = confirm(
                        '偵測到同名資料！\n\n' +
                        '提交人：' + submitterName + '\n' +
                        '上次更新：' + lastUpdated + '\n\n' +
                        '請問這是您之前的備份嗎？\n\n' +
                        '按「確定」→ 覆蓋更新\n' +
                        '按「取消」→ 修改提交人姓名'
                    );
                    if (!proceed) {
                        const newName = prompt('請輸入新的提交人姓名（例如加上部門或暱稱）：', submitterName);
                        if (!newName || !newName.trim()) {
                            if (progressBar) progressBar.style.width = '0%';
                            if (progressText) progressText.textContent = '已取消上傳';
                            return;
                        }
                        appData.userName = newName.trim();
                        saveData();
                        updateHeader();
                        if (progressBar) progressBar.style.width = '0%';
                        if (progressText) progressText.textContent = '已更新姓名，請重新上傳';
                        showToast('已更新提交人姓名，請重新上傳');
                        return;
                    }
                }
                // 如果 existingSubmitter 不同，表示 TripCode 已被其他人建立，但這是正常的（團員加入）
            } catch (dupErr) {
                console.log('同名檢核失敗（非致命）:', dupErr);
                // 檢核失敗不阻擋上傳
            }
        }

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
            submittedBy: submitterName,
            lastModified: appData.localLastModified  // 傳送本地最後修改時間
        };
        // 更新模式：傳送現有 tripCode
        if (appData.tripCode) {
            payload.tripCode = appData.tripCode;
        }

        const result = await api.submitTrip(payload);

        if (result.success) {
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '上傳完成！';
            if (tripCodeDisplay) tripCodeDisplay.classList.remove('hidden');
            const tripCodeValueEl = document.getElementById('tripCodeValue');
            if (tripCodeValueEl) tripCodeValueEl.textContent = result.tripCode;

            // 記住 trip code 並更新同步時間
            appData.tripCode = result.tripCode;
            appData.lastSyncTime = new Date().toISOString();
            saveData();
            localStorage.setItem('lastTripCode', result.tripCode);
            updateTripCodeBanner();
            updateSyncStatus();
            updateTripTab();
            showToast(payload.tripCode ? '✓ 重新上傳成功！' : '✓ 上傳成功！');
        } else {
            // 處理特定錯誤碼
            if (result.errorCode === 'TRIP_LOCKED') {
                if (progressBar) progressBar.style.width = '0%';
                if (progressText) progressText.textContent = '案件已鎖定';
                appData.isLocked = true;
                saveData();
                updateSyncStatus();
                showToast('此旅遊已被鎖定，無法上傳', 'error');
                return;
            }
            if (result.errorCode === 'VERSION_CONFLICT') {
                progressBar.style.width = '0%';
                progressText.textContent = '版本衝突';
                const doDownload = confirm(
                    '⚠️ 雲端已有較新版本！\n\n' +
                    '雲端更新時間: ' + new Date(result.serverLastModified).toLocaleString() + '\n\n' +
                    '點擊「確定」下載雲端資料覆蓋本地\n' +
                    '點擊「取消」放棄本次上傳'
                );
                if (doDownload) {
                    await downloadFromCloud();
                }
                return;
            }
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
        const currentTripCode = document.getElementById('currentTripCode');
        if (currentTripCode) currentTripCode.textContent = appData.tripCode;
        // 更新上傳按鈕文字
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            const textEl = uploadBtn.querySelector('.font-bold');
            if (textEl) textEl.textContent = '重新上傳至雲端';
        }
    } else {
        banner.classList.add('hidden');
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            const textEl = uploadBtn.querySelector('.font-bold');
            if (textEl) textEl.textContent = '上傳至雲端審核';
        }
    }
    // 同步更新 stats 卡片上的 tripCode badge
    const tripCodeBadge = document.getElementById('tripCodeBadge');
    if (tripCodeBadge) {
        if (appData.tripCode) {
            tripCodeBadge.textContent = appData.tripCode;
            tripCodeBadge.classList.remove('hidden');
        } else {
            tripCodeBadge.classList.add('hidden');
        }
    }
    // 同步更新 sync status
    updateSyncStatus();
}

// ============================================
// 雲端同步下載功能
// ============================================

/**
 * 從雲端下載資料（跨裝置同步）
 * 從 GAS 後端拉取完整費用與照片資料
 */
async function downloadFromCloud() {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
        showToast('尚未設定 API 連線', 'error');
        return;
    }

    // 使用 appData.tripCode（onboarding 時已設定）
    const tripCode = appData.tripCode;
    if (!tripCode) {
        showToast('尚未設定 Trip Code', 'warning');
        return;
    }

    showToast('正在下載雲端資料...', 'info');

    try {
        const api = new TravelAPI(gasUrl);
        const result = await api.downloadTrip(tripCode);

        if (!result.success) {
            throw new Error(result.error || '下載失敗');
        }

        // 更新本地資料
        appData.tripCode = result.tripInfo.tripCode;
        appData.tripInfo = {
            location: result.tripInfo.location || '',
            startDate: result.tripInfo.startDate || '',
            endDate: result.tripInfo.endDate || '',
            subsidyAmount: result.tripInfo.subsidyAmount || 10000,
            paymentMethod: result.tripInfo.paymentMethod || '統一匯款',
            subsidyMethod: result.tripInfo.subsidyMethod || '實支實付'
        };
        appData.employees = result.employees || [];
        appData.localLastModified = result.serverLastModified;
        appData.lastSyncTime = new Date().toISOString();

        // 同步 isLocked 狀態（若後端回傳有此欄位）
        if (result.tripInfo.isLocked !== undefined) {
            appData.isLocked = !!result.tripInfo.isLocked;
        }

        // 轉換費用格式
        appData.expenses = (result.expenses || []).map(exp => ({
            id: Date.now() + Math.random() * 10000,
            category: exp.category,
            date: exp.date,
            description: exp.description,
            currency: exp.currency,
            amount: exp.amount,
            rate: exp.exchangeRate || 1,
            ntd: exp.amountNTD || exp.amount,
            hasPhoto: !!exp.photoFileId,
            expenseId: exp.expenseId,
            expenseStatus: exp.expenseStatus,
            expenseReviewNote: exp.expenseReviewNote,
            timestamp: new Date().toISOString()
        }));

        // 儲存照片到 IndexedDB
        const photos = result.photos || {};
        for (const exp of appData.expenses) {
            if (exp.expenseId && photos[exp.expenseId]) {
                try {
                    await savePhoto(exp.id, photos[exp.expenseId]);
                    exp.photo = photos[exp.expenseId];
                } catch (e) {
                    console.log('儲存照片失敗:', e);
                }
            }
        }

        // 儲存到 localStorage
        const dataToSave = {
            tripCode: appData.tripCode,
            role: appData.role,
            userName: appData.userName,
            tripInfo: appData.tripInfo,
            isLocked: appData.isLocked,
            employees: appData.employees,
            localLastModified: appData.localLastModified,
            lastSyncTime: appData.lastSyncTime,
            expenses: appData.expenses.map(e => {
                const copy = Object.assign({}, e);
                delete copy.photo;
                copy.hasPhoto = !!e.photo || e.hasPhoto;
                return copy;
            })
        };
        localStorage.setItem('travelExpenseApp', JSON.stringify(dataToSave));
        localStorage.setItem('lastTripCode', appData.tripCode);

        updateUI();
        updateTripCodeBanner();
        showToast('雲端資料已同步！共 ' + appData.expenses.length + ' 筆費用', 'success');

    } catch (error) {
        showToast('下載失敗：' + error.message, 'error');
    }
}

// 新增動畫樣式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    @keyframes slideUp {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(-20px); opacity: 0; }
    }
`;
document.head.appendChild(style);
