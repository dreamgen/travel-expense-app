// 旅遊費用申請 APP - JavaScript

// ============================================
// 版本控制
// ============================================
const APP_VERSION = '3.1.13';
const APP_BUILD_DATE = '2026-02-05';

// 預設 API URL（零設定）
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxuHXEIwweaK9UzxjeWe_Pydb1yedVRoALUF3korS0U5qQrBbvI_y0UkmrXon4Wxnqk/exec';

// ============================================
// URL 參數解析（用於設備切換和邀請分享）
// ============================================

function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        join: params.get('join'),                    // 加入旅遊的 TripCode
        restore: params.get('restore') === 'true',  // 是否為設備恢復模式
        tripCode: params.get('tripCode'),           // 恢復設備的 TripCode
        userName: params.get('userName'),           // 恢復設備的用戶名
        role: params.get('role')                    // 恢復設備的角色
    };
}

function clearUrlParams() {
    // 清除 URL 參數（避免重複觸發）
    if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}

// 生成邀請連結（新成員加入）
function generateJoinUrl() {
    if (!appData.tripCode) return '';
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?join=${encodeURIComponent(appData.tripCode)}`;
}

// 生成設備恢復連結
function generateRestoreUrl() {
    if (!appData.tripCode || !appData.userName || !appData.role) return '';
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
        restore: 'true',
        tripCode: appData.tripCode,
        userName: appData.userName,
        role: appData.role
    });
    return `${baseUrl}?${params.toString()}`;
}

// 處理 URL 參數（設備恢復或邀請加入）
async function handleUrlParams() {
    const urlParams = parseUrlParams();

    // 處理邀請加入連結
    if (urlParams.join && !appData.tripCode) {
        prefillJoinTrip(urlParams.join);
        clearUrlParams();
        return true;
    }

    // 處理設備恢復連結
    if (urlParams.restore && urlParams.tripCode && urlParams.userName && urlParams.role) {
        // 如果已有數據，詢問是否覆蓋
        if (appData.tripCode) {
            const shouldRestore = confirm(
                `即將從其他設備恢復資料：\n\n` +
                `Trip Code: ${urlParams.tripCode}\n` +
                `姓名: ${urlParams.userName}\n` +
                `角色: ${urlParams.role === 'leader' ? '團長' : '團員'}\n\n` +
                `這將覆蓋目前的本地資料，確定繼續嗎？`
            );
            if (!shouldRestore) {
                clearUrlParams();
                return false;
            }
        }

        // 設置本地數據
        appData.tripCode = urlParams.tripCode;
        appData.userName = urlParams.userName;
        appData.role = urlParams.role;
        saveData();

        // 清除 URL 參數
        clearUrlParams();

        // 隱藏 Onboarding，顯示主畫面
        hideOnboarding();
        updateUI();
        updateHeader();
        updateTripTab();
        updateSettingsVisibility();

        // 從雲端下載數據
        showToast('正在從雲端同步資料...', 'info');
        await downloadFromCloud();
        showToast('設備恢復完成！', 'success');

        // 啟動同步檢查
        startServerUpdateCheck();
        return true;
    }

    return false;
}

// 預填加入旅遊資訊
function prefillJoinTrip(tripCode) {
    // 顯示 Onboarding
    showOnboarding();

    // 隱藏角色選擇，顯示 TripCode 輸入區
    const roleSection = document.getElementById('onboardingRoleSection');
    const tripCodeSection = document.getElementById('onboardingTripCodeSection');

    // 設置 TripCode
    const tripCodeInput = document.getElementById('onboardingTripCode');
    if (tripCodeInput) {
        tripCodeInput.value = tripCode;
    }

    // 預設為團員角色
    appData.role = 'member';

    // 顯示 TripCode 區域
    if (roleSection) roleSection.classList.add('hidden');
    if (tripCodeSection) tripCodeSection.classList.remove('hidden');

    showToast('請輸入姓名後點擊「加入旅遊」', 'info');
}

// V2: 費用列表排序/篩選狀態
let expListSortField = 'date';  // 'date' | 'amount'
let expListSortDir = 'desc';     // 'asc' | 'desc'

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
    lastSyncTime: null,       // 最後同步時間戳
    lastServerCheck: null, // 最後伺服器檢查時間
    migrationVersion: 3,
    tripInfoLastModified: null, // 旅程資訊最後修改時間（僅團長更新旅程資訊時變動）
    memberLastModified: null,   // 該團員專屬的 server 最後修改時間（Per-Member 版本控制）
    // V2 新增欄位
    password: '',             // 團長密碼
    leaderName: '',           // 團長姓名
    tripStatus: 'Open',       // 團務狀態: Open | Submitted | Closed
    companions: [],           // 同行夥伴列表
    hasServerUpdate: false    // 是否有 server 新資料
};

// 費用表單 UI 狀態（模組層級，供 saveExpense 存取）
let expenseUIState = {
    currency: 'TWD',
    currencySymbol: '$',
    exchangeRate: 1.0,
    selectedBelongTo: '' // 空字串代表本人
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
document.addEventListener('DOMContentLoaded', async function () {
    loadData();

    // 載入 GAS URL 設定（需要在 URL 參數處理之前載入）
    loadGasUrl();

    // 處理 URL 參數（設備恢復或邀請加入）
    const handledByUrl = await handleUrlParams();

    // 若已由 URL 參數處理，跳過一般初始化
    if (!handledByUrl) {
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
    }

    setupEventListeners();

    // 設定今天為預設日期
    const today = new Date().toISOString().split('T')[0];
    const expenseDateEl = document.getElementById('expenseDate');
    if (expenseDateEl) expenseDateEl.value = today;

    // 背景檢查 config.json 是否有新版 API URL
    checkConfigUpdate();

    // V2: 啟動智慧同步偵測
    if (appData.tripCode) {
        startServerUpdateCheck();
    }

    // 更新 Trip Code Banner
    updateTripCodeBanner();

    // V3: 初始化版本控制與自動更新
    initVersionControl();
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
        }
    });
}

// === 新增費用 UI 現代化邏輯 ===
// 注意：幣別設定、匯率、選定付款人等狀態儲存在模組層級的 expenseUIState 供 saveExpense 使用

// 類別選擇按鈕
const categoryBtns = document.querySelectorAll('.expense-category-btn');
const categoryInput = document.getElementById('expenseCategory');

categoryBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        categoryBtns.forEach(b => {
            b.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            b.classList.add('bg-white', 'text-gray-500', 'border-gray-200');
        });
        btn.classList.remove('bg-white', 'text-gray-500', 'border-gray-200');
        btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
        categoryInput.value = btn.dataset.value;
    });
});
// 預設選第一個類別
if (categoryBtns.length > 0) categoryBtns[0].click();

// 快速相機按鈕
const quickCameraBtn = document.getElementById('quickCameraBtn');
const receiptPhotoInput = document.getElementById('receiptPhoto');
const receiptPhotoCameraForQuickBtn = document.getElementById('receiptPhotoCamera'); // capture="environment"
const photoPreview = document.getElementById('photoPreview');
const photoPreviewImg = document.getElementById('photoPreviewImg');
const expenseUploadPlaceholder = document.getElementById('expenseUploadPlaceholder');
const removePhotoBtn = document.getElementById('removePhotoBtn');

if (quickCameraBtn) {
    quickCameraBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // 使用 receiptPhotoCamera (有 capture="environment") 直接開啟相機拍照
        if (receiptPhotoCameraForQuickBtn) {
            receiptPhotoCameraForQuickBtn.click();
        } else {
            receiptPhotoInput.click();
        }
    });
}

// 更新照片狀態
function updatePhotoButtonState(hasPhoto) {
    if (hasPhoto) {
        photoPreview.classList.remove('hidden');
        expenseUploadPlaceholder.classList.add('hidden');
        quickCameraBtn.classList.remove('bg-gray-100', 'text-gray-400');
        quickCameraBtn.classList.add('bg-green-100', 'text-green-600', 'border-green-200');
        quickCameraBtn.innerHTML = '<i class="fa-solid fa-check text-xl"></i>';
    } else {
        photoPreview.classList.add('hidden');
        expenseUploadPlaceholder.classList.remove('hidden');
        quickCameraBtn.classList.add('bg-gray-100', 'text-gray-400');
        quickCameraBtn.classList.remove('bg-green-100', 'text-green-600', 'border-green-200');
        quickCameraBtn.innerHTML = '<i class="fa-solid fa-camera text-xl"></i>';
        receiptPhotoInput.value = '';
    }
}

if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        updatePhotoButtonState(false);
    });
}

// 付款人/歸屬人選擇
const payerDefaultView = document.getElementById('payerDefaultView');
const payerSelectView = document.getElementById('payerSelectView');
const changePayerBtn = document.getElementById('changePayerBtn');
const currentPayerName = document.getElementById('currentPayerName');
const payerRadioContainer = document.getElementById('payerRadioContainer');
// selectedBelongTo 現在儲存在 expenseUIState.selectedBelongTo

if (changePayerBtn) {
    changePayerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        payerDefaultView.classList.add('hidden');
        payerSelectView.classList.remove('hidden');
        updatePayerRadioButtons();
    });
}

// 更新付款人選項
function updatePayerRadioButtons() {
    if (!payerRadioContainer) return;
    payerRadioContainer.innerHTML = '';

    // 本人選項
    const selfLabel = document.createElement('label');
    selfLabel.className = 'cursor-pointer flex-shrink-0';
    selfLabel.innerHTML = `
            <input type="radio" name="belongTo" value="" class="peer sr-only" ${expenseUIState.selectedBelongTo === '' ? 'checked' : ''}>
            <div class="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 peer-checked:bg-blue-600 peer-checked:text-white transition-colors text-xs font-medium border border-transparent peer-checked:border-blue-600">
                本人
            </div>
        `;
    payerRadioContainer.appendChild(selfLabel);

    // 同行夥伴選項
    if (appData.companions && appData.companions.length > 0) {
        appData.companions.forEach(companion => {
            const label = document.createElement('label');
            label.className = 'cursor-pointer flex-shrink-0';
            label.innerHTML = `
                    <input type="radio" name="belongTo" value="${companion}" class="peer sr-only" ${expenseUIState.selectedBelongTo === companion ? 'checked' : ''}>
                    <div class="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 peer-checked:bg-blue-600 peer-checked:text-white transition-colors text-xs font-medium border border-transparent peer-checked:border-blue-600">
                        ${companion}
                    </div>
                `;
            payerRadioContainer.appendChild(label);
        });
    }

    // 添加radio change事件
    const radios = payerRadioContainer.querySelectorAll('input[name="belongTo"]');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            expenseUIState.selectedBelongTo = e.target.value;
            currentPayerName.textContent = e.target.value || '本人';
        });
    });
}

// 幣別設定 Modal
const expenseSettingsBtn = document.getElementById('expenseSettingsBtn');
const expenseCurrencyModal = document.getElementById('expenseCurrencyModal');
const currencyModalBackdrop = document.getElementById('currencyModalBackdrop');
const currencyModalPanel = document.getElementById('currencyModalPanel');
const closeCurrencySettingsBtn = document.getElementById('closeCurrencySettingsBtn');
const saveCurrencySettingsBtn = document.getElementById('saveCurrencySettingsBtn');
const currencyOptBtns = document.querySelectorAll('.currency-opt-btn');
const exchangeRateInput = document.getElementById('exchangeRateInput');
const targetCurrSpan = document.getElementById('targetCurrSpan');
const rateHintText = document.getElementById('rateHintText');

let tempCurrency = 'TWD';
let tempSymbol = '$';
let tempRate = 1.0;

// 開啟幣別設定
if (expenseSettingsBtn) {
    expenseSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        expenseCurrencyModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            currencyModalBackdrop.classList.remove('opacity-0');
            currencyModalPanel.classList.remove('translate-y-full');
            // 重置為當前值
            updateCurrencyUI(expenseUIState.currency, expenseUIState.exchangeRate);
        });
    });
}

// 關閉幣別設定
function closeCurrencyModal() {
    currencyModalBackdrop.classList.add('opacity-0');
    currencyModalPanel.classList.add('translate-y-full');
    setTimeout(() => {
        expenseCurrencyModal.classList.add('hidden');
    }, 300);
}

if (closeCurrencySettingsBtn) {
    closeCurrencySettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeCurrencyModal();
    });
}

if (currencyModalBackdrop) {
    currencyModalBackdrop.addEventListener('click', closeCurrencyModal);
}

// 幣別按鈕點擊
currencyOptBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        // UI 更新
        currencyOptBtns.forEach(b => {
            b.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50', 'text-indigo-700', 'border-transparent');
            b.classList.add('border-gray-200', 'text-gray-600');
        });
        btn.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50', 'text-indigo-700', 'border-transparent');
        btn.classList.remove('border-gray-200', 'text-gray-600');

        tempCurrency = btn.dataset.currency;
        tempSymbol = btn.dataset.symbol;
        targetCurrSpan.textContent = tempCurrency;

        // 匯率邏輯
        if (tempCurrency === 'TWD') {
            exchangeRateInput.value = '1.0';
            exchangeRateInput.readOnly = true;
            tempRate = 1.0;
            rateHintText.textContent = '預設為台幣，匯率固定為 1.0';
        } else {
            exchangeRateInput.readOnly = false;
            const defaultRate = parseFloat(btn.dataset.rate) || 1.0;
            exchangeRateInput.value = defaultRate.toString();
            tempRate = defaultRate;
            rateHintText.textContent = `請輸入 1 ${tempCurrency} 等於多少台幣`;
            exchangeRateInput.focus();
        }
    });
});

// 更新幣別 UI
function updateCurrencyUI(curr, rate) {
    tempCurrency = curr;
    tempRate = rate;
    currencyOptBtns.forEach(btn => {
        if (btn.dataset.currency === curr) {
            btn.click();
        }
    });
    exchangeRateInput.value = rate.toString();
}

// 儲存幣別設定
if (saveCurrencySettingsBtn) {
    saveCurrencySettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newRate = parseFloat(exchangeRateInput.value);
        if (isNaN(newRate) || newRate <= 0) {
            showToast('請輸入有效的匯率', 'error');
            return;
        }

        // 更新全域狀態
        expenseUIState.currency = tempCurrency;
        expenseUIState.currencySymbol = tempSymbol;
        expenseUIState.exchangeRate = newRate;

        // 更新主畫面
        document.getElementById('expenseCurrencyLabel').textContent = expenseUIState.currency;
        document.getElementById('expenseCurrencySymbol').textContent = expenseUIState.currencySymbol;

        // 更新匯率提示
        const rateBadge = document.getElementById('expenseRateBadge');
        if (expenseUIState.currency !== 'TWD') {
            rateBadge.classList.remove('hidden');
            document.getElementById('expenseRateBadgeVal').textContent = expenseUIState.exchangeRate.toFixed(2);
        } else {
            rateBadge.classList.add('hidden');
        }

        // 更新台幣預覽
        updateExpenseNTDPreview();

        showToast('幣別設定已更新', 'success');
        closeCurrencyModal();
    });
}

// 更新台幣預覽 (新版)
function updateExpenseNTDPreview() {
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const ntd = amount * expenseUIState.exchangeRate;
    const preview = document.getElementById('expenseNtdPreview');
    if (preview) {
        preview.textContent = ntd.toFixed(0);
    }
}

// 金額輸入時更新預覽
const expenseAmountInput = document.getElementById('expenseAmount');
if (expenseAmountInput) {
    expenseAmountInput.addEventListener('input', updateExpenseNTDPreview);
}

// 照片上傳預覽 (V2.2: 支援拍照/相簿雙模式)
function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        // V2.2: 同步到主要的 receiptPhoto input 以確保表單提交時能取得檔案
        const mainInput = document.getElementById('receiptPhoto');
        if (mainInput && e.target !== mainInput) {
            // 建立 DataTransfer 物件來複製檔案到主要 input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            mainInput.files = dataTransfer.files;
        }

        const reader = new FileReader();
        reader.onload = function (ev) {
            photoPreviewImg.src = ev.target.result;
            updatePhotoButtonState(true);
        };
        reader.readAsDataURL(file);
    }
}

// 綁定所有照片上傳 inputs
if (receiptPhotoInput) {
    receiptPhotoInput.addEventListener('change', handlePhotoUpload);
}

const receiptPhotoCameraInput = document.getElementById('receiptPhotoCamera');
const receiptPhotoGalleryInput = document.getElementById('receiptPhotoGallery');

if (receiptPhotoCameraInput) {
    receiptPhotoCameraInput.addEventListener('change', handlePhotoUpload);
}
if (receiptPhotoGalleryInput) {
    receiptPhotoGalleryInput.addEventListener('change', handlePhotoUpload);
}

// 更新台幣預覽
function updateNTDPreview() {
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const rate = parseFloat(document.getElementById('expenseRate').value) || 1;
    const ntd = (amount * rate).toFixed(0);
    document.getElementById('ntdPreview').textContent = ntd.toLocaleString();
}

// 取得幣別符號輔助函數
function getCurrencySymbol(currency) {
    const symbols = {
        'TWD': '$',
        'JPY': '¥',
        'USD': '$',
        'KRW': '₩',
        'EUR': '€',
        'CNY': '¥'
    };
    return symbols[currency] || '$';
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
        // V2: 顯示團長設定精靈（不直接 completeOnboarding）
        const roleSection = document.getElementById('onboardingRoleSection');
        const nameInput2 = document.getElementById('onboardingName');
        const wizard = document.getElementById('leaderSetupWizard');
        if (roleSection) roleSection.classList.add('hidden');
        if (nameInput2) nameInput2.closest('div').classList.add('hidden');
        if (wizard) wizard.classList.remove('hidden');
        return;
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

// 加入旅遊處理中的標記（避免重複點擊）
let isJoiningTrip = false;

async function confirmJoinTrip() {
    // 防止重複點擊
    if (isJoiningTrip) return;

    const tripCodeInput = document.getElementById('onboardingTripCode');
    const code = tripCodeInput ? tripCodeInput.value.trim().toUpperCase() : '';
    if (!code) {
        showToast('請輸入 Trip Code', 'warning');
        if (tripCodeInput) tripCodeInput.focus();
        return;
    }

    const memberSection = document.getElementById('onboardingMemberSection');
    const memberSelect = document.getElementById('onboardingMemberSelect');
    const newMemberInput = document.getElementById('onboardingNewMemberName');

    // 如果已經選擇了成員，處理加入流程
    if (memberSection && !memberSection.classList.contains('hidden')) {
        const selected = memberSelect ? memberSelect.value : '';
        let isExistingMember = false;

        if (selected === '__new__') {
            const newName = newMemberInput ? newMemberInput.value.trim() : '';
            if (!newName) {
                showToast('請輸入您的姓名', 'warning');
                if (newMemberInput) newMemberInput.focus();
                return;
            }
            appData.userName = newName;
            isExistingMember = false;
        } else if (selected) {
            appData.userName = selected;
            isExistingMember = true; // 選擇了已存在的人員，需要走設備恢復流程
        } else {
            showToast('請選擇您的身分', 'warning');
            return;
        }

        appData.tripCode = code;

        // V3: 選擇已存在人員時，走設備恢復流程（不會覆蓋雲端資料）
        if (isExistingMember) {
            await completeOnboardingAsRestore();
        } else {
            completeOnboarding();
        }
        return;
    }

    // 顯示載入遮罩
    isJoiningTrip = true;
    showJoinTripLoading(true);

    // 嘗試取得成員名單
    try {
        const gasUrl = localStorage.getItem('gasWebAppUrl') || DEFAULT_API_URL;
        const api = new TravelAPI(gasUrl);
        const result = await api.getMembers(code);

        if (result.success && result.members && result.members.length > 0) {
            // 顯示成員 dropdown
            if (memberSelect) {
                memberSelect.innerHTML = '<option value="">-- 請選擇 --</option>';
                result.members.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.name;
                    opt.textContent = m.name + (m.department ? ' (' + m.department + ')' : '');
                    memberSelect.appendChild(opt);
                });
                // 加入「我是新成員」選項
                const newOpt = document.createElement('option');
                newOpt.value = '__new__';
                newOpt.textContent = '我是新成員';
                memberSelect.appendChild(newOpt);
            }
            if (memberSection) memberSection.classList.remove('hidden');
            if (newMemberInput) newMemberInput.classList.add('hidden');

            // 監聽選擇變更
            if (memberSelect) {
                memberSelect.onchange = function () {
                    if (this.value === '__new__') {
                        if (newMemberInput) newMemberInput.classList.remove('hidden');
                    } else {
                        if (newMemberInput) newMemberInput.classList.add('hidden');
                    }
                };
            }

            showJoinTripLoading(false);
            isJoiningTrip = false;
            return; // 等使用者選擇後再按一次「加入旅遊」
        }
    } catch (e) {
        console.log('getMembers 失敗（fallback 手動輸入）:', e);
    }

    // 隱藏載入遮罩
    showJoinTripLoading(false);
    isJoiningTrip = false;

    // Fallback：沒有成員名單，直接加入
    appData.tripCode = code;
    completeOnboarding();
}

// 顯示/隱藏加入旅遊載入遮罩
function showJoinTripLoading(show) {
    let overlay = document.getElementById('joinTripLoadingOverlay');
    if (!overlay && show) {
        // 動態建立遮罩
        overlay = document.createElement('div');
        overlay.id = 'joinTripLoadingOverlay';
        overlay.className = 'fixed inset-0 bg-black/50 z-[100] flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3 mx-4">
                <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p class="text-sm font-medium text-gray-700">取得團員資訊中...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else if (overlay) {
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

/**
 * V3: 選擇已存在人員時的設備恢復流程
 * 不會執行 memberAutoRegister()，避免覆蓋雲端資料
 */
async function completeOnboardingAsRestore() {
    // 設置基本資料
    appData.role = 'member';
    saveData();

    // 隱藏 Onboarding
    hideOnboarding();

    // 顯示載入提示
    showToast('正在從雲端同步資料...', 'info');

    // 從雲端下載資料（這會取得該用戶的所有費用）
    await downloadFromCloud();

    // 更新 UI
    updateUI();
    updateHeader();
    updateTripTab();
    updateSettingsVisibility();
    updateTripCodeBanner();

    showToast('設備恢復完成！已載入您的費用資料', 'success');

    // 啟動智慧同步偵測
    startServerUpdateCheck();
}

function generateTripCode() {
    return 'TRIP-' + Math.floor(1000 + Math.random() * 9000);
}

function completeOnboarding() {
    // V2: 團長設定 leaderName
    if (appData.role === 'leader') {
        appData.leaderName = appData.userName;
        appData.tripStatus = 'Open';
        // V2.1: 確保團長本人在 employees 名單中
        if (!appData.employees) appData.employees = [];
        var leaderExists = appData.employees.some(function (e) { return e.name === appData.userName; });
        if (!leaderExists) {
            appData.employees.unshift({ name: appData.userName, department: '' });
        }
    }

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
        // V2.1: 團員加入時先下載同步，再自動上傳註冊（確保 server 有此團員資料）
        setTimeout(async function () {
            await downloadFromCloud();
            await memberAutoRegister();
        }, 500);
    }

    // V2: 啟動智慧同步偵測
    startServerUpdateCheck();
}

/**
 * V2.1: 團員加入後自動上傳（靜默註冊）
 * 即使沒有費用也會向 server 發送資料，確保 members 名單即時更新
 */
async function memberAutoRegister() {
    if (appData.role !== 'member' || !appData.tripCode || !appData.userName) return;
    try {
        const gasUrl = getGasUrl();
        if (!gasUrl) return;
        const api = new TravelAPI(gasUrl);
        const payload = {
            tripCode: appData.tripCode,
            tripInfo: appData.tripInfo,
            employees: appData.employees || [],
            expenses: [],
            submittedBy: appData.userName,
            lastModified: appData.localLastModified,
            companions: (appData.companions || []).join(',')
        };
        var result = await api.submitTrip(payload);
        if (result.success) {
            appData.localLastModified = result.serverLastModified || new Date().toISOString();
            saveData();
        }
    } catch (e) {
        console.log('團員自動註冊失敗（非致命）:', e);
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

    // 團員名單（唯讀）
    updateMemberEmployeeList();
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

// 顯示/關閉 Modal
function showAddExpenseModal() {
    document.getElementById('addExpenseModal').classList.add('active');

    // 設定今天為預設日期
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today;

    // 重置付款人選擇到預設狀態
    expenseUIState.selectedBelongTo = '';
    currentPayerName.textContent = '本人';
    payerDefaultView.classList.remove('hidden');
    payerSelectView.classList.add('hidden');
    // 更新付款人選項列表
    updatePayerRadioButtons();
}

function showAddEmployeeModal() {
    document.getElementById('addEmployeeModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    // 重置表單
    if (modalId === 'addExpenseModal') {
        document.getElementById('expenseForm').reset();

        // 重置照片狀態
        updatePhotoButtonState(false);

        // 重置日期為今天
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('expenseDate').value = today;

        // 重置幣別為 TWD
        expenseUIState.currency = 'TWD';
        expenseUIState.currencySymbol = '$';
        expenseUIState.exchangeRate = 1.0;
        document.getElementById('expenseCurrencyLabel').textContent = 'TWD';
        document.getElementById('expenseCurrencySymbol').textContent = '$';
        document.getElementById('expenseRateBadge').classList.add('hidden');
        updateExpenseNTDPreview();

        // 重置類別為第一個
        if (categoryBtns.length > 0) {
            categoryBtns[0].click();
        }

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
    // 修正：使用 parseFloat 保留完整數值（id 可能含小數）
    const editId = form.dataset.editId ? parseFloat(form.dataset.editId) : null;

    // V2: 取得 BelongTo (從 expenseUIState)
    const belongToValue = expenseUIState.selectedBelongTo || (appData.userName || '');

    const expense = {
        id: editId || Date.now(),
        category: document.getElementById('expenseCategory').value,
        date: document.getElementById('expenseDate').value,
        description: document.getElementById('expenseDescription').value,
        currency: expenseUIState.currency,        // 從 expenseUIState 讀取
        amount: parseFloat(document.getElementById('expenseAmount').value),
        rate: expenseUIState.exchangeRate,         // 從 expenseUIState 讀取
        ntd: parseFloat(document.getElementById('expenseAmount').value) * expenseUIState.exchangeRate,
        photo: photoData,
        timestamp: new Date().toISOString(),
        belongTo: belongToValue,             // V2: 消費歸屬人
        employeeName: appData.userName || '' // V2: 填寫人
    };

    // 照片存 IndexedDB
    const afterSave = () => {
        if (editId) {
            // 編輯模式：更新現有
            const idx = appData.expenses.findIndex(e => e.id === editId);
            if (idx >= 0) {
                const oldExpense = appData.expenses[idx];

                // 保留舊的照片：如果沒有新照片，複製舊照片資料
                if (!photoData) {
                    if (oldExpense.photo) {
                        expense.photo = oldExpense.photo;
                    }
                    if (oldExpense.hasPhoto) {
                        expense.hasPhoto = true;
                    }
                }

                // 保留伺服器分配的欄位（已上傳過的單據）
                if (oldExpense.expenseId) {
                    expense.expenseId = oldExpense.expenseId;
                }
                if (oldExpense.expenseStatus) {
                    expense.expenseStatus = oldExpense.expenseStatus;
                }
                if (oldExpense.expenseReviewNote) {
                    expense.expenseReviewNote = oldExpense.expenseReviewNote;
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
    if (appData.isLocked) {
        showToast('此旅遊已結案鎖定，無法編輯', 'warning');
        return;
    }
    const expense = appData.expenses.find(e => e.id === id);
    if (!expense) return;

    // 標記編輯模式
    document.getElementById('expenseForm').dataset.editId = id;

    // 更新 expenseUIState（幣別與匯率）
    expenseUIState.currency = expense.currency || 'TWD';
    expenseUIState.currencySymbol = getCurrencySymbol(expense.currency || 'TWD');
    expenseUIState.exchangeRate = expense.rate || 1.0;

    // 更新 UI 顯示
    document.getElementById('expenseCurrencyLabel').textContent = expenseUIState.currency;
    document.getElementById('expenseCurrencySymbol').textContent = expenseUIState.currencySymbol;
    if (expenseUIState.currency !== 'TWD') {
        document.getElementById('expenseRateBadge').classList.remove('hidden');
        document.getElementById('expenseRateBadgeVal').textContent = expenseUIState.exchangeRate.toFixed(2);
    } else {
        document.getElementById('expenseRateBadge').classList.add('hidden');
    }

    // 設定類別（觸發相應按鈕）
    document.getElementById('expenseCategory').value = expense.category;
    const categoryBtns = document.querySelectorAll('.expense-category-btn');
    categoryBtns.forEach(btn => {
        if (btn.dataset.value === expense.category) {
            btn.click();
        }
    });

    // 設定基本欄位
    document.getElementById('expenseDate').value = expense.date;
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseAmount').value = expense.amount;
    updateExpenseNTDPreview();

    // 設定付款人
    expenseUIState.selectedBelongTo = expense.belongTo || '';
    if (currentPayerName) {
        currentPayerName.textContent = expense.belongTo || '本人';
    }

    // 顯示現有照片預覽
    if (expense.photo) {
        photoPreviewImg.src = expense.photo;
        updatePhotoButtonState(true);
    } else if (expense.hasPhoto) {
        getPhoto(id).then(data => {
            if (data) {
                photoPreviewImg.src = data;
                updatePhotoButtonState(true);
            }
        });
    }

    showAddExpenseModal();
}

// 刪除費用
function deleteExpense(id) {
    if (appData.isLocked) {
        showToast('此旅遊已結案鎖定，無法刪除', 'warning');
        return;
    }
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

}

// 更新同步狀態指示燈（V2: 4 種狀態）
function updateSyncStatus() {
    const dot = document.getElementById('syncStatusDot');
    const text = document.getElementById('syncStatusText');
    const indicator = document.getElementById('syncStatusIndicator');
    const tripTabDot = document.getElementById('tripTabDot');
    const unsyncedBadge = document.getElementById('unsyncedBadge');
    const lockBanner = document.getElementById('lockBanner');
    const fabButton = document.getElementById('fabButton');
    if (!dot || !text || !indicator) return;

    const hasLocalChanges = !appData.lastSyncTime || (appData.localLastModified && appData.localLastModified > appData.lastSyncTime);

    if (appData.isLocked && appData.tripStatus !== 'Open') {
        // V2.2: 顯示實際 tripStatus + 鎖頭圖示
        const statusLabel = {
            'Open': '進行中',
            'Submitted': '送審中',
            'Closed': '已結案'
        }[appData.tripStatus] || appData.tripStatus || '已結案';

        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-500 border border-gray-200 cursor-default';
        dot.innerHTML = '<i class="fa-solid fa-lock text-xs"></i>';
        dot.className = 'text-gray-400';
        text.textContent = statusLabel;
        indicator.onclick = null;
        if (lockBanner) lockBanner.classList.remove('hidden');
        if (fabButton) {
            fabButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.add('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.add('hidden');
    } else if (appData.hasExpenseReviewUpdate) {
        // V2.2: 有費用審核更新（琥珀色，可點擊下載）
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-xs font-medium text-amber-700 border border-amber-200 cursor-pointer';
        dot.innerHTML = '';
        dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
        text.textContent = '審核更新';
        indicator.onclick = function () { downloadFromCloud(); };
        if (lockBanner) lockBanner.classList.add('hidden');
        if (fabButton) {
            fabButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.remove('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.add('hidden');
    } else if (appData.hasServerUpdate) {
        // V2: 有新資料可下載（黃色）
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 text-xs font-medium text-yellow-700 border border-yellow-200 cursor-pointer';
        dot.innerHTML = '';
        dot.className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';
        text.textContent = '有更新';
        indicator.onclick = function () { downloadFromCloud(); };
        if (lockBanner) lockBanner.classList.add('hidden');
        if (fabButton) {
            fabButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.remove('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.add('hidden');
    } else if (hasLocalChanges) {
        // 有未備份的本地修改（紅點）
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-xs font-medium text-red-700 border border-red-200 cursor-pointer';
        dot.innerHTML = '';
        dot.className = 'w-2 h-2 rounded-full bg-red-500 animate-pulse';
        text.textContent = '待上傳';
        indicator.onclick = function () { submitToCloud(); };
        if (lockBanner) lockBanner.classList.add('hidden');
        if (fabButton) {
            fabButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            fabButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        }
        if (tripTabDot) tripTabDot.classList.remove('hidden');
        if (unsyncedBadge) unsyncedBadge.classList.remove('hidden');
    } else {
        // 已同步（綠色）
        indicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-xs font-medium text-green-700 border border-green-200 cursor-default';
        dot.innerHTML = '';
        dot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
        text.textContent = '已同步';
        indicator.onclick = null;
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

    // V2: 團員隱私過濾 — 只看到 submitter=me OR belongTo=me
    let displayExpenses = appData.expenses;
    if (appData.role === 'member' && appData.userName) {
        displayExpenses = appData.expenses.filter(exp => {
            const belongTo = exp.belongTo || exp.employeeName || '';
            const submitter = exp.employeeName || '';
            return submitter === appData.userName || belongTo === appData.userName;
        });
    }

    // V2: 類別篩選
    const catFilter = document.getElementById('expenseCategoryFilter');
    const catValue = catFilter ? catFilter.value : 'all';
    if (catValue !== 'all') {
        displayExpenses = displayExpenses.filter(exp => exp.category === catValue);
    }

    // V2: 狀態篩選
    const statusFilter = document.getElementById('expenseStatusFilter');
    const statusValue = statusFilter ? statusFilter.value : 'all';
    if (statusValue !== 'all') {
        displayExpenses = displayExpenses.filter(exp => (exp.expenseStatus || 'pending') === statusValue);
    }

    // V2: 排序
    displayExpenses = [...displayExpenses]; // clone before sort
    if (expListSortField === 'amount') {
        displayExpenses.sort((a, b) => {
            const diff = (Number(a.ntd) || 0) - (Number(b.ntd) || 0);
            return expListSortDir === 'asc' ? diff : -diff;
        });
    } else {
        // date sort (default)
        displayExpenses.sort((a, b) => {
            const cmp = (a.date || '').localeCompare(b.date || '');
            return expListSortDir === 'asc' ? cmp : -cmp;
        });
    }

    // 更新排序按鈕文字
    const sortLabel = document.getElementById('expenseSortLabel');
    if (sortLabel) {
        const arrow = expListSortDir === 'asc' ? '↑' : '↓';
        const fieldLabel = expListSortField === 'amount' ? '金額' : '日期';
        sortLabel.textContent = fieldLabel + arrow;
    }

    // 更新費用數量
    const countEl = document.getElementById('expenseCount');
    if (countEl) countEl.textContent = `${displayExpenses.length} 筆資料`;

    if (displayExpenses.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400">
                <i class="fa-solid fa-receipt text-4xl mb-3 opacity-30"></i>
                <p class="text-sm">目前沒有任何費用紀錄</p>
                <p class="text-xs mt-1 text-gray-300">點擊右下角 + 新增</p>
            </div>
        `;
        return;
    }

    // 按日期分組（如果按日期排序）或直接列表（如果按金額排序）
    let html = '';
    if (expListSortField === 'date') {
        const groupedByDate = {};
        displayExpenses.forEach(expense => {
            const date = expense.date;
            if (!groupedByDate[date]) {
                groupedByDate[date] = [];
            }
            groupedByDate[date].push(expense);
        });

        // 依當前排序方向
        const sortedDates = Object.keys(groupedByDate).sort();
        if (expListSortDir === 'desc') sortedDates.reverse();

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
    } else {
        // 金額排序：不分組，直接列出
        html = displayExpenses.map(expense => createExpenseCard(expense)).join('');
    }

    container.innerHTML = html;
}

