/**
 * LG Electronics Teams Expense Automation System
 * Frontend Controller with REST API Fetching & WebSockets Real-time Sync
 */

// --- Global Application State ---
let expenses = [];
let currentUser = '남우섭';
let currentMode = 'user'; // 'user' or 'admin'
let editId = '';
let socket = null;

// --- DOM Element Selectors ---
const tabUser = document.getElementById('tab-user');
const tabAdmin = document.getElementById('tab-admin');
const syncStatusBadge = document.getElementById('sync-status');
const syncStatusLabel = syncStatusBadge.querySelector('.status-label');

const userModeDisplay = document.getElementById('user-mode-display');
const currentUserNameEl = document.getElementById('current-user-name');
const changeNameBtn = document.getElementById('change-name-btn');
const adminModeDisplay = document.getElementById('admin-mode-display');

// Form Selectors
const expenseForm = document.getElementById('expense-form');
const editIdInput = document.getElementById('edit-id');
const expenseDateInput = document.getElementById('expense-date');
const expenseCategorySelect = document.getElementById('expense-category');
const expenseTeamSelect = document.getElementById('expense-team');
const expenseSessionSelect = document.getElementById('expense-session');
const expenseDescInput = document.getElementById('expense-desc');
const expenseUserInput = document.getElementById('expense-user');
const expenseCardInput = document.getElementById('expense-card');
const expenseAmountInput = document.getElementById('expense-amount');

// --- Dynamic Category-Team Dropdown Mapping ---
const categoryTeams = {
    '센터장 솔루션 그룹코칭': [
        '수도권북부', '수도권동부', '수도권서부', '인천', '경기북부', '경기남부', '경부중부', 
        '충청', '강원', '전남제주', '전북광주', '경북', '경남', '대구', '부산'
    ],
    '실장 Cross 커뮤니티': [
        '수도권중부 1팀', '수도권중부 2팀', '수도권중부 3팀', '수도권중부 4팀', '수도권중부 5팀', 
        '수도권중부 6팀', '수도권중부 7팀', '수도권중부 8팀', '수도권중부 9팀',
        '서남부 1팀', '서남부 2팀', '서남부 3팀', '서남부 4팀', '서남부 5팀', 
        '서남부 6팀', '서남부 7팀', '서남부 8팀', '서남부 9팀', '서남부 10팀',
        '강원팀', '충청 1팀', '충청 2팀'
    ],
    '조직활성화 활동': [
        '본부/실', '기타'
    ]
};

function updateTeamDropdownOptions() {
    const selectedCategory = expenseCategorySelect.value;
    const teams = categoryTeams[selectedCategory] || ['본부/실', '기타'];
    
    expenseTeamSelect.innerHTML = '';
    teams.forEach(team => {
        const opt = document.createElement('option');
        opt.value = team;
        opt.textContent = team;
        expenseTeamSelect.appendChild(opt);
    });
}

expenseCategorySelect.addEventListener('change', updateTeamDropdownOptions);

const submitBtn = document.getElementById('submit-btn');
const submitText = document.getElementById('submit-text');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// List & Table Selector
const filterExtractor = document.getElementById('filter-extractor');
const excelExportBtn = document.getElementById('excel-export-btn');
const sampleDataBtn = document.getElementById('sample-data-btn');
const clearAllBtn = document.getElementById('clear-all-btn');

const emptyStateContainer = document.getElementById('empty-state-container');
const expenseTableEl = document.getElementById('expense-table-el');
const expenseListBody = document.getElementById('expense-list-body');

// Name Change Modal Selectors
const nameModal = document.getElementById('name-modal');
const newUserNameInput = document.getElementById('new-user-name');
const nameCancelBtn = document.getElementById('name-cancel-btn');
const nameSaveBtn = document.getElementById('name-save-btn');

// --- Helper Functions ---

// Secure HTML Escaping to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Format numbers with thousand separators
function formatNumber(num) {
    return Number(num).toLocaleString('ko-KR');
}