function toggleExpenseSort() {
    // Cycle: date↓ → date↑ → amount↓ → amount↑ → date↓
    if (expListSortField === 'date' && expListSortDir === 'desc') {
        expListSortDir = 'asc';
    } else if (expListSortField === 'date' && expListSortDir === 'asc') {
        expListSortField = 'amount';
        expListSortDir = 'desc';
    } else if (expListSortField === 'amount' && expListSortDir === 'desc') {
        expListSortDir = 'asc';
    } else {
        expListSortField = 'date';
        expListSortDir = 'desc';
    }
    updateExpenseList();
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
                'needs_revision': { label: '需補件', cls: 'bg-orange-200 text-orange-800', icon: 'fa-exclamation-circle' },
                'modified_pending': { label: '已變更待重審', cls: 'bg-amber-100 text-amber-700 border border-dashed border-amber-400', icon: 'fa-pen-to-square' }
            };
            const s = sm[expense.expenseStatus] || { label: expense.expenseStatus, cls: 'bg-gray-100 text-gray-700', icon: 'fa-circle-question' };
            return `<span class="text-[10px] px-2 py-0.5 rounded-full ${s.cls} font-medium"><i class="fa-solid ${s.icon} mr-0.5"></i>${s.label}</span>`;
        })()
        : '';

    // 未上傳標籤（本地新增但尚未上傳的單據）
    const localOnlyBadge = !expense.expenseId
        ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium ml-1"><i class="fa-solid fa-cloud-arrow-up mr-0.5"></i>未上傳</span>'
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
                                ${expStatusBadge}${localOnlyBadge}
                            </div>
                            <div class="text-xs text-gray-400 mt-0.5">${expense.category}</div>
                            ${expense.expenseReviewNote ? `<p class="text-xs text-orange-600 mt-1"><i class="fa-solid fa-comment-dots mr-1"></i>${expense.expenseReviewNote}</p>` : ''}
                        </div>
                        ${!appData.isLocked ? `
                        <div class="flex items-center gap-1 ml-2 flex-shrink-0">
                            <button onclick="editExpense(${expense.id})" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition" title="編輯">
                                <i class="fa-solid fa-pen-to-square text-xs"></i>
                            </button>
                            <button onclick="deleteExpense(${expense.id})" class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="刪除">
                                <i class="fa-solid fa-trash text-xs"></i>
                            </button>
                        </div>
                        ` : ''}
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
        // V2: 儲存額外欄位
        password: appData.password || '',
        leaderName: appData.leaderName || '',
        tripStatus: appData.tripStatus || 'Open',
        companions: appData.companions || [],
        tripInfoLastModified: appData.tripInfoLastModified || null,
        memberLastModified: appData.memberLastModified || null,
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
            lastSyncTime: parsed.lastSyncTime || null,
            // V2: 還原額外欄位
            password: parsed.password || '',
            leaderName: parsed.leaderName || '',
            tripStatus: parsed.tripStatus || 'Open',
            companions: parsed.companions || [],
            tripInfoLastModified: parsed.tripInfoLastModified || null,
            memberLastModified: parsed.memberLastModified || null,
            hasServerUpdate: false
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

// 取得 GAS URL（優先使用 localStorage，否則回傳預設值）
function getGasUrl() {
    return localStorage.getItem('gasWebAppUrl') || DEFAULT_API_URL;
}

// 載入 GAS URL（保留向下相容）
function loadGasUrl() {
    // UI 已移除，僅保留函式簽名避免初始化呼叫報錯
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

    if (appData.expenses.length === 0 && appData.role !== 'leader') {
        showToast('尚無費用記錄，請先新增費用', 'warning');
        return;
    }

    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const tripCodeDisplay = document.getElementById('tripCodeDisplay');

    showLoadingOverlay('上傳雲端中...', 'fa-cloud-arrow-up');

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
                amountNTD: exp.ntd,
                belongTo: exp.belongTo || submitterName,       // V2: 消費歸屬人
                lastModifiedBy: exp.lastModifiedBy || '',      // V2: 最後修改者
                expenseId: exp.expenseId || ''                 // V2.2: 伺服器分配的單據 ID（用於修正後保留審核資訊）
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

        // V2: 建立完整成員名單 = employees + companions + 自己
        const allMemberNames = [];
        // 加入 employees 中的名字
        (appData.employees || []).forEach(e => {
            if (e.name && allMemberNames.indexOf(e.name) === -1) allMemberNames.push(e.name);
        });
        // 加入 companions 中的名字
        (appData.companions || []).forEach(name => {
            if (name && allMemberNames.indexOf(name) === -1) allMemberNames.push(name);
        });
        // 確保自己也在名單中
        if (submitterName && allMemberNames.indexOf(submitterName) === -1) {
            allMemberNames.push(submitterName);
        }

        const payload = {
            tripInfo: appData.tripInfo,
            employees: appData.employees,
            expenses: expenses,
            submittedBy: submitterName,
            lastModified: appData.memberLastModified || appData.localLastModified,  // 傳送該團員的最後修改時間
            // V2.1: 僅團長傳送 password / members / leaderName，團員不傳送以避免覆蓋
            companions: (appData.companions || []).join(',')  // 同行夥伴名單（供 server 合併）
        };
        if (appData.role === 'leader') {
            payload.password = appData.password || '';
            payload.members = allMemberNames.join(',');
            payload.leaderName = appData.leaderName || submitterName;
        }
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

            // 記住 trip code 並更新同步時間（含 per-member timestamp）
            appData.tripCode = result.tripCode;
            appData.lastSyncTime = new Date().toISOString();
            if (result.serverLastModified) {
                appData.memberLastModified = result.serverLastModified;
                appData.localLastModified = result.serverLastModified;
            }
            saveData();
            localStorage.setItem('lastTripCode', result.tripCode);
            updateTripCodeBanner();
            updateSyncStatus();
            updateTripTab();

            // 上傳成功後自動同步：取回伺服器分配的 expenseId，消除「未上傳」標籤
            try {
                if (progressText) progressText.textContent = '同步單據資料...';
                await syncExpenseIdsAfterUpload();
            } catch (syncErr) {
                console.log('上傳後同步失敗（非致命）:', syncErr);
            }

            hideLoadingOverlay();
            showToast(payload.tripCode ? '✓ 重新上傳成功！' : '✓ 上傳成功！');
        } else {
            // 處理特定錯誤碼
            if (result.errorCode === 'TRIP_LOCKED') {
                if (progressBar) progressBar.style.width = '0%';
                if (progressText) progressText.textContent = '案件已鎖定';
                appData.isLocked = true;
                saveData();
                updateSyncStatus();
                hideLoadingOverlay();
                showToast('此旅遊已被鎖定，無法上傳', 'error');
                return;
            }
            if (result.errorCode === 'VERSION_CONFLICT') {
                progressBar.style.width = '0%';
                progressText.textContent = '版本衝突';
                hideLoadingOverlay();
                var localOnlyCount = appData.expenses.filter(function (e) { return !e.expenseId; }).length;
                var conflictMsg = '⚠️ 雲端已有較新版本！\n\n' +
                    '雲端更新時間: ' + new Date(result.serverLastModified).toLocaleString() + '\n\n';
                if (localOnlyCount > 0) {
                    conflictMsg += '您有 ' + localOnlyCount + ' 筆尚未上傳的新增費用，下載後仍會保留。\n\n';
                }
                conflictMsg += '點擊「確定」下載雲端資料同步\n點擊「取消」放棄本次上傳';
                const doDownload = confirm(conflictMsg);
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
        hideLoadingOverlay();
        alert('上傳失敗：' + error.message);
    }
}