// Unformat numbers for calculation
function parseAmount(str) {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
}

// Show Floating Notification Toast
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = toast.querySelector('.toast-icon');
    const toastMessage = toast.querySelector('.toast-message');
    
    toastMessage.textContent = message;
    
    if (type === 'error') {
        toastIcon.className = 'fa-solid fa-circle-exclamation toast-icon';
        toastIcon.style.color = '#D32F2F';
    } else if (type === 'info') {
        toastIcon.className = 'fa-solid fa-circle-info toast-icon';
        toastIcon.style.color = '#0066CC';
    } else {
        toastIcon.className = 'fa-solid fa-circle-check toast-icon';
        toastIcon.style.color = '#FFC107';
    }
    
    toast.classList.remove('hidden');
    
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Set Today's Date on Date input
function setDefaultDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    expenseDateInput.value = `${yyyy}-${mm}-${dd}`;
}

// --- REST API Server Sync Functions ---

// Fetch all expenses from backend
async function fetchExpensesFromServer() {
    try {
        const response = await fetch('/api/expenses');
        if (response.ok) {
            expenses = await response.json();
            renderTable();
        } else {
            console.error('Failed to load expenses from server API.');
            showToast('서버 데이터 로드 실패', 'error');
        }
    } catch (err) {
        console.error('Error connecting to backend API:', err);
        showToast('서버 통신 실패 (오프라인 상태)', 'error');
    }
}

// Load configurations from local preference
function loadPreferences() {
    const savedUser = localStorage.getItem('lg_expense_username');
    if (savedUser) {
        currentUser = savedUser;
    }
    currentUserNameEl.textContent = currentUser;

    const savedMode = localStorage.getItem('lg_expense_mode');
    if (savedMode) {
        currentMode = savedMode;
    }
}

// --- Tab Mode Logic (사용자용 / 관리자용) ---
function switchMode(mode) {
    currentMode = mode;
    localStorage.setItem('lg_expense_mode', mode);
    
    // Toggle active class on tabs
    if (mode === 'user') {
        tabUser.classList.add('active');
        tabAdmin.classList.remove('active');
        
        userModeDisplay.classList.remove('hidden');
        adminModeDisplay.classList.add('hidden');
        
        showToast('사용자 모드로 전환되었습니다. 본인 전표만 제어 가능합니다.', 'info');
    } else {
        tabAdmin.classList.add('active');
        tabUser.classList.remove('active');
        
        adminModeDisplay.classList.remove('hidden');
        userModeDisplay.classList.add('hidden');
        
        showToast('관리자 모드로 전환되었습니다. 전체 전표 제어 권한이 활성화됩니다.', 'info');
    }
    
    // Sync the input form to fit the selected mode
    adjustFormForMode();
    
    // Re-render table list based on mode visibility rules
    renderTable();
}

function adjustFormForMode() {
    if (currentMode === 'user') {
        // Locked user name
        expenseUserInput.value = currentUser;
        expenseUserInput.setAttribute('readonly', 'true');
    } else {
        // Fully editable user name with placeholder
        expenseUserInput.removeAttribute('readonly');
        if (expenseUserInput.value === currentUser) {
            expenseUserInput.value = ''; // Let admin type it
        }
        expenseUserInput.placeholder = '결제자 성명 대필 가능';
    }
}

// --- Custom Modal control for Username change ---
changeNameBtn.addEventListener('click', () => {
    newUserNameInput.value = currentUser;
    nameModal.classList.remove('hidden');
    newUserNameInput.focus();
});

nameCancelBtn.addEventListener('click', () => {
    nameModal.classList.add('hidden');
});