/**
 * 上傳成功後同步 expenseId：從伺服器取回單據資料，
 * 以內容比對方式將 server 的 expenseId 回填到本地單據，
 * 消除「未上傳」標籤並避免下載時產生重複。
 */
async function syncExpenseIdsAfterUpload() {
    const gasUrl = getGasUrl();
    if (!gasUrl || !appData.tripCode) return;

    const api = new TravelAPI(gasUrl);
    const result = await api.downloadTrip(appData.tripCode, appData.userName, appData.role, appData.userName);

    if (!result.success) return;

    const serverExpenses = result.expenses || [];
    const myName = appData.userName || '';

    // 篩選出自己的單據
    const myServerExpenses = serverExpenses.filter(function (exp) {
        return exp.employeeName === myName || exp.belongTo === myName;
    });

    // 以 (date, category, amount, description) 作為比對 key
    function makeKey(exp) {
        return [
            exp.date || '',
            exp.category || '',
            String(exp.amount || exp.ntd || 0),
            (exp.description || '').substring(0, 20)
        ].join('|');
    }

    // 建立 server expenses 的 lookup map
    var serverMap = {};
    myServerExpenses.forEach(function (sExp) {
        var key = makeKey({
            date: sExp.date,
            category: sExp.category,
            amount: sExp.amount,
            description: sExp.description
        });
        if (!serverMap[key]) serverMap[key] = [];
        serverMap[key].push(sExp);
    });

    // 更新本地單據的 expenseId
    appData.expenses.forEach(function (localExp) {
        if (localExp.expenseId) return; // 已有 expenseId，跳過

        var key = makeKey({
            date: localExp.date,
            category: localExp.category,
            amount: localExp.amount || localExp.ntd,
            description: localExp.description
        });

        var matches = serverMap[key];
        if (matches && matches.length > 0) {
            var matched = matches.shift(); // 取第一個匹配的
            localExp.expenseId = matched.expenseId;
            localExp.expenseStatus = matched.expenseStatus || 'pending';
            if (matched.expenseReviewNote) localExp.expenseReviewNote = matched.expenseReviewNote;
        }
    });

    // 更新 timestamp
    if (result.memberLastModified) {
        appData.memberLastModified = result.memberLastModified;
        appData.localLastModified = result.memberLastModified;
        appData.lastSyncTime = new Date().toISOString(); // 同步完成，更新同步時間
    } else if (result.serverLastModified) {
        appData.memberLastModified = result.serverLastModified;
        appData.localLastModified = result.serverLastModified;
        appData.lastSyncTime = new Date().toISOString(); // 同步完成，更新同步時間
    }

    saveData();
    updateUI();
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

    showLoadingOverlay('下載雲端資料中...', 'fa-cloud-arrow-down');
    showToast('正在下載雲端資料...', 'info');

    try {
        const api = new TravelAPI(gasUrl);

        // 嘗試 downloadTrip（新版 API），若不支援則 fallback 到 getTripStatus
        let result;
        let usedFallback = false;
        try {
            result = await api.downloadTrip(tripCode, appData.userName, appData.role, appData.userName);
            if (!result.success && result.error && result.error.includes('未知的操作')) {
                // 後端尚未部署 downloadTrip，改用 getTripStatus
                usedFallback = true;
                result = await api.getTripStatus(tripCode);
            }
        } catch (e) {
            // 網路錯誤等，嘗試 fallback
            usedFallback = true;
            result = await api.getTripStatus(tripCode);
        }

        if (!result.success) {
            throw new Error(result.error || '下載失敗');
        }

        // 統一取得 tripInfo 物件（getTripStatus 用 result.trip，downloadTrip 用 result.tripInfo）
        const tripData = result.tripInfo || result.trip;

        // 更新本地資料
        appData.tripCode = tripData.tripCode || tripCode;
        appData.tripInfo = {
            location: tripData.location || '',
            startDate: tripData.startDate || '',
            endDate: tripData.endDate || '',
            subsidyAmount: tripData.subsidyAmount || appData.tripInfo.subsidyAmount || 10000,
            paymentMethod: tripData.paymentMethod || appData.tripInfo.paymentMethod || '統一匯款',
            subsidyMethod: tripData.subsidyMethod || appData.tripInfo.subsidyMethod || '實支實付'
        };
        if (!usedFallback) {
            appData.employees = result.employees || [];
        }
        // Per-Member timestamp：優先使用 memberLastModified，fallback 到 serverLastModified
        appData.memberLastModified = result.memberLastModified || result.serverLastModified || tripData.serverLastModified || null;
        appData.localLastModified = appData.memberLastModified;
        appData.tripInfoLastModified = result.tripInfoLastModified || tripData.tripInfoLastModified || null;
        appData.lastSyncTime = new Date().toISOString();

        // 同步 isLocked 狀態（若後端回傳有此欄位）
        if (tripData.isLocked !== undefined) {
            appData.isLocked = !!tripData.isLocked;
        }
        // V2: 同步 leaderName, tripStatus
        if (tripData.leaderName) appData.leaderName = tripData.leaderName;
        if (result.leaderName) appData.leaderName = result.leaderName;
        if (tripData.tripStatus) appData.tripStatus = tripData.tripStatus;
        appData.hasServerUpdate = false; // 下載完成，清除更新標記
        appData.hasExpenseReviewUpdate = false; // V2.2: 清除審核更新標記

        // V2: 從 server 的 members 名單同步同行夥伴
        // members = CSV 字串，包含所有成員（團長 + 所有團員 + 同行夥伴）
        var serverMembers = (result.members || '').toString();
        if (serverMembers) {
            var serverMemberArr = serverMembers.split(',').map(function (m) { return m.trim(); }).filter(function (m) { return m; });
            // 排除自己和團長，剩下的作為潛在的同行夥伴
            var myName = appData.userName;
            var leaderN = appData.leaderName || '';
            var existingCompanions = appData.companions || [];
            serverMemberArr.forEach(function (name) {
                if (name !== myName && name !== leaderN && existingCompanions.indexOf(name) === -1) {
                    existingCompanions.push(name);
                }
            });
            appData.companions = existingCompanions;
        }

        // 轉換費用格式
        // V2.1: 客戶端防禦性篩選 — 僅保留自己的費用，避免重複上傳他人資料
        var myName = appData.userName || '';
        var allExpenses = (result.expenses || []).map(exp => ({
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
            timestamp: new Date().toISOString(),
            belongTo: exp.belongTo || exp.employeeName || '',        // V2
            employeeName: exp.employeeName || '',                     // V2
            lastModifiedBy: exp.lastModifiedBy || ''                  // V2
        }));
        // V2.3: 合併邏輯 — 從 server 取回已上傳單據，保留本地未上傳單據
        var serverExpenses = allExpenses.filter(function (exp) {
            return exp.employeeName === myName || exp.belongTo === myName;
        });
        // 保留本地尚未上傳的單據（沒有 expenseId 的 = 從未上傳過）
        var localOnlyExpenses = (appData.expenses || []).filter(function (exp) {
            return !exp.expenseId;
        });
        appData.expenses = serverExpenses.concat(localOnlyExpenses);

        // 儲存照片到 IndexedDB（僅 downloadTrip 才有 photos）
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

        // 儲存到 localStorage（含 V2 欄位）
        saveData();
        localStorage.setItem('lastTripCode', appData.tripCode);

        updateUI();
        updateTripCodeBanner();
        // V2: 更新同行夥伴 UI（從 server 同步的 members 名單）
        if (typeof updateCompanionList === 'function') updateCompanionList();
        if (typeof updateBelongToDropdown === 'function') updateBelongToDropdown();
        hideLoadingOverlay();
        var localOnlyCount = localOnlyExpenses.length;
        var syncMsg = '雲端資料已同步！共 ' + appData.expenses.length + ' 筆費用';
        if (localOnlyCount > 0) {
            syncMsg += '（含 ' + localOnlyCount + ' 筆未上傳）';
        }
        showToast(syncMsg, 'success');

    } catch (error) {
        hideLoadingOverlay();
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

// ============================================
// Loading Overlay（上傳/下載遮罩）
// ============================================

function showLoadingOverlay(message, iconClass) {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingOverlayText');
    const icon = document.getElementById('loadingOverlayIcon');
    if (!overlay) return;
    if (text) text.textContent = message || '處理中...';
    if (icon) {
        icon.className = 'text-4xl text-indigo-500 animate-bounce fa-solid ' + (iconClass || 'fa-cloud-arrow-up');
    }
    overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

// ============================================
// V2: 智慧同步 — Server 版本自動偵測
// ============================================

let serverCheckInterval = null;

async function checkServerUpdate() {
    if (!appData.tripCode) return;
    try {
        const gasUrl = localStorage.getItem('gasWebAppUrl') || DEFAULT_API_URL;
        const api = new TravelAPI(gasUrl);
        const result = await api.checkServerVersion(appData.tripCode, appData.memberLastModified || appData.localLastModified || appData.lastSyncTime, appData.tripInfoLastModified, appData.userName);
        if (result.success) {
            const prevHasUpdate = appData.hasServerUpdate;
            const prevHasReviewUpdate = appData.hasExpenseReviewUpdate;
            appData.hasServerUpdate = result.hasUpdate;
            // V2.2: 費用審核更新偵測
            if (result.expenseReviewUpdated) {
                appData.hasExpenseReviewUpdate = true;
            }
            // 同步 isLocked 和 tripStatus
            if (result.isLocked !== undefined) appData.isLocked = result.isLocked;
            if (result.tripStatus) appData.tripStatus = result.tripStatus;
            if (result.tripInfoLastModified) appData.tripInfoLastModified = result.tripInfoLastModified;
            // 同步 per-member timestamp（防止首次使用或遷移時缺少）
            if (result.memberLastModified && !appData.memberLastModified) {
                appData.memberLastModified = result.memberLastModified;
            }
            updateSyncStatus();
            // 如果從無更新變成有更新，顯示提示
            if (!prevHasUpdate && result.hasUpdate) {
                showToast('雲端有新資料，點擊同步圖示下載', 'info');
            }
            // V2.2: 費用審核更新提示
            if (!prevHasReviewUpdate && result.expenseReviewUpdated) {
                showToast('您的費用有審核更新，點擊同步圖示查看', 'info');
            }
        }
    } catch (e) {
        console.log('checkServerUpdate 失敗（非致命）:', e);
    }
}

function startServerUpdateCheck() {
    // 立即檢查一次
    checkServerUpdate();

    // 每 5 分鐘定期檢查
    if (serverCheckInterval) clearInterval(serverCheckInterval);
    serverCheckInterval = setInterval(checkServerUpdate, 5 * 60 * 1000);

    // App 喚醒時檢查
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && appData.tripCode) {
            checkServerUpdate();
        }
    });
}