nameSaveBtn.addEventListener('click', () => {
    const inputVal = newUserNameInput.value.trim();
    if (!inputVal) {
        showToast('올바른 이름을 입력해 주세요.', 'error');
        return;
    }
    
    currentUser = inputVal;
    localStorage.setItem('lg_expense_username', currentUser);
    currentUserNameEl.textContent = currentUser;
    
    if (currentMode === 'user') {
        expenseUserInput.value = currentUser;
    }
    
    nameModal.classList.add('hidden');
    showToast(`사용자 이름이 '${currentUser}'님으로 변경되었습니다.`);
    
    renderTable();
});

// Close modal when clicking overlay outer boundary
nameModal.addEventListener('click', (e) => {
    if (e.target === nameModal) {
        nameModal.classList.add('hidden');
    }
});

// --- Dynamic Input Formatter (Comma separation dynamically) ---
expenseAmountInput.addEventListener('input', (e) => {
    let value = e.target.value;
    value = value.replace(/\D/g, ''); // Clear non-digits
    
    if (value === '') {
        e.target.value = '0';
        return;
    }
    
    const num = parseInt(value, 10);
    e.target.value = formatNumber(num);
});

// Default clean value on focus/blur
expenseAmountInput.addEventListener('focus', (e) => {
    if (e.target.value === '0') {
        e.target.value = '';
    }
});

expenseAmountInput.addEventListener('blur', (e) => {
    if (e.target.value === '') {
        e.target.value = '0';
    }
});

// --- Main Render Engine ---
function renderTable() {
    const filteredData = getFilteredData();
    
    if (filteredData.length === 0) {
        emptyStateContainer.classList.remove('hidden');
        expenseTableEl.classList.add('hidden');
        return;
    }
    
    emptyStateContainer.classList.add('hidden');
    expenseTableEl.classList.remove('hidden');
    
    expenseListBody.innerHTML = '';
    
    // Sort descending (newest date first)
    filteredData.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    
    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        if (editId === item.id) {
            tr.className = 'editing-row';
        }
        
        // Check permissions: users can edit/delete ONLY their own items. Admin can do everything.
        const canControl = (currentMode === 'admin') || (item.user === currentUser);
        
        // Processing status badge (clickable only for Admin)
        const statusVal = item.status || 'unprocessed';
        const statusText = statusVal === 'processed' ? '처리' : '미처리';
        const isAdmin = currentMode === 'admin';
        
        tr.innerHTML = `
            <td class="text-center">
                <span class="status-box ${statusVal} ${isAdmin ? 'clickable' : ''}" 
                      ${isAdmin ? `onclick="toggleProcessingStatus('${item.id}')"` : ''}>
                    ${statusText}
                </span>
            </td>
            <td>${escapeHTML(item.date)}</td>
            <td>${escapeHTML(item.category)}</td>
            <td>${escapeHTML(item.team)}</td>
            <td>${escapeHTML(item.session)}</td>
            <td>${escapeHTML(item.desc)}</td>
            <td>${escapeHTML(item.user)}</td>
            <td>${escapeHTML(item.card)}</td>
            <td class="text-right">${formatNumber(item.amount)}</td>
            <td class="text-center">
                ${canControl ? `
                    <button type="button" class="table-action-btn btn-edit" title="수정" onclick="startEdit('${item.id}')">
                        <i class="fa-regular fa-pen-to-square"></i>
                    </button>
                    <button type="button" class="table-action-btn btn-delete" title="삭제" onclick="deleteRecord('${item.id}')">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                ` : `<span style="font-size:0.75rem; color:#94A3B8;">권한 없음</span>`}
            </td>
        `;
        expenseListBody.appendChild(tr);
    });
}

// Data Filter Resolver
function getFilteredData() {
    const extractMode = filterExtractor.value; // 'all' or 'mine'
    
    return expenses.filter(item => {
        // In User mode, always force showing own records only to maintain privacy/ownership
        if (currentMode === 'user') {
            return item.user === currentUser;
        }
        
        // In Admin mode, respect the Extractor dropdown filter
        if (extractMode === 'mine') {
            return item.user === currentUser;
        }
        
        return true; // Show all
    });
}

// Extractor Select Change triggers render refresh
filterExtractor.addEventListener('change', renderTable);

// --- CRUD Core Handlers ---

// Form submission handler
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const date = expenseDateInput.value;
    const category = expenseCategorySelect.value;
    const team = expenseTeamSelect.value;
    const session = expenseSessionSelect.value;
    const desc = expenseDescInput.value.trim();
    const user = expenseUserInput.value.trim();
    const card = expenseCardInput.value.trim();
    const amount = parseAmount(expenseAmountInput.value);
    
    // Core Form Validation
    if (!date || !category || !team || !session || !desc || !user || !card || amount <= 0) {
        showToast('필수 입력 항목을 채우고 금액은 1원 이상 입력하세요.', 'error');
        return;
    }
    
    const timestamp = Date.now();
    const activeEditId = editIdInput.value;
    
    if (activeEditId) {
        // MODE: UPDATE
        const idx = expenses.findIndex(x => x.id === activeEditId);
        if (idx !== -1) {
            // Verify permission check again before modification
            if (currentMode === 'user' && expenses[idx].user !== currentUser) {
                showToast('본인의 전표 외에는 수정 권한이 없습니다.', 'error');
                return;
            }
            
            const updatedRecord = {
                date,
                category,
                team,
                session,
                desc,
                user,
                card,
                amount,
                updatedAt: timestamp
            };
            
            try {
                // Post to REST API
                const res = await fetch(`/api/expenses/${activeEditId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedRecord)
                });
                
                if (res.ok) {
                    const result = await res.json();
                    // Double submission / race-condition prevention
                    const currentIdx = expenses.findIndex(x => x.id === activeEditId);
                    if (currentIdx !== -1) {
                        expenses[currentIdx] = result.payload;
                    } else {
                        expenses.push(result.payload);
                    }
                    showToast('전표가 정상적으로 수정 반영되었습니다. (서버 누적 저장)');
                    resetForm();
                } else {
                    showToast('서버 수정 반영 실패', 'error');
                }
            } catch (err) {
                showToast('서버 연결 실패 (네트워크 점검 필요)', 'error');
            }
        }
    } else {
        // MODE: CREATE
        const newRecord = {
            id: `lg_exp_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
            date,
            category,
            team,
            session,
            desc,
            user,
            card,
            amount,
            status: 'unprocessed',
            createdAt: timestamp,
            updatedAt: timestamp
        };
        
        try {
            // Post to REST API
            const res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRecord)
            });
            
            if (res.ok) {
                const result = await res.json();
                // Double submission / race-condition prevention
                if (!expenses.some(x => x.id === result.payload.id)) {
                    expenses.push(result.payload);
                }
                showToast('전표 등록 완료. 협업 중인 다른 팀원들과 실시간 동기화됩니다.');
                resetForm();
            } else {
                showToast('서버 저장 실패', 'error');
            }
        } catch (err) {
            showToast('서버 연결 실패 (네트워크 점검 필요)', 'error');
        }
    }
    
    renderTable();
});