// ============================================
// V2: 同行夥伴管理
// ============================================

function addCompanion() {
    const input = document.getElementById('companionInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        showToast('請輸入夥伴姓名', 'warning');
        return;
    }
    if (appData.companions.includes(name)) {
        showToast('此夥伴已存在', 'warning');
        return;
    }
    appData.companions.push(name);
    input.value = '';
    saveData();
    updateCompanionList();
    updateBelongToDropdown();
}

function removeCompanion(idx) {
    appData.companions.splice(idx, 1);
    saveData();
    updateCompanionList();
    updateBelongToDropdown();
}

function updateCompanionList() {
    const container = document.getElementById('companionList');
    if (!container) return;

    if (appData.companions.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">尚未設定同行夥伴</p>';
        return;
    }

    container.innerHTML = appData.companions.map((name, idx) =>
        `<div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span class="text-sm text-gray-700">${name}</span>
            <button onclick="removeCompanion(${idx})" class="text-red-400 hover:text-red-600 text-xs"><i class="fa-solid fa-xmark"></i></button>
        </div>`
    ).join('');
}

function updateBelongToDropdown() {
    const select = document.getElementById('expenseBelongTo');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '';

    // 自己（預設）
    const selfOpt = document.createElement('option');
    selfOpt.value = appData.userName || '';
    selfOpt.textContent = (appData.userName || '自己') + '（本人）';
    select.appendChild(selfOpt);

    // 同行夥伴
    appData.companions.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    // 恢復選擇
    if (currentValue) select.value = currentValue;
}