// Toggle processing status (Admin only)
window.toggleProcessingStatus = async function(id) {
    if (currentMode !== 'admin') return;
    
    const idx = expenses.findIndex(x => x.id === id);
    if (idx === -1) return;
    
    const item = expenses[idx];
    const newStatus = (item.status === 'processed') ? 'unprocessed' : 'processed';
    
    try {
        const res = await fetch(`/api/expenses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            const result = await res.json();
            expenses[idx] = result.payload;
            renderTable();
            showToast(`전표 상태가 '${newStatus === 'processed' ? '처리' : '미처리'}' 상태로 성공적으로 업데이트되었습니다.`);
        } else {
            showToast('서버 상태 변경 실패', 'error');
        }
    } catch (err) {
        showToast('서버 통신 실패', 'error');
    }
};

// Edit Mode Activation
window.startEdit = function(id) {
    const item = expenses.find(x => x.id === id);
    if (!item) return;
    
    // Check permission
    if (currentMode === 'user' && item.user !== currentUser) {
        showToast('본인 전표 외에는 수정 권한이 없습니다.', 'error');
        return;
    }
    
    editId = id;
    editIdInput.value = item.id;
    expenseDateInput.value = item.date;
    expenseCategorySelect.value = item.category;
    
    // Dynamic team dropdown update before value assignment
    updateTeamDropdownOptions();
    
    expenseTeamSelect.value = item.team;
    expenseSessionSelect.value = item.session;
    expenseDescInput.value = item.desc;
    expenseUserInput.value = item.user;
    expenseCardInput.value = item.card;
    expenseAmountInput.value = formatNumber(item.amount);
    
    // UI layout shifts to Edit row styling
    submitText.textContent = '수정 완료';
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span id="submit-text">수정 완료</span>';
    cancelEditBtn.classList.remove('hidden');
    
    renderTable(); // Triggers editing row background highlight
    expenseForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Cancel Edit row state
cancelEditBtn.addEventListener('click', resetForm);

function resetForm() {
    editId = '';
    editIdInput.value = '';
    expenseForm.reset();
    setDefaultDate();
    
    // Adjust forms matching active mode constraints
    adjustFormForMode();
    
    // Populate team options for default category
    updateTeamDropdownOptions();
    
    // Restore primary submit button styles
    submitText.textContent = '제출하기';
    submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span id="submit-text">제출하기</span>';
    cancelEditBtn.classList.add('hidden');
    
    renderTable();
}

// Delete row
window.deleteRecord = async function(id) {
    const item = expenses.find(x => x.id === id);
    if (!item) return;
    
    // Check permission
    if (currentMode === 'user' && item.user !== currentUser) {
        showToast('본인 전표 외에는 삭제 권한이 없습니다.', 'error');
        return;
    }
    
    if (!confirm('해당 비용 정산 전표를 삭제하시겠습니까?')) return;
    
    try {
        const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const idx = expenses.findIndex(x => x.id === id);
            if (idx !== -1) {
                expenses.splice(idx, 1);
            }
            showToast('전표가 서버 및 목록에서 제거되었습니다.', 'info');
            renderTable();
            
            if (editIdInput.value === id) {
                resetForm();
            }
        } else {
            showToast('서버 삭제 처리 실패', 'error');
        }
    } catch (err) {
        showToast('서버 연결 실패', 'error');
    }
};

// Clear All Data
clearAllBtn.addEventListener('click', async () => {
    if (expenses.length === 0) {
        showToast('초기화할 지출 전표 데이터가 없습니다.', 'error');
        return;
    }
    if (!confirm('협업 채널에 기록된 모든 정산 데이터가 완전 초기화됩니다.\n계속하시겠습니까?')) return;
    
    try {
        const res = await fetch('/api/expenses', { method: 'DELETE' });
        if (res.ok) {
            expenses = [];
            showToast('전체 전표 정보가 초기화되었습니다. (서버 초기화 완료)', 'info');
            resetForm();
            renderTable();
        } else {
            showToast('서버 전체 초기화 실패', 'error');
        }
    } catch (err) {
        showToast('서버 연결 실패', 'error');
    }
});

// --- Native WebSocket Real-time Synchronization Engine ---
function initWebSocketRealtimeSync() {
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.host}`;
    
    updateMqttBadgeStatus('connecting');
    
    try {
        socket = new WebSocket(socketUrl);
        
        socket.onopen = () => {
            updateMqttBadgeStatus('online');
            console.log('Successfully connected to own backend WebSocket server.');
        };
        
        socket.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                handleWebSocketSyncPacket(packet);
            } catch (err) {
                console.error('Failed to parse WebSocket message packet:', err);
            }
        };
        
        socket.onclose = () => {
            updateMqttBadgeStatus('offline');
            console.log('Disconnected from backend WebSocket server. Reconnecting in 5 seconds...');
            setTimeout(initWebSocketRealtimeSync, 5000); // Auto reconnect loop
        };
        
        socket.onerror = (err) => {
            console.error('WebSocket engine encountered error:', err);
            updateMqttBadgeStatus('offline');
        };
        
    } catch (e) {
        console.error('WebSocket boot crash:', e);
        updateMqttBadgeStatus('offline');
    }
}

// Update top navbar status badge visually
function updateMqttBadgeStatus(status) {
    syncStatusBadge.className = 'sync-badge';
    const statusLabel = syncStatusBadge.querySelector('.status-label');
    
    if (status === 'online') {
        syncStatusBadge.classList.add('status-online');
        statusLabel.textContent = '실시간 협업 채널 활성화됨';
    } else if (status === 'connecting') {
        syncStatusBadge.classList.add('status-connecting');
        statusLabel.textContent = '협업 채널 연결 중';
    } else {
        syncStatusBadge.classList.add('status-offline');
        statusLabel.textContent = '실시간 협업 채널 비활성화됨';
    }
}

// P2P/Server Broadcast Packet Handler
function handleWebSocketSyncPacket(packet) {
    const { type, payload } = packet;
    let didChange = false;
    
    switch (type) {
        case 'ADD':
            if (!expenses.some(x => x.id === payload.id)) {
                expenses.push(payload);
                didChange = true;
                showToast(`[협업] ${payload.user}님이 비용 전표를 신규 제출하였습니다.`, 'info');
            }
            break;
            
        case 'UPDATE':
            const existingIdx = expenses.findIndex(x => x.id === payload.id);
            if (existingIdx !== -1) {
                const localItem = expenses[existingIdx];
                const localTime = localItem.updatedAt || localItem.createdAt || 0;
                const remoteTime = payload.updatedAt || payload.createdAt || 0;
                
                if (remoteTime > localTime) {
                    expenses[existingIdx] = payload;
                    didChange = true;
                    showToast(`[협업] ${payload.user}님이 제출한 비용 전표가 실시간 수정되었습니다.`, 'info');
                }
            } else {
                expenses.push(payload);
                didChange = true;
            }
            break;
            
        case 'DELETE':
            const delIdx = expenses.findIndex(x => x.id === payload.id);
            if (delIdx !== -1) {
                expenses.splice(delIdx, 1);
                didChange = true;
                showToast(`[협업] 전표가 다른 단말기에 의해 삭제되었습니다.`, 'info');
                
                if (editIdInput.value === payload.id) {
                    resetForm();
                }
            }
            break;
            
        case 'CLEAR':
            if (expenses.length > 0) {
                expenses = [];
                didChange = true;
                showToast(`[협업] 협업 채널 전표 DB가 전체 초기화되었습니다.`, 'info');
                resetForm();
            }
            break;
    }
    
    if (didChange) {
        renderTable();
    }
}