// ============================================
// V2: 團長管理入口
// ============================================

function openLeaderAdmin() {
    if (!appData.tripCode) {
        showToast('尚未建立旅遊', 'warning');
        return;
    }
    const gasUrl = localStorage.getItem('gasWebAppUrl') || DEFAULT_API_URL;
    const adminUrl = 'admin/index.html?tripCode=' + encodeURIComponent(appData.tripCode) + '&role=leader&gasUrl=' + encodeURIComponent(gasUrl);
    window.open(adminUrl, '_blank');
}

function saveLeaderPassword() {
    const input = document.getElementById('leaderPasswordInput');
    if (!input) return;
    const pw = input.value.trim();
    if (!pw) {
        showToast('請輸入密碼', 'warning');
        return;
    }
    appData.password = pw;
    saveData();
    showToast('團長密碼已設定', 'success');
}

// ============================================
// V2: 團長設定精靈
// ============================================

let isLeaderSetupMode = false;

function cancelLeaderSetup() {
    const wizard = document.getElementById('leaderSetupWizard');
    const roleSection = document.getElementById('onboardingRoleSection');
    const nameDiv = document.getElementById('onboardingName');
    if (wizard) wizard.classList.add('hidden');
    if (roleSection) roleSection.classList.remove('hidden');
    if (nameDiv) nameDiv.closest('div').classList.remove('hidden');
    appData.role = null;
}