// --- Excel (CSV) Download Module ---
excelExportBtn.addEventListener('click', () => {
    const activeData = getFilteredData();
    if (activeData.length === 0) {
        showToast('내보낼 지출 전표 데이터가 존재하지 않습니다.', 'error');
        return;
    }
    
    const headers = ['처리여부', '결제일', '활동 카테고리', '소속 조/팀', '활동 회기', '활동 목적', '결제당사자', '카드번호', '결제 비용 (원)'];
    
    const rows = activeData.map(item => [
        item.status === 'processed' ? '처리' : '미처리',
        item.date,
        item.category,
        item.team,
        item.session,
        item.desc.replace(/"/g, '""'), // Escape quotes for CSV standard
        item.user,
        item.card,
        item.amount
    ]);
    
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        const formattedRow = row.map(val => `"${val}"`).join(',');
        csvContent += formattedRow + '\n';
    });
    
    // Prepend UTF-8 BOM to prevent Korean Mojibake character corruption in MS Excel
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `LG_Teams_비용정산_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('전표 내역이 Excel CSV 파일로 성공적으로 추출되었습니다.');
});

// --- Sample Data Loader ---
sampleDataBtn.addEventListener('click', async () => {
    const testSamples = [
        {
            id: 'lg_sample_1',
            date: '2026-06-01',
            category: '실장 Cross 커뮤니티',
            team: '수도권중부 1팀',
            session: '1회기',
            desc: '그룹코칭 팀 교류 저녁 식대',
            user: '남우섭',
            card: '1234-5678-****',
            amount: 124000,
            createdAt: Date.now() - 50000,
            updatedAt: Date.now() - 50000
        },
        {
            id: 'lg_sample_2',
            date: '2026-06-01',
            category: '조직문화 활성화',
            team: '수도권중부 2팀',
            session: '2회기',
            desc: '부서 세미나용 커피 및 도넛 다과비',
            user: '김철수',
            card: '9876-5432-****',
            amount: 45000,
            createdAt: Date.now() - 40000,
            updatedAt: Date.now() - 40000
        },
        {
            id: 'lg_sample_3',
            date: '2026-05-28',
            category: '부서 소통활동',
            team: '본부/실',
            session: '1회기',
            desc: '팀 오찬 간담회 식사 전표',
            user: '이영희',
            card: '4321-8765-****',
            amount: 88000,
            createdAt: Date.now() - 30000,
            updatedAt: Date.now() - 30000
        },
        {
            id: 'lg_sample_4',
            date: '2026-05-25',
            category: '기타',
            team: '수도권중부 1팀',
            session: '3회기',
            desc: '사무실 복사 용지 및 형광펜 구매',
            user: '남우섭',
            card: '1234-5678-****',
            amount: 18500,
            createdAt: Date.now() - 20000,
            updatedAt: Date.now() - 20000
        }
    ];
    
    let addedCount = 0;
    for (const sample of testSamples) {
        if (!expenses.some(x => x.id === sample.id)) {
            try {
                const res = await fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sample)
                });
                if (res.ok) {
                    const result = await res.json();
                    expenses.push(result.payload);
                    addedCount++;
                }
            } catch (err) {
                console.error('Failed to upload sample record:', err);
            }
        }
    }
    
    if (addedCount > 0) {
        renderTable();
        showToast(`${addedCount}개의 LG전자 업무용 샘플 전표 데이터가 서버 DB에 일괄 저장되었습니다.`);
    } else {
        showToast('샘플 전표 데이터가 이미 서버 DB에 로드되어 있습니다.', 'info');
    }
});

// --- Initializing Event Listeners & Bootstrapping ---

// Tab clicks toggling User vs Admin mode
tabUser.addEventListener('click', () => switchMode('user'));
tabAdmin.addEventListener('click', () => {
    if (currentMode === 'admin') return;
    
    const adminPass = prompt("관리자의 사번을 입력하시오");
    if (adminPass === "307880") {
        switchMode('admin');
    } else if (adminPass === null) {
        showToast('관리자 인증이 취소되었습니다.', 'error');
    } else {
        showToast('사번이 올바르지 않습니다. 관리자 권한을 획득할 수 없습니다.', 'error');
    }
});

// DOM Initialization
window.addEventListener('DOMContentLoaded', async () => {
    loadPreferences();
    setDefaultDate();
    
    // Fetch all records from Express REST database upon boot
    await fetchExpensesFromServer();
    
    // Prompt for name on startup in User Mode
    let startName = prompt("이름을 입력하시오");
    if (startName && startName.trim() !== "") {
        currentUser = startName.trim();
        localStorage.setItem('lg_expense_username', currentUser);
    }
    currentUserNameEl.textContent = currentUser;
    
    // Initialize dynamic team dropdown options
    updateTeamDropdownOptions();
    
    // Always default to User mode upon initial page loading for security
    switchMode('user');
    
    // Automatically trigger WebSocket connection to backend server
    initWebSocketRealtimeSync();
});