function leaderSetupBack(fromStep) {
    if (fromStep === 2) {
        document.getElementById('leaderStep2').classList.add('hidden');
        document.getElementById('leaderStep1').classList.remove('hidden');
    } else if (fromStep === 3) {
        document.getElementById('leaderStep3').classList.add('hidden');
        document.getElementById('leaderStep2').classList.remove('hidden');
        // Reset step 3 state
        document.getElementById('wizardUploading').classList.remove('hidden');
        document.getElementById('wizardSuccess').classList.add('hidden');
        document.getElementById('wizardError').classList.add('hidden');
    }
}

async function leaderSetupNext(fromStep) {
    if (fromStep === 1) {
        // Validate trip info
        const location = document.getElementById('wizardLocation').value.trim();
        const startDate = document.getElementById('wizardStartDate').value;
        const endDate = document.getElementById('wizardEndDate').value;
        const subsidy = document.getElementById('wizardSubsidy').value;

        if (!location) { showToast('請輸入旅遊地點', 'warning'); return; }
        if (!startDate) { showToast('請選擇開始日期', 'warning'); return; }
        if (!endDate) { showToast('請選擇結束日期', 'warning'); return; }

        appData.tripInfo.location = location;
        appData.tripInfo.startDate = startDate;
        appData.tripInfo.endDate = endDate;
        appData.tripInfo.subsidyAmount = Number(subsidy) || 10000;

        document.getElementById('leaderStep1').classList.add('hidden');
        document.getElementById('leaderStep2').classList.remove('hidden');
    } else if (fromStep === 2) {
        // Validate password
        const pw = document.getElementById('wizardPassword').value;
        const pwConfirm = document.getElementById('wizardPasswordConfirm').value;

        if (!pw) { showToast('請設定團長密碼', 'warning'); return; }
        if (pw !== pwConfirm) { showToast('兩次密碼不一致', 'warning'); return; }

        appData.password = pw;
        appData.leaderName = appData.userName;
        appData.tripStatus = 'Open';

        // Show step 3 (uploading)
        document.getElementById('leaderStep2').classList.add('hidden');
        document.getElementById('leaderStep3').classList.remove('hidden');
        document.getElementById('wizardUploading').classList.remove('hidden');
        document.getElementById('wizardSuccess').classList.add('hidden');
        document.getElementById('wizardError').classList.add('hidden');

        // Upload to cloud
        isLeaderSetupMode = true;
        try {
            const gasUrl = localStorage.getItem('gasWebAppUrl') || DEFAULT_API_URL;
            const api = new TravelAPI(gasUrl);

            const payload = {
                action: 'submitTrip',
                tripInfo: appData.tripInfo,
                employees: appData.employees,
                expenses: [],
                submittedBy: appData.userName,
                password: appData.password,
                members: [appData.userName].concat(appData.employees.map(e => e.name).filter(n => n && n !== appData.userName)).join(','),
                leaderName: appData.leaderName
            };

            const result = await api.submitTrip(payload);

            if (result.success) {
                appData.tripCode = result.tripCode;
                appData.lastSyncTime = new Date().toISOString();
                appData.localLastModified = result.serverLastModified || new Date().toISOString();
                saveData();

                document.getElementById('wizardUploading').classList.add('hidden');
                document.getElementById('wizardSuccess').classList.remove('hidden');
                document.getElementById('wizardTripCode').textContent = result.tripCode;
            } else {
                document.getElementById('wizardUploading').classList.add('hidden');
                document.getElementById('wizardError').classList.remove('hidden');
                document.getElementById('wizardErrorMsg').textContent = result.error || '上傳失敗';
            }
        } catch (error) {
            document.getElementById('wizardUploading').classList.add('hidden');
            document.getElementById('wizardError').classList.remove('hidden');
            document.getElementById('wizardErrorMsg').textContent = error.message || '連線失敗';
        }
        isLeaderSetupMode = false;
    }
}

function copyWizardTripCode() {
    const code = document.getElementById('wizardTripCode').textContent;
    if (navigator.clipboard && code) {
        navigator.clipboard.writeText(code).then(() => {
            showToast('已複製 Trip Code', 'success');
        });
    }
}

function finishLeaderSetup() {
    completeOnboarding();
}

// ============================================
// V3: 分享功能（邀請連結 & 設備切換）
// ============================================

// 顯示分享 Modal
function showShareModal(type) {
    const modal = document.getElementById('shareModal');
    const title = document.getElementById('shareModalTitle');
    const desc = document.getElementById('shareModalDesc');
    const urlDisplay = document.getElementById('shareUrlDisplay');
    const qrContainer = document.getElementById('shareQrContainer');

    if (!modal) return;

    let url = '';
    if (type === 'join') {
        url = generateJoinUrl();
        title.textContent = '邀請新成員加入';
        desc.textContent = '分享以下連結或 QR Code 讓團員快速加入旅遊';
    } else if (type === 'restore') {
        url = generateRestoreUrl();
        title.textContent = '在其他設備繼續';
        desc.textContent = '使用新手機或電腦掃描 QR Code 或開啟連結，即可繼續編輯';
    }

    if (!url) {
        showToast('無法生成連結，請確認旅遊資料已設定', 'warning');
        return;
    }

    // 顯示 URL
    urlDisplay.textContent = url;
    urlDisplay.dataset.url = url;

    // 生成 QR Code
    generateQRCode(url, qrContainer);

    // 顯示 Modal
    modal.classList.add('active');
}

// 關閉分享 Modal
function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) modal.classList.remove('active');
}

// 複製分享連結
function copyShareUrl() {
    const urlDisplay = document.getElementById('shareUrlDisplay');
    const url = urlDisplay ? urlDisplay.dataset.url : '';

    if (!url) return;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('連結已複製！', 'success');
        }).catch(() => {
            fallbackCopyToClipboard(url);
        });
    } else {
        fallbackCopyToClipboard(url);
    }
}

// 備用複製方法
function fallbackCopyToClipboard(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('連結已複製！', 'success');
    } catch (e) {
        showToast('複製失敗，請手動複製', 'error');
    }
    document.body.removeChild(ta);
}

// 使用系統分享功能（如果支援）
async function nativeShare(type) {
    let url = '';
    let title = '';
    let text = '';

    if (type === 'join') {
        url = generateJoinUrl();
        title = '加入員工旅遊';
        text = `加入旅遊 ${appData.tripCode}，請點擊以下連結：`;
    } else if (type === 'restore') {
        url = generateRestoreUrl();
        title = '繼續編輯費用';
        text = '在新設備上繼續編輯，請點擊以下連結：';
    }

    if (!url) {
        showToast('無法生成連結', 'warning');
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
        } catch (e) {
            // 用戶取消分享，不需要提示
            if (e.name !== 'AbortError') {
                showShareModal(type);
            }
        }
    } else {
        showShareModal(type);
    }
}

// 複製設備恢復連結
function copyRestoreUrl() {
    const url = generateRestoreUrl();
    if (!url) {
        showToast('無法生成連結，請確認旅遊資料已設定', 'warning');
        return;
    }

    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('連結已複製！在新設備開啟即可繼續編輯', 'success');
        }).catch(() => {
            fallbackCopyToClipboard(url);
        });
    } else {
        fallbackCopyToClipboard(url);
    }
}

// 生成 QR Code（使用 qrcode-generator 庫）
function generateQRCode(url, container) {
    if (!container) return;

    // 檢查 qrcode 庫是否已載入
    if (typeof qrcode === 'undefined') {
        container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">QR Code 載入中...</p>';
        // 動態載入 qrcode-generator
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
        script.onload = () => generateQRCode(url, container);
        script.onerror = () => {
            container.innerHTML = '<p class="text-sm text-red-500 text-center py-4">QR Code 載入失敗</p>';
        };
        document.head.appendChild(script);
        return;
    }

    try {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();

        // 生成 SVG
        const svg = qr.createSvgTag({
            scalable: true,
            margin: 2
        });

        container.innerHTML = svg;

        // 調整 SVG 樣式
        const svgEl = container.querySelector('svg');
        if (svgEl) {
            svgEl.style.width = '100%';
            svgEl.style.maxWidth = '200px';
            svgEl.style.height = 'auto';
        }
    } catch (e) {
        container.innerHTML = '<p class="text-sm text-red-500 text-center py-4">QR Code 生成失敗</p>';
        console.error('QR Code 生成錯誤:', e);
    }
}

// ============================================
// V3: 版本控制與自動更新
// ============================================

// 顯示版本號
function displayVersion() {
    const versionEl = document.getElementById('onboardingVersion');
    if (versionEl) {
        versionEl.textContent = `v${APP_VERSION}`;
    }
}

// 暫存的新版本資訊
let pendingUpdate = null;

// 檢查更新
async function checkForUpdates(showNoUpdateToast = true) {
    try {
        // 從 version.json 取得最新版本資訊
        const response = await fetch('./version.json?t=' + Date.now());
        if (!response.ok) throw new Error('無法取得版本資訊');

        const versionInfo = await response.json();
        const serverVersion = versionInfo.version;

        // 比較版本
        if (isNewerVersion(serverVersion, APP_VERSION)) {
            pendingUpdate = versionInfo;
            showUpdateModal(versionInfo);
        } else if (showNoUpdateToast) {
            showToast('已是最新版本 v' + APP_VERSION, 'success');
        }
    } catch (e) {
        console.log('檢查更新失敗:', e);
        if (showNoUpdateToast) {
            showToast('檢查更新失敗', 'error');
        }
    }
}

// 版本比較（是否 v1 > v2）
function isNewerVersion(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return true;
        if (p1 < p2) return false;
    }
    return false;
}

// 顯示更新 Modal
function showUpdateModal(versionInfo) {
    const modal = document.getElementById('updateModal');
    const versionText = document.getElementById('updateModalVersion');
    const notesText = document.getElementById('updateModalNotes');

    if (versionText) {
        versionText.textContent = `目前: v${APP_VERSION} → 新版: v${versionInfo.version}`;
    }
    if (notesText) {
        notesText.textContent = versionInfo.releaseNotes || '包含功能改進與錯誤修正';
    }
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// 關閉更新 Modal
function dismissUpdate() {
    const modal = document.getElementById('updateModal');
    if (modal) modal.classList.add('hidden');
}

// 執行更新
function applyUpdate() {
    dismissUpdate();
    showToast('正在更新...', 'info');

    // 通知 Service Worker 跳過等待
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }

    // 強制清除快取並重新載入
    if ('caches' in window) {
        caches.keys().then(keys => {
            return Promise.all(keys.map(key => caches.delete(key)));
        }).then(() => {
            window.location.reload(true);
        });
    } else {
        window.location.reload(true);
    }
}

// 監聽 Service Worker 訊息
function setupServiceWorkerListener() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('[App] SW updated to version:', event.data.version);
                // 如果 SW 版本與 App 版本不同，提示更新
                if (event.data.version !== APP_VERSION) {
                    showToast('已有新版本，重新整理以更新', 'info');
                }
            }
        });

        // 監聽 Service Worker 狀態變更
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[App] Service Worker controller changed, reloading...');
            window.location.reload();
        });

        // 定期檢查 Service Worker 更新
        navigator.serviceWorker.ready.then(registration => {
            // 每 5 分鐘檢查一次更新
            setInterval(() => {
                registration.update();
            }, 5 * 60 * 1000);
        });
    }
}

// 註冊 Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('[App] Service Worker registered:', registration.scope);

                // 監聯更新
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('[App] New Service Worker found, state:', newWorker.state);

                    newWorker.addEventListener('statechange', () => {
                        console.log('[App] Service Worker state changed:', newWorker.state);
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 新版本已安裝，提示用戶
                            showUpdateAvailableToast();
                        }
                    });
                });
            })
            .catch(error => {
                console.log('[App] Service Worker registration failed:', error);
            });
    }
}

// 顯示更新可用提示
function showUpdateAvailableToast() {
    // 檢查 version.json 取得更新資訊
    checkForUpdates(false);
}

// 初始化版本控制
function initVersionControl() {
    displayVersion();
    registerServiceWorker();
    setupServiceWorkerListener();

    // 啟動時靜默檢查更新
    setTimeout(() => {
        checkForUpdates(false);
    }, 3000);
}
