const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMomI2MvGXepBVFbcJkQ2zGPc3e5TEz_tHsSaIjXb19RZ3lAv2A5_18vk1UC6Cew_H/exec';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MANUAL_PENDING_STATUS = 'Pending (Manual)';

let globalDropdownData = null;
let itemCount = 0;
let currentUser = null;
let approvalModalInstance = null;
let lastUserName = null;
let currentSubmitId = null;
let dashboardStatusFilter = 'all';
window.dashboardData = [];

document.addEventListener('DOMContentLoaded', () => {
    const autoDateEl = document.getElementById('autoDate');
    if(autoDateEl) autoDateEl.innerText = new Date().toLocaleDateString('en-GB');

    document.getElementById('showRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('registerContainer').style.display = 'block';
    });

    document.getElementById('showLogin')?.addEventListener('click', (e) => {
        document.getElementById('registerContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'block';
    });

    document.getElementById('togglePassword')?.addEventListener('click', function() {
        const passInput = document.getElementById('loginPass');
        const icon = this.querySelector('i');
        if (passInput.type === 'password') {
            passInput.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            passInput.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // Passwords are no longer kept in the browser; remove any copy saved by older versions
    safeStorageRemove(localStorage, 'savedApprovalPass');
    const savedId = safeStorageGet(localStorage, 'savedApprovalId');
    if(savedId) {
        const loginIdEl = document.getElementById('loginId');
        if (loginIdEl) loginIdEl.value = savedId;
        const rememberMeEl = document.getElementById('rememberMe');
        if (rememberMeEl) rememberMeEl.checked = true;
    }

    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnAddItem')?.addEventListener('click', addNewItem);
    document.getElementById('approvalForm')?.addEventListener('submit', handleFormSubmit);
    document.getElementById('modalApprovalForm')?.addEventListener('submit', handleModalSubmit);
    document.getElementById('btnBatchSend')?.addEventListener('click', handleBatchSend);
    document.getElementById('btnBatchPrint')?.addEventListener('click', handleBatchPrint);
    document.getElementById('dashboardTableBody')?.addEventListener('click', handleDashboardAction);
    document.getElementById('dashboardTableBody')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('req-cb')) updateSelectionUI();
    });
    document.getElementById('selectAllReq')?.addEventListener('change', (e) => {
        document.querySelectorAll('.req-cb').forEach(cb => { cb.checked = e.target.checked; });
        updateSelectionUI();
    });
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            dashboardStatusFilter = tab.getAttribute('data-status') || 'all';
            document.querySelectorAll('.status-tab').forEach(t => {
                const isActive = t === tab;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            applyDashboardFilters();
        });
    });
    document.getElementById('itemsContainer')?.addEventListener('input', updateFormTotals);
    document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);

    const requestorInput = document.getElementById('requestorName');
    if (requestorInput) {
        setupCombobox(requestorInput, () => (globalDropdownData && globalDropdownData.requestorNames) ? globalDropdownData.requestorNames : []);
    }

    document.querySelectorAll('.sidemenu-btn').forEach(btn => {
        if(btn.id !== 'btnLoadDashboard') {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.sidemenu-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');

                document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
                const targetId = e.currentTarget.getAttribute('data-target');
                if(document.getElementById(targetId)) {
                    document.getElementById(targetId).style.display = 'block';
                    if(targetId === 'formSection') {
                        resetCreateForm();
                    }
                }
                if(window.innerWidth <= 768) {
                    closeMobileSidebar();
                }
            });
        }
    });

    document.getElementById('btnLoadDashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidemenu-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
        document.getElementById('dashboardSection').style.display = 'block';
        document.querySelector('.page-title').innerText = 'Dashboard';
        fetchDashboard();
        if(window.innerWidth <= 768) {
            closeMobileSidebar();
        }
    });

    document.getElementById('btnRefreshDashboard')?.addEventListener('click', fetchDashboard);

    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('sidebarMenu').classList.toggle('collapsed');
    });
    document.getElementById('btnMobileToggle')?.addEventListener('click', () => {
        document.getElementById('sidebarMenu').classList.add('show');
        document.getElementById('sidebarMenu').classList.remove('collapsed');
        document.getElementById('sidebarBackdrop')?.classList.add('show');
    });

    document.getElementById('searchDashboard')?.addEventListener('input', applyDashboardFilters);

    if(document.getElementById('approvalModal') && window.bootstrap) {
        approvalModalInstance = new bootstrap.Modal(document.getElementById('approvalModal'));
    }

    checkLocalSession();
    fetchDropdownData();
});

// ---------- Helpers ----------

function toText(value) {
    return (value === null || value === undefined) ? '' : String(value);
}

function escapeHtml(value) {
    return toText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toNumber(value) {
    const num = parseFloat(toText(value).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function formatMoney(value) {
    return toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function uniqueStrings(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    list.forEach(val => {
        const str = toText(val).trim();
        if (str && !seen.has(str.toLowerCase())) {
            seen.add(str.toLowerCase());
            result.push(str);
        }
    });
    return result;
}

// Convert a sheet value ("2026-10-11", ISO timestamp or Date string) to "YYYY-MM-DD" in local time.
// Splitting an ISO string at "T" gives the UTC date, which is one day early for Thailand (UTC+7).
function toInputDate(value) {
    const str = toText(value).trim();
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function formatDisplayDate(value) {
    const iso = toInputDate(value);
    if (!iso) return toText(value);
    const parts = iso.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function newSubmitId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}

function showToast(message, type) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const kind = type || 'success';
    const icon = kind === 'error' ? 'fa-circle-exclamation' : (kind === 'info' ? 'fa-circle-info' : 'fa-circle-check');
    const toast = document.createElement('div');
    toast.className = 'app-toast toast-' + kind;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i><div>' + escapeHtml(message) + '</div>';
    stack.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 200);
    }, kind === 'error' ? 6000 : 4000);
}

function closeMobileSidebar() {
    document.getElementById('sidebarMenu')?.classList.remove('show');
    document.getElementById('sidebarBackdrop')?.classList.remove('show');
}

function initialsOf(name) {
    const parts = toText(name).replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + second).toUpperCase();
}

function updateFormTotals() {
    let grand = 0;
    document.querySelectorAll('#itemsContainer .item-block').forEach(block => {
        const total = toNumber(block.querySelector('.item-amt').value) + toNumber(block.querySelector('.item-vat').value) - toNumber(block.querySelector('.item-wht').value);
        grand += total;
        const headTotal = block.querySelector('.item-head-total');
        if (headTotal) headTotal.innerText = formatMoney(total);
    });
    const grandEl = document.getElementById('formGrandTotal');
    if (grandEl) grandEl.innerText = formatMoney(grand);
}

function safeStorageGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
}

function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) { console.warn('Storage unavailable', e); }
}

function safeStorageRemove(storage, key) {
    try { storage.removeItem(key); } catch (e) { /* ignore */ }
}

async function parseScriptResponse(response) {
    if (!response.ok) throw new Error('Server responded with status ' + response.status + '.');
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error('Invalid server response:', text);
        throw new Error('Invalid response from server. Please try again.');
    }
}

// Sends the login token with every request; when the server says the session is invalid, return to the login screen.
async function postToScript(payload) {
    const body = Object.assign({}, payload);
    if (currentUser && currentUser.token) body.token = currentUser.token;
    // Older backend versions read the user from the request instead of the token; the current backend ignores this
    if (currentUser && !('user' in body)) body.user = { id: currentUser.id, name: currentUser.name, branch: currentUser.branch, role: currentUser.role };
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await parseScriptResponse(response);
    if (result && result.code === 'AUTH_REQUIRED') {
        forceRelogin(result.message);
        throw new Error(result.message || 'Please login again.');
    }
    return result;
}

// Keeps the request form so the same user can log in again and save what they typed
function forceRelogin(message) {
    if (approvalModalInstance) approvalModalInstance.hide();
    handleLogout(true);
    const alertBox = document.getElementById('loginAlert');
    if (alertBox) {
        alertBox.innerText = message || 'Your session has expired. Please login again.';
        alertBox.style.display = 'block';
    }
}

// Searchable dropdown: shows all options on focus, filters while typing, and still accepts free text.
function setupCombobox(input, getOptions) {
    const wrapper = input.parentElement;
    const list = document.createElement('ul');
    list.className = 'combo-list';
    list.id = input.id + 'List';
    list.setAttribute('role', 'listbox');
    wrapper.appendChild(list);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');

    let matches = [];
    let activeIndex = -1;

    function highlight(text, keyword) {
        if (!keyword) return escapeHtml(text);
        const idx = text.toLowerCase().indexOf(keyword);
        if (idx < 0) return escapeHtml(text);
        return escapeHtml(text.slice(0, idx)) +
            '<mark>' + escapeHtml(text.slice(idx, idx + keyword.length)) + '</mark>' +
            escapeHtml(text.slice(idx + keyword.length));
    }

    function open() {
        const keyword = input.value.trim().toLowerCase();
        const options = getOptions() || [];
        matches = keyword ? options.filter(opt => opt.toLowerCase().includes(keyword)) : options.slice();
        activeIndex = -1;

        if (matches.length === 0) {
            if (options.length === 0 || !keyword) {
                close();
                return;
            }
            list.innerHTML = '<li class="combo-empty">No match – "' + escapeHtml(input.value.trim()) + '" will be used</li>';
        } else {
            list.innerHTML = matches.map((opt, i) =>
                '<li class="combo-item" role="option" data-index="' + i + '">' + highlight(opt, keyword) + '</li>'
            ).join('');
        }
        list.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
    }

    function close() {
        list.style.display = 'none';
        activeIndex = -1;
        input.setAttribute('aria-expanded', 'false');
    }

    function setActive(index) {
        const items = list.querySelectorAll('.combo-item');
        if (items.length === 0) return;
        activeIndex = (index + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function choose(index) {
        if (index < 0 || index >= matches.length) return;
        input.value = matches[index];
        close();
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', () => { if (list.style.display !== 'block') open(); });
    input.addEventListener('input', open);
    input.addEventListener('blur', close);
    input.addEventListener('keydown', (e) => {
        const isOpen = list.style.display === 'block';
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) open();
            setActive(activeIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) open();
            setActive(activeIndex - 1);
        } else if (e.key === 'Enter') {
            if (isOpen && activeIndex >= 0) {
                e.preventDefault();
                choose(activeIndex);
            }
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            close();
        }
    });
    // mousedown (not click) so the choice is made before the input loses focus
    list.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = e.target.closest('.combo-item');
        if (item) choose(parseInt(item.getAttribute('data-index'), 10));
    });
}

// ---------- Session ----------

function checkLocalSession() {
    const savedUserLocal = safeStorageGet(localStorage, 'approvalAppUser');
    const savedUserSession = safeStorageGet(sessionStorage, 'approvalAppUser');
    try {
        if (savedUserLocal) {
            currentUser = JSON.parse(savedUserLocal);
        } else if (savedUserSession) {
            currentUser = JSON.parse(savedUserSession);
        }
    } catch (e) {
        currentUser = null;
    }
    // Corrupted session: login again (sessions without a token are rejected by the server with AUTH_REQUIRED)
    if (!currentUser || typeof currentUser !== 'object' || !currentUser.name) {
        const hadSession = !!(savedUserLocal || savedUserSession);
        currentUser = null;
        safeStorageRemove(localStorage, 'approvalAppUser');
        safeStorageRemove(sessionStorage, 'approvalAppUser');
        const alertBox = document.getElementById('loginAlert');
        if (hadSession && alertBox) {
            alertBox.innerText = 'Please login again.';
            alertBox.style.display = 'block';
        }
        return;
    }
    showAppScreen();
}

function showAppScreen() {
    if(!currentUser) return;
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('registerContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';

    const sidebarName = document.getElementById('sidebarUserName');
    if(sidebarName) sidebarName.innerText = currentUser.name ? currentUser.name : '';

    const roleBadge = document.getElementById('userRoleBadge');
    if(roleBadge) roleBadge.innerText = currentUser.role ? currentUser.role : 'User';

    const avatar = document.getElementById('userAvatar');
    if(avatar) avatar.innerText = initialsOf(currentUser.name);

    const senderInput = document.getElementById('senderName');
    if(senderInput) senderInput.value = currentUser.name ? currentUser.name : '';

    // Set the default branch on items that were created before login
    document.querySelectorAll('.item-block .item-branch').forEach(sel => {
        if (!sel.value && currentUser.branch) sel.value = currentUser.branch;
    });
}

function handleLogout(keepForm) {
    safeStorageRemove(localStorage, 'approvalAppUser');
    safeStorageRemove(sessionStorage, 'approvalAppUser');
    lastUserName = (keepForm === true && currentUser) ? currentUser.name : null;
    currentUser = null;
    window.dashboardData = [];
    const tbody = document.getElementById('dashboardTableBody');
    if (tbody) tbody.innerHTML = '';
    const statusMsg = document.getElementById('statusMessage');
    if (statusMsg) statusMsg.innerText = '';
    if (!lastUserName) resetCreateForm();
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'block';
}

async function fetchDropdownData() {
    const approverSelect = document.getElementById('approverEmail');
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDropdowns');
        const data = await parseScriptResponse(response);
        if (!data || typeof data !== 'object') throw new Error('Invalid dropdown data.');

        globalDropdownData = {
            emails: uniqueStrings(data.emails),
            branches: uniqueStrings(data.branches),
            departments: uniqueStrings(data.departments),
            paymentMethods: uniqueStrings(data.paymentMethods),
            companies: uniqueStrings(data.companies),
            banks: uniqueStrings(data.banks),
            vendors: Array.isArray(data.vendors) ? data.vendors.filter(v => v && toText(v.name).trim()) : [],
            requestorNames: uniqueStrings(data.requestorNames)
        };

        populateSelect(approverSelect, globalDropdownData.emails, 'Select Approver...');
        populateSelect(document.getElementById('regBranch'), globalDropdownData.branches, 'Select Branch...');

        const bankDatalist = document.getElementById('bankOptions');
        if (bankDatalist) {
            bankDatalist.innerHTML = '';
            globalDropdownData.banks.forEach(bank => {
                const opt = document.createElement('option');
                opt.value = bank;
                bankDatalist.appendChild(opt);
            });
        }

        // Fill selects of items that were created before the data arrived
        document.querySelectorAll('.item-block').forEach(populateItemSelects);
    } catch (error) {
        console.error(error);
        if (approverSelect) approverSelect.innerHTML = '<option value="">Failed to load – please refresh the page</option>';
    } finally {
        if (itemCount === 0) addNewItem();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const alertBox = document.getElementById('loginAlert');
    const id = document.getElementById('loginId').value.trim();
    const password = document.getElementById('loginPass').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    alertBox.style.display = 'none';

    try {
        const result = await postToScript({ action: 'login', data: { id: id, password: password } });

        if (result.status === 'success' && result.user) {
            currentUser = Object.assign({}, result.user, result.token ? { token: result.token } : {});
            if(rememberMe) {
                safeStorageSet(localStorage, 'savedApprovalId', id);
                safeStorageSet(localStorage, 'approvalAppUser', JSON.stringify(currentUser));
            } else {
                safeStorageRemove(localStorage, 'savedApprovalId');
                safeStorageSet(sessionStorage, 'approvalAppUser', JSON.stringify(currentUser));
            }
            document.getElementById('loginPass').value = '';
            const sameUser = lastUserName && lastUserName === currentUser.name;
            lastUserName = null;
            showAppScreen();
            if (!sameUser) resetCreateForm();
        } else {
            alertBox.innerText = result.message ? result.message : 'Login failed.';
            alertBox.style.display = 'block';
        }
    } catch (error) {
        console.error(error);
        alertBox.innerText = 'System error: Cannot connect to server.';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Login';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btnRegister');
    const alertBox = document.getElementById('registerAlert');

    btn.disabled = true;
    btn.innerText = '...';
    alertBox.style.display = 'none';

    try {
        const result = await postToScript({
            action: 'register',
            data: {
                id: document.getElementById('regId').value.trim(),
                password: document.getElementById('regPass').value,
                name: document.getElementById('regName').value.trim(),
                branch: document.getElementById('regBranch').value
            }
        });

        if (result.status === 'success') {
            alertBox.className = 'alert alert-success app-alert';
            alertBox.innerText = 'Registration success! Wait for Admin approval.';
            alertBox.style.display = 'block';
            document.getElementById('registerForm').reset();
        } else {
            alertBox.className = 'alert alert-danger app-alert';
            alertBox.innerText = result.message ? result.message : 'Registration failed.';
            alertBox.style.display = 'block';
        }
    } catch (error) {
        console.error(error);
        alertBox.className = 'alert alert-danger app-alert';
        alertBox.innerText = 'System error.';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Sign Up';
    }
}

// ---------- Request form ----------

function resetCreateForm() {
    document.getElementById('editReqNo').value = '';
    document.querySelector('.page-title').innerText = 'Create Request';
    document.getElementById('approvalForm').reset();
    document.getElementById('itemsContainer').innerHTML = '';
    document.getElementById('senderName').value = (currentUser && currentUser.name) ? currentUser.name : '';
    document.getElementById('requestorName').value = '';
    currentSubmitId = newSubmitId();
    itemCount = 0;
    addNewItem();
    updateFormTotals();
}

function addNewItem() {
    const template = document.getElementById('itemTemplate');
    if(!template) return;

    itemCount++;
    const clone = template.content.cloneNode(true);
    const block = clone.querySelector('.item-block');
    block.querySelector('.item-number').innerText = itemCount;

    populateItemSelects(block);

    if (itemCount > 1) {
        const removeBtn = block.querySelector('.btn-remove-item');
        removeBtn.style.display = 'inline-flex';
        removeBtn.addEventListener('click', function() {
            block.remove();
            updateItemNumbers();
            updateFormTotals();
        });

        // Copy payment details from the first item (after the selects have their options)
        const firstBlock = document.querySelector('.item-block');
        if(firstBlock) {
            block.querySelector('.item-paymethod').value = firstBlock.querySelector('.item-paymethod').value;
            block.querySelector('.item-bank').value = firstBlock.querySelector('.item-bank').value;
            block.querySelector('.item-accname').value = firstBlock.querySelector('.item-accname').value;
            block.querySelector('.item-accno').value = firstBlock.querySelector('.item-accno').value;
        }
    }

    setupItemCalculations(block);
    setupPaymentLogic(block);

    const supplierSelect = block.querySelector('.item-supplier');
    supplierSelect.addEventListener('change', (e) => {
        if (!globalDropdownData) return;
        const selectedName = e.target.value;
        const vendor = globalDropdownData.vendors.find(v => toText(v.name) === selectedName);
        if (vendor) {
            block.querySelector('.item-accname').value = toText(vendor.name);
            block.querySelector('.item-bank').value = toText(vendor.bank);
            block.querySelector('.item-accno').value = toText(vendor.accNo);
        }
    });

    document.getElementById('itemsContainer').appendChild(block);

    if (itemCount > 1) {
        block.querySelector('.item-paymethod').dispatchEvent(new Event('change'));
    }
}

function populateItemSelects(block) {
    if (!globalDropdownData) return;
    populateSelect(block.querySelector('.item-branch'), globalDropdownData.branches, 'Select Branch');
    populateSelect(block.querySelector('.item-dept'), globalDropdownData.departments, 'Select Dept');
    populateSelect(block.querySelector('.item-paymethod'), globalDropdownData.paymentMethods, 'Select Method');
    populateSelect(block.querySelector('.item-company'), globalDropdownData.companies, 'Select Company');
    populateSelect(block.querySelector('.item-supplier'), globalDropdownData.vendors.map(v => toText(v.name)), 'Select Supplier');

    const branchSelect = block.querySelector('.item-branch');
    if (branchSelect && !branchSelect.value && currentUser && currentUser.branch) {
        branchSelect.value = currentUser.branch;
    }
}

// Builds options with the DOM API so names containing quotes or "&" cannot break the markup.
// Keeps the current selection when the list is refreshed.
function populateSelect(element, dataArray, defaultText) {
    if(!element) return;
    const previous = element.value;
    element.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = defaultText;
    element.appendChild(placeholder);
    (dataArray || []).forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        element.appendChild(opt);
    });
    if (previous) setSelectValue(element, previous);
}

// Sets a select's value; if the saved value is no longer in the list (e.g. removed from the sheet),
// add it so editing an old request does not silently lose the data.
function setSelectValue(select, value) {
    if (!select) return;
    const val = toText(value);
    if (!val) {
        select.value = '';
        return;
    }
    const exists = Array.from(select.options).some(opt => opt.value === val);
    if (!exists) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        select.appendChild(opt);
    }
    select.value = val;
}

function updateItemNumbers() {
    const blocks = document.querySelectorAll('.item-block');
    itemCount = blocks.length;
    blocks.forEach((block, index) => block.querySelector('.item-number').innerText = index + 1);
}

function setupItemCalculations(block) {
    const amtInput = block.querySelector('.item-amt');
    const vatInput = block.querySelector('.item-vat');
    const whtInput = block.querySelector('.item-wht');
    const totalInput = block.querySelector('.item-total');

    function calc() {
        let amt = parseFloat(amtInput.value) ? parseFloat(amtInput.value) : 0;
        let vat = parseFloat(vatInput.value) ? parseFloat(vatInput.value) : 0;
        let wht = parseFloat(whtInput.value) ? parseFloat(whtInput.value) : 0;
        totalInput.value = (amt + vat - wht).toFixed(2);
        updateFormTotals();
    }
    amtInput.addEventListener('input', () => {
        let amt = parseFloat(amtInput.value) ? parseFloat(amtInput.value) : 0;
        vatInput.value = (amt * 0.07).toFixed(2);
        calc();
    });
    vatInput.addEventListener('input', calc);
    whtInput.addEventListener('input', calc);
}

function setupPaymentLogic(block) {
    const paySelect = block.querySelector('.item-paymethod');
    const container = block.querySelector('.bank-details-container');
    const bankCol = block.querySelector('.bank-col');
    const nameCol = block.querySelector('.accname-col');
    const noCol = block.querySelector('.accno-col');
    const bankInput = block.querySelector('.item-bank');
    const nameInput = block.querySelector('.item-accname');
    const noInput = block.querySelector('.item-accno');

    paySelect.addEventListener('change', (e) => {
        let val = e.target.value.toLowerCase();
        [bankCol, nameCol, noCol].forEach(el => el.style.display = 'none');
        [bankInput, nameInput, noInput].forEach(el => el.required = false);

        if (val.includes('cash') || val.includes('cheque') || val.includes('transfer')) {
            container.style.display = 'flex';
            [bankCol, nameCol, noCol].forEach(el => el.style.display = 'block');
            nameCol.classList.replace('col-md-12', 'col-md-4');
            [bankInput, nameInput, noInput].forEach(el => el.required = true);
        } else {
            container.style.display = 'none';
        }
    });
}

// ฟังก์ชันแปลงไฟล์และรวมเป็น PDF เดียวโดยใช้ไลบรารี pdf-lib
async function processFilesToPDF(fileList) {
    if (!fileList || fileList.length === 0) return null;
    if (typeof PDFLib === 'undefined') throw new Error("ไม่สามารถโหลดระบบรวมไฟล์ PDF ได้ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่");

    const files = Array.from(fileList);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) throw new Error("ไฟล์แนบมีขนาดรวมใหญ่เกินไป (รวมกันต้องไม่เกิน 5MB)");

    const unsupported = files.find(f => ['application/pdf', 'image/jpeg', 'image/png'].indexOf(f.type) === -1);
    if (unsupported) throw new Error("ไฟล์ " + unsupported.name + " ไม่รองรับ (รองรับเฉพาะ PDF, PNG, JPG)");

    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        let hasContent = false;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const arrayBuffer = await file.arrayBuffer();

            if (file.type === 'application/pdf') {
                const loadedPdf = await PDFDocument.load(arrayBuffer);
                const pages = await pdfDoc.copyPages(loadedPdf, loadedPdf.getPageIndices());
                pages.forEach(page => pdfDoc.addPage(page));
                hasContent = true;
            } else if (file.type === 'image/jpeg' || file.type === 'image/png') {
                let img;
                if (file.type === 'image/jpeg') {
                    img = await pdfDoc.embedJpg(arrayBuffer);
                } else {
                    img = await pdfDoc.embedPng(arrayBuffer);
                }
                const page = pdfDoc.addPage([595.28, 841.89]); // ขนาด A4
                const imgDims = img.scaleToFit(500, 750);
                page.drawImage(img, {
                    x: (595.28 - imgDims.width) / 2,
                    y: (841.89 - imgDims.height) / 2,
                    width: imgDims.width,
                    height: imgDims.height
                });
                hasContent = true;
            }
        }

        if (!hasContent) return null;

        const pdfBytes = await pdfDoc.saveAsBase64();
        return {
            filename: 'Attached_Files.pdf',
            mimeType: 'application/pdf',
            bytes: pdfBytes
        };
    } catch (e) {
        console.error(e);
        throw new Error("เกิดข้อผิดพลาดในการรวมไฟล์ กรุณาตรวจสอบว่าไฟล์ไม่เสียหายหรือติดรหัสผ่าน");
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmit');
    const statusMsg = document.getElementById('statusMessage');

    if (btnSubmit.disabled) return;
    if (!currentUser) {
        statusMsg.innerText = 'Error: Session expired. Please login again.';
        statusMsg.className = 'status-message text-danger';
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Saving...';
    statusMsg.innerText = '';

    try {
        let selectedDocType = 'Payment Voucher';
        const docTypeChecked = document.querySelector('input[name="docType"]:checked');
        if(docTypeChecked) selectedDocType = docTypeChecked.value;

        const requestorName = document.getElementById('requestorName').value.trim().replace(/\s+/g, ' ');
        if (!requestorName) throw new Error("Please select or type the Requestor Name");

        const approverEmail = document.getElementById('approverEmail').value;
        if (!approverEmail) throw new Error("Please select an Approver");

        if (!currentSubmitId) currentSubmitId = newSubmitId();

        const reqData = {
            submitId: currentSubmitId,
            editReqNo: document.getElementById('editReqNo').value,
            // "requestorEmail" is kept as the key the backend already uses for the sender ("Requested By")
            requestorEmail: document.getElementById('senderName').value || currentUser.name || '',
            requestorName: requestorName,
            approverEmail: approverEmail,
            docType: selectedDocType,
            items: []
        };

        const blocks = document.querySelectorAll('.item-block');
        if (blocks.length === 0) throw new Error("Please add at least one item");

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const descInput = block.querySelector('.item-desc');
            const desc = descInput ? descInput.value.trim() : '';
            if(!desc) throw new Error("Please fill Description in Item #" + (i + 1));

            let photoData = null;
            const fileInput = block.querySelector('.item-photo');
            if (fileInput && fileInput.files.length > 0) {
                // เรียกใช้ฟังก์ชันรวมไฟล์ทั้งหมดให้เป็น PDF เดียว
                try {
                    photoData = await processFilesToPDF(fileInput.files);
                } catch (fileErr) {
                    throw new Error("Item #" + (i + 1) + ": " + fileErr.message);
                }
            }

            reqData.items.push({
                description: desc,
                amount: block.querySelector('.item-amt') ? block.querySelector('.item-amt').value : 0,
                vat: block.querySelector('.item-vat') ? block.querySelector('.item-vat').value : 0,
                wht: block.querySelector('.item-wht') ? block.querySelector('.item-wht').value : 0,
                total: block.querySelector('.item-total') ? block.querySelector('.item-total').value : 0,
                productPhoto: photoData,
                existingFileUrl: block.querySelector('.item-existing-file') ? block.querySelector('.item-existing-file').value : "",
                imageURL: block.querySelector('.item-imageurl') ? block.querySelector('.item-imageurl').value : "",
                invoice: block.querySelector('.item-inv') ? block.querySelector('.item-inv').value : "",
                branch: block.querySelector('.item-branch') ? block.querySelector('.item-branch').value : "",
                department: block.querySelector('.item-dept') ? block.querySelector('.item-dept').value : "",
                remarks: block.querySelector('.item-remark') ? block.querySelector('.item-remark').value : "",
                paymentMethod: block.querySelector('.item-paymethod') ? block.querySelector('.item-paymethod').value : "",
                bank: block.querySelector('.item-bank') ? block.querySelector('.item-bank').value : "",
                accName: block.querySelector('.item-accname') ? block.querySelector('.item-accname').value : "",
                accNo: block.querySelector('.item-accno') ? block.querySelector('.item-accno').value : "",
                paymentDate: block.querySelector('.item-paydate') ? block.querySelector('.item-paydate').value : "",
                companyName: block.querySelector('.item-company') ? block.querySelector('.item-company').value : "",
                supplierName: block.querySelector('.item-supplier') ? block.querySelector('.item-supplier').value : ""
            });
        }

        const result = await postToScript({ action: 'submitRequest', data: reqData });

        if (result.status === 'success') {
            resetCreateForm();
            statusMsg.innerText = "Success! Saved " + toText(result.reqNo);
            statusMsg.className = 'status-message text-success';
        } else {
            throw new Error(result.message ? result.message : 'Server error.');
        }
    } catch (error) {
        console.error(error);
        statusMsg.innerText = 'Error: ' + (error.message === 'Failed to fetch' ? 'Cannot connect to server.' : error.message);
        statusMsg.className = 'status-message text-danger';
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Save Request (Draft) <i class="fa-solid fa-floppy-disk ms-2" aria-hidden="true"></i>';
    }
}

// ---------- Dashboard ----------

async function handleBatchSend() {
    const checkedBoxes = document.querySelectorAll('.req-cb:checked');
    const checkedVals = Array.from(checkedBoxes).map(cb => cb.value);

    if(checkedVals.length === 0) {
        return showToast("Please select at least one request to send or resend.", 'info');
    }

    if(!confirm("Send " + checkedVals.length + " request(s) to Approver?")) return;

    const btn = document.getElementById('btnBatchSend');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Sending...</span>';
    btn.disabled = true;

    try {
        const result = await postToScript({ action: 'batchSendRequest', reqNos: checkedVals });

        if(result.status === 'success') {
            showToast('Approval email sent for ' + checkedVals.length + ' request(s).');
            fetchDashboard();
        } else {
            showToast('Error: ' + (result.message ? result.message : 'Unknown error.'), 'error');
        }
    } catch(err) {
        console.error(err);
        showToast('Network error while sending email.', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        updateSelectionUI();
    }
}

function findRequest(reqNo) {
    return window.dashboardData.find(r => toText(r.reqNo) === toText(reqNo));
}

window.editRequest = function(reqNo) {
    const req = findRequest(reqNo);
    if(!req) return;

    document.getElementById('approvalForm').reset();
    document.getElementById('statusMessage').innerText = '';
    document.getElementById('editReqNo').value = reqNo;
    currentSubmitId = newSubmitId();
    document.querySelector('.page-title').innerText = 'Edit Request: ' + reqNo;

    // Keep the original sender when editing someone else's request
    document.getElementById('senderName').value = req.requestor ? req.requestor : (currentUser ? currentUser.name : '');
    document.getElementById('requestorName').value = req.requestorName ? req.requestorName : '';

    const docRadios = document.querySelectorAll('input[name="docType"]');
    docRadios.forEach(r => {
        if(r.value === req.docType) r.checked = true;
    });

    document.getElementById('approverEmail').value = req.approver ? req.approver : "";
    document.getElementById('itemsContainer').innerHTML = '';
    itemCount = 0;

    (req.items || []).forEach(item => {
        addNewItem();
        const blocks = document.querySelectorAll('.item-block');
        const block = blocks[blocks.length - 1];

        block.querySelector('.item-desc').value = toText(item.description);
        block.querySelector('.item-existing-file').value = toText(item.productPhoto);
        block.querySelector('.item-imageurl').value = toText(item.imageURL);
        block.querySelector('.item-amt').value = toNumber(item.amount);
        block.querySelector('.item-vat').value = toNumber(item.vat);
        block.querySelector('.item-wht').value = toNumber(item.wht);
        block.querySelector('.item-total').value = toNumber(item.total);
        block.querySelector('.item-paydate').value = toInputDate(item.paymentDate);

        setSelectValue(block.querySelector('.item-company'), item.companyName);
        setSelectValue(block.querySelector('.item-supplier'), item.supplierName);
        block.querySelector('.item-inv').value = toText(item.invoice);
        setSelectValue(block.querySelector('.item-branch'), item.branch);
        setSelectValue(block.querySelector('.item-dept'), item.department);
        block.querySelector('.item-remark').value = toText(item.remarks);
        setSelectValue(block.querySelector('.item-paymethod'), item.paymentMethod);
        block.querySelector('.item-paymethod').dispatchEvent(new Event('change'));
        block.querySelector('.item-bank').value = toText(item.bank);
        block.querySelector('.item-accname').value = toText(item.accName);
        block.querySelector('.item-accno').value = toText(item.accNo);
    });

    if (itemCount === 0) addNewItem();
    updateFormTotals();

    document.querySelectorAll('.sidemenu-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.sidemenu-btn[data-target="formSection"]').classList.add('active');
    document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
    document.getElementById('formSection').style.display = 'block';
};

async function fetchDashboard() {
    const tbody = document.getElementById('dashboardTableBody');
    if (!currentUser) return;
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Loading data...</td></tr>';
    updateSelectionUI();

    try {
        const result = await postToScript({ action: 'getRequests' });

        if (result.status === 'success') {
            window.dashboardData = Array.isArray(result.data) ? result.data : [];
            applyDashboardFilters();
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>' + escapeHtml(result.message ? result.message : 'Failed to load data.') + '</td></tr>';
        }
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>Failed to load data. Please press Refresh.</td></tr>';
    }
}

function statusGroup(status) {
    const s = toText(status);
    if (s === 'Draft' || s === 'Pending' || s === 'Completed') return s;
    return 'Other';
}

function applyDashboardFilters() {
    const searchInput = document.getElementById('searchDashboard');
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const counts = { all: 0, Draft: 0, Pending: 0, Completed: 0, Other: 0 };

    const matched = window.dashboardData.filter(req => {
        return !keyword ||
               toText(req.reqNo).toLowerCase().includes(keyword) ||
               formatDisplayDate(req.date).includes(keyword) ||
               toText(req.requestor).toLowerCase().includes(keyword) ||
               toText(req.requestorName).toLowerCase().includes(keyword);
    });
    matched.forEach(req => {
        counts.all++;
        counts[statusGroup(req.status)]++;
    });
    document.querySelectorAll('.tab-count').forEach(el => {
        el.innerText = counts[el.getAttribute('data-count')] || 0;
    });

    const filtered = dashboardStatusFilter === 'all' ? matched : matched.filter(req => statusGroup(req.status) === dashboardStatusFilter);
    renderDashboard(filtered);
}

function statusPillHtml(req) {
    const status = toText(req.status);
    const map = {
        Draft: { cls: 'status-draft', icon: 'fa-file-pen' },
        Pending: { cls: 'status-pending', icon: 'fa-hourglass-half' },
        Completed: { cls: 'status-completed', icon: 'fa-circle-check' },
        Rejected: { cls: 'status-rejected', icon: 'fa-circle-xmark' },
        Partial: { cls: 'status-partial', icon: 'fa-circle-half-stroke' }
    };
    const conf = map[status] || map.Pending;
    let note = '';
    if (status === 'Pending') note = isManualPendingRequest(req) ? 'Awaiting signature' : 'Sent by email';
    return '<div class="status-cell"><span class="status-pill ' + conf.cls + '"><i class="fa-solid ' + conf.icon + '" aria-hidden="true"></i>' + escapeHtml(status || '-') + '</span>' +
        (note ? '<span class="status-note">' + note + '</span>' : '') + '</div>';
}

function getSelectedReqNos() {
    return Array.from(document.querySelectorAll('.req-cb:checked')).map(cb => cb.value);
}

function updateSelectionUI() {
    const boxes = Array.from(document.querySelectorAll('.req-cb'));
    const selected = boxes.filter(cb => cb.checked);
    boxes.forEach(cb => {
        const row = cb.closest('tr');
        if (row) row.classList.toggle('is-selected', cb.checked);
    });

    const selectAll = document.getElementById('selectAllReq');
    if (selectAll) {
        selectAll.checked = boxes.length > 0 && selected.length === boxes.length;
        selectAll.indeterminate = selected.length > 0 && selected.length < boxes.length;
        selectAll.disabled = boxes.length === 0;
    }

    const countEl = document.getElementById('selectedCount');
    if (countEl) countEl.innerText = selected.length === 0 ? 'No requests selected' : selected.length + ' request(s) selected';
    document.getElementById('bulkBar')?.classList.toggle('has-selection', selected.length > 0);

    ['btnBatchSend', 'btnBatchPrint'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && !btn.querySelector('.fa-spin')) btn.disabled = selected.length === 0;
    });
}

function renderDashboard(dataToRender) {
    const tbody = document.getElementById('dashboardTableBody');
    tbody.innerHTML = '';
    if (!dataToRender || dataToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i>No requests found.</td></tr>';
        updateSelectionUI();
        return;
    }

    dataToRender.forEach(req => {
        const reqNo = toText(req.reqNo);
        const status = toText(req.status);
        const date = formatDisplayDate(req.date);
        const reqAttr = escapeHtml(reqNo);

        let cbHtml = '<i class="fa-solid fa-check done-mark" aria-label="Completed"></i>';
        if (status !== 'Completed') {
            cbHtml = '<input type="checkbox" class="form-check-input req-cb" value="' + reqAttr + '" aria-label="Select ' + reqAttr + '" />';
        }

        let actions = '<button type="button" class="icon-btn" data-action="print" data-reqno="' + reqAttr + '" title="Print this request" aria-label="Print ' + reqAttr + '"><i class="fa-solid fa-print" aria-hidden="true"></i></button>';

        if (status !== 'Completed') {
            actions += '<button type="button" class="icon-btn" data-action="edit" data-reqno="' + reqAttr + '" title="Edit request" aria-label="Edit ' + reqAttr + '"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>';
        }

        // Only Admin can approve inside the system (requesters must not approve their own requests)
        if (currentUser && currentUser.role === 'Admin') {
            actions += '<button type="button" class="btn-chip btn-chip-review" data-action="review" data-reqno="' + reqAttr + '" title="Review items"><i class="fa-solid fa-list-check" aria-hidden="true"></i>Review</button>';
        }

        if (isManualPendingRequest(req)) {
            actions += '<button type="button" class="btn-chip btn-chip-approve" data-action="manual-approve" data-reqno="' + reqAttr + '" title="Mark as Approved (signed document)"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>Approved</button>';
        }

        let docTypeStr = req.docType && req.docType !== '-' ? req.docType : '-';
        let requestorNameStr = req.requestorName ? req.requestorName : '-';

        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td class="col-check">' + cbHtml + '</td>' +
            '<td class="cell-ref" data-label="Req No."><span class="ref-no">' + reqAttr + '</span><span class="doc-type">' + escapeHtml(docTypeStr) + '</span></td>' +
            '<td class="cell-muted" data-label="Date">' + escapeHtml(date) + '</td>' +
            '<td data-label="Senders">' + escapeHtml(req.requestor) + '</td>' +
            '<td data-label="Requestor Name">' + escapeHtml(requestorNameStr) + '</td>' +
            '<td data-label="Status">' + statusPillHtml(req) + '</td>' +
            '<td class="cell-num" data-label="Total (THB)">' + formatMoney(req.grandTotal) + '</td>' +
            '<td class="cell-actions text-end" data-label="Actions"><div class="row-actions">' + actions + '</div></td>';
        tbody.appendChild(tr);
    });
    updateSelectionUI();
}

function handleDashboardAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const reqNo = btn.getAttribute('data-reqno');
    const action = btn.getAttribute('data-action');
    if (action === 'print') printRequest(reqNo);
    if (action === 'edit') window.editRequest(reqNo);
    if (action === 'review') openReviewModal(reqNo);
    if (action === 'manual-approve') handleManualApprove(reqNo, btn);
}

function isManualPendingRequest(req) {
    return (req.items || []).some(item => toText(item.status).indexOf(MANUAL_PENDING_STATUS) === 0);
}

async function handleManualApprove(reqNo, btn) {
    const req = findRequest(reqNo);
    if (!req) return showToast('Request data not found.', 'error');
    if (!confirm('Change ' + reqNo + ' from Pending to Approved (Completed)?\nPlease confirm the Approver has signed the printed document.')) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Saving...';

    try {
        const result = await postToScript({ action: 'manualApprove', reqNo: reqNo });
        if (result.status === 'success') {
            showToast(reqNo + ' has been marked as Approved (Completed).');
            fetchDashboard();
        } else {
            showToast('Error: ' + (result.message ? result.message : 'Unknown error.'), 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Network error while updating the status.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

function printHtmlInFrame(html, title) {
    return new Promise(resolve => {
        document.querySelectorAll('iframe.print-frame').forEach(f => f.remove());
        const frame = document.createElement('iframe');
        frame.className = 'print-frame';
        frame.setAttribute('aria-hidden', 'true');
        frame.setAttribute('tabindex', '-1');
        frame.onload = () => {
            setTimeout(() => {
                const pageTitle = document.title;
                document.title = title;
                try {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                } finally {
                    document.title = pageTitle;
                    resolve();
                }
            }, 300);
        };
        frame.srcdoc = html;
        document.body.appendChild(frame);
    });
}

async function handleBatchPrint() {
    const checkedVals = getSelectedReqNos();

    if (checkedVals.length === 0) {
        return showToast("Please select at least one request to print.", 'info');
    }

    if (!confirm("Print " + checkedVals.length + " request(s) as PDF for manual approval?\nThe status will change to Pending.")) return;

    const btn = document.getElementById('btnBatchPrint');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Preparing...</span>';
    btn.disabled = true;

    try {
        const result = await postToScript({ action: 'printBatchRequest', reqNos: checkedVals });
        if (result.status !== 'success') throw new Error(result.message ? result.message : 'Unknown error.');

        const printedReqNos = (Array.isArray(result.reqNos) && result.reqNos.length ? result.reqNos.map(toText) : checkedVals.slice())
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const refreshed = await postToScript({ action: 'getRequests' });
        if (refreshed.status === 'success' && Array.isArray(refreshed.data)) {
            window.dashboardData = refreshed.data;
        }

        const requests = printedReqNos.map(findRequest).filter(Boolean);
        const html = buildApprovalPrintHtml(requests);
        if (!html) throw new Error('All items in the selected requests were rejected. Nothing to print.');

        btn.innerHTML = originalHtml;
        applyDashboardFilters();
        showToast(printedReqNos.length + ' request(s) are now Pending. Choose "Save as PDF" or a printer in the print window.');
        await printHtmlInFrame(html, ('Approval_' + printedReqNos.join('_')).slice(0, 120));
    } catch (err) {
        console.error(err);
        showToast('Error: ' + (err.message === 'Failed to fetch' ? 'Cannot connect to server.' : err.message), 'error');
    } finally {
        btn.innerHTML = originalHtml;
        updateSelectionUI();
    }
}

function buildApprovalPrintHtml(requests) {
    let sectionsHtml = '';
    const printedReqNos = [];
    let grandAmt = 0;
    let grandVat = 0;
    let grandWht = 0;
    let grandTotal = 0;
    let itemTotalCount = 0;

    requests.forEach(req => {
        const validItems = (req.items || []).filter(item => item.status !== 'Rejected');
        if (validItems.length === 0) return;

        const reqNo = toText(req.reqNo);
        printedReqNos.push(reqNo);

        let itemsRows = '';
        let sumAmt = 0;
        let sumVat = 0;
        let sumWht = 0;
        let sumTotal = 0;

        validItems.forEach((item, index) => {
            sumAmt += toNumber(item.amount);
            sumVat += toNumber(item.vat);
            sumWht += toNumber(item.wht);
            sumTotal += toNumber(item.total);
            itemTotalCount++;

            const formattedPayDate = formatDisplayDate(item.paymentDate);
            const detailRow = (label, value, extraStyle) =>
                '<tr><td style="color:#adb5bd; padding-right:5px;' + (extraStyle || '') + '">' + label + '</td><td style="color:#495057;">' + escapeHtml(value) + '</td></tr>';

            let detailsHtml = '';
            if (formattedPayDate) detailsHtml += detailRow('PAY DATE:', formattedPayDate, ' width:60px;');
            if (item.companyName) detailsHtml += detailRow('COMPANY:', item.companyName);
            if (item.supplierName) detailsHtml += detailRow('SUPPLIER:', item.supplierName);
            if (item.invoice) detailsHtml += detailRow('INV:', item.invoice);
            if (item.department) detailsHtml += detailRow('DEPT:', item.department);
            if (item.branch) detailsHtml += detailRow('BRANCH:', item.branch);
            if (item.paymentMethod) detailsHtml += detailRow('PAYMENT:', item.paymentMethod);
            if (item.bank) detailsHtml += detailRow('BANK:', item.bank);
            if (item.accName) detailsHtml += detailRow('A/C NAME:', item.accName);
            if (item.accNo) detailsHtml += detailRow('A/C NO:', item.accNo);
            if (item.remarks) detailsHtml += detailRow('REMARKS:', item.remarks);

            const itemStatus = toText(item.status).indexOf('Pending') > -1 ? 'Pending' : toText(item.status);
            const statusColor = itemStatus === 'Completed' ? '#28a745' : '#f09433';

            itemsRows +=
                '<tr>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; vertical-align: top; color: #495057; text-align: center;">' + (index + 1) + '</td>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; vertical-align: top;">' +
                        '<div style="font-weight: 700; font-size: 13px; color: #212529; margin-bottom: 4px;">' + escapeHtml(item.description) + '</div>' +
                        '<table style="width:100%; border:none; margin:0; font-size:10px; line-height:1.2;">' + detailsHtml + '</table>' +
                    '</td>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">' + formatMoney(item.amount) + '</td>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">' + formatMoney(item.vat) + '</td>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">' + formatMoney(item.wht) + '</td>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; font-weight: 700; color: #212529;">' + formatMoney(item.total) + '</td>' +
                    '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: center; vertical-align: top; font-weight: 700; color: ' + statusColor + '">' + escapeHtml(itemStatus) + '</td>' +
                '</tr>';
        });

        grandAmt += sumAmt;
        grandVat += sumVat;
        grandWht += sumWht;
        grandTotal += sumTotal;

        const docTypeStr = req.docType && req.docType !== '-' ? req.docType : 'Payment Voucher';
        const requestorNameStr = req.requestorName ? req.requestorName : '-';

        sectionsHtml +=
            '<div class="ref-section">' +
                '<table class="main-table">' +
                    '<thead>' +
                        '<tr><td colspan="7" class="ref-head-cell">' +
                            '<div class="ref-head">' +
                                '<div><span class="ref-no">' + escapeHtml(reqNo) + '</span> <span class="ref-type">(' + escapeHtml(docTypeStr) + ')</span></div>' +
                                '<div class="ref-meta">' +
                                    'Requestor Name: <strong>' + escapeHtml(requestorNameStr) + '</strong> &nbsp;|&nbsp; ' +
                                    'Senders: <strong>' + escapeHtml(req.requestor) + '</strong> &nbsp;|&nbsp; ' +
                                    'Date: <strong>' + escapeHtml(formatDisplayDate(req.date)) + '</strong>' +
                                '</div>' +
                            '</div>' +
                        '</td></tr>' +
                        '<tr>' +
                            '<th style="text-align: center; width: 5%;">#</th>' +
                            '<th style="text-align: left; width: 40%;">Description & Details</th>' +
                            '<th style="text-align: right; width: 11%;">Amount</th>' +
                            '<th style="text-align: right; width: 11%;">VAT(7%)</th>' +
                            '<th style="text-align: right; width: 11%;">WHT</th>' +
                            '<th style="text-align: right; width: 12%;">Total</th>' +
                            '<th style="text-align: center; width: 10%;">Item Status</th>' +
                        '</tr>' +
                    '</thead>' +
                    itemsRows +
                    '<tr class="subtotal-row">' +
                        '<td colspan="2" style="padding: 8px 6px; text-align: right; color: #6c757d;">Subtotal ' + escapeHtml(reqNo) + '</td>' +
                        '<td style="padding: 8px 6px; text-align: right; color: #495057;">' + formatMoney(sumAmt) + '</td>' +
                        '<td style="padding: 8px 6px; text-align: right; color: #495057;">' + formatMoney(sumVat) + '</td>' +
                        '<td style="padding: 8px 6px; text-align: right; color: #495057;">' + formatMoney(sumWht) + '</td>' +
                        '<td style="padding: 8px 6px; text-align: right; font-weight: 700; color: #212529;">' + formatMoney(sumTotal) + '</td>' +
                        '<td></td>' +
                    '</tr>' +
                '</table>' +
            '</div>';
    });

    if (!sectionsHtml) return '';

    const docTitle = ('Approval_' + printedReqNos.join('_')).slice(0, 120);

    return '<!DOCTYPE html>' +
        '<html><head><meta charset="UTF-8"><title>' + escapeHtml(docTitle) + '</title>' +
        '<style>' +
            '@media print { ' +
                '@page { margin: 15mm; size: A4 portrait; }' +
                'body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; margin: 0 !important; }' +
                '.doc { min-height: 255mm; }' +
            '}' +
            'body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #212529; max-width: 210mm; margin: 0 auto; }' +
            '.doc { display: flex; flex-direction: column; }' +
            '.doc-content { flex: 1 0 auto; }' +
            '.header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #e9ecef; padding-bottom: 15px; }' +
            '.details-box { background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 15px; }' +
            '.details-box p { margin: 0; font-size: 11px; }' +
            '.lbl { color: #6c757d; display: inline-block; width: 95px; }' +
            '.status-badge { font-weight: 600; padding: 3px 8px; border-radius: 4px; font-size: 10px; background-color: #fff3cd; color: #664d03; }' +
            '.ref-section { margin-bottom: 22px; }' +
            '.ref-head-cell { padding: 0 0 4px 0; }' +
            '.ref-head { background: #f1f3f5; border-radius: 6px; padding: 8px 12px; }' +
            '.ref-no { font-weight: 700; font-size: 14px; color: #212529; }' +
            '.ref-type { font-size: 12px; color: #6c757d; }' +
            '.ref-meta { font-size: 10px; color: #6c757d; margin-top: 3px; }' +
            '.main-table { width: 100%; border-collapse: collapse; font-size: 11px; }' +
            '.main-table th { color: #adb5bd; border-bottom: 2px solid #dee2e6; padding: 8px 6px; text-transform: uppercase; font-size: 9px; font-weight: 600; }' +
            '.main-table td table td { padding: 2px 0; border: none; }' +
            '.main-table tr { page-break-inside: avoid; break-inside: avoid; }' +
            '.subtotal-row td { font-size: 11px; border-top: 1px solid #dee2e6; }' +
            '.doc-closing { page-break-inside: avoid; break-inside: avoid; }' +
            '.summary-wrapper { display: flex; justify-content: flex-end; margin-top: 10px; }' +
            '.summary-box { width: 260px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }' +
            '.summary-row { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e9ecef; font-size: 10px; color: #495057; }' +
            '.summary-total { display: flex; justify-content: space-between; padding: 10px 12px; font-weight: 700; font-size: 13px; background-color: #f8f9fa; color: #212529; }' +
            '.total-amount-color { color: #dc3545; }' +
            '.sign-area { display: flex; justify-content: flex-end; margin-top: 18px; padding-top: 12px; border-top: 1px dashed #dee2e6; }' +
            '.sign-box { width: 320px; border: 1px solid #adb5bd; border-radius: 6px; padding: 10px 16px; text-align: center; font-size: 11px; color: #495057; }' +
            '.sign-title { font-weight: 700; font-size: 12px; color: #212529; margin-bottom: 4px; text-transform: uppercase; }' +
            '.sign-line { border-bottom: 1px solid #212529; height: 50px; margin: 0 10px; }' +
            '.sign-caption { font-size: 9px; color: #adb5bd; margin-top: 3px; text-transform: uppercase; }' +
            '.sign-name { margin-top: 8px; }' +
            '.sign-meta { margin-top: 6px; }' +
        '</style></head><body>' +
            '<div class="doc">' +
                '<div class="doc-content">' +
                    '<div class="header">' +
                        '<div>' +
                            '<h1 style="margin: 0 0 5px 0; font-size: 20px; color: #212529;">APPROVAL REQUEST</h1>' +
                            '<h2 style="margin: 0; color: #6c757d; font-size: 14px; font-weight: 500;">' + escapeHtml(printedReqNos.join(', ')) + '</h2>' +
                        '</div>' +
                    '</div>' +
                    '<div class="details-box">' +
                        '<p><span class="lbl">Requests:</span> <strong>' + printedReqNos.length + '</strong> (' + itemTotalCount + ' items)</p>' +
                        '<p><span class="lbl">Overall Status:</span> <span class="status-badge">Pending</span></p>' +
                        '<p><span class="lbl">Printed:</span> <strong>' + escapeHtml(formatDisplayDate(new Date())) + '</strong></p>' +
                    '</div>' +
                    sectionsHtml +
                '</div>' +
                '<div class="doc-closing">' +
                    '<div class="summary-wrapper">' +
                        '<div class="summary-box">' +
                            '<div class="summary-row"><span>Amount (Excl. VAT)</span><span style="font-weight: 600;">' + formatMoney(grandAmt) + '</span></div>' +
                            '<div class="summary-row"><span>VAT (7%)</span><span style="font-weight: 600;">' + formatMoney(grandVat) + '</span></div>' +
                            '<div class="summary-row"><span>Withholding Tax</span><span style="font-weight: 600;">' + formatMoney(grandWht) + '</span></div>' +
                            '<div class="summary-total"><span>GRAND TOTAL</span><span class="total-amount-color">' + formatMoney(grandTotal) + ' THB</span></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sign-area">' +
                        '<div class="sign-box">' +
                            '<div class="sign-title">Approver</div>' +
                            '<div class="sign-line"></div>' +
                            '<div class="sign-caption">Signature</div>' +
                            '<div class="sign-name">( ................................................................ )</div>' +
                            '<div class="sign-meta">Date: ........ / ........ / ............</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</body></html>';
}

function openReviewModal(reqNo) {
    const req = findRequest(reqNo);
    if(!req) return;
    if (!approvalModalInstance) return alert('Unable to open the review window. Please refresh the page.');

    document.getElementById('modalReqNo').innerText = reqNo;
    document.getElementById('modalReqNoInput').value = reqNo;
    document.getElementById('modalAlert').style.display = 'none';

    const tbody = document.getElementById('modalItemsBody');
    let rowsHtml = '';

    (req.items || []).forEach((item, index) => {
        const itemStatus = toText(item.status);
        let actionHtml = '';
        if (itemStatus.indexOf('Pending') > -1) {
            actionHtml = '<div class="decision">' +
                '<label class="decision-approve"><input type="radio" name="item_' + index + '" value="Approve" class="form-check-input" required /> Approve</label>' +
                '<label class="decision-reject"><input type="radio" name="item_' + index + '" value="Reject" class="form-check-input" required /> Reject</label>' +
            '</div>';
        } else {
            let bClass = itemStatus === 'Completed' ? 'status-completed' : (itemStatus === 'Rejected' ? 'status-rejected' : 'status-draft');
            actionHtml = '<span class="status-pill ' + bClass + '">' + escapeHtml(itemStatus || '-') + '</span>';
        }

        let invText = item.invoice ? item.invoice : '-';
        let deptText = item.department ? item.department : '-';

        rowsHtml += '<tr>' +
            '<td class="text-center fw-bold">' + (index + 1) + '</td>' +
            '<td>' +
                '<div class="fw-bold">' + escapeHtml(item.description) + '</div>' +
                '<small class="cell-muted">Inv: ' + escapeHtml(invText) + ' &nbsp;|&nbsp; Dept: ' + escapeHtml(deptText) + '</small>' +
            '</td>' +
            '<td class="cell-num">' + formatMoney(item.total) + '</td>' +
            '<td class="text-center" style="white-space:nowrap;">' + actionHtml + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = rowsHtml;

    approvalModalInstance.show();
}

async function handleModalSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmitReview');
    const alertBox = document.getElementById('modalAlert');
    const reqNo = document.getElementById('modalReqNoInput').value;
    const req = findRequest(reqNo);

    if (!req || !currentUser) {
        alertBox.innerText = 'Request not found or session expired. Please refresh and try again.';
        alertBox.className = 'text-danger mt-2';
        alertBox.style.display = 'block';
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    const selections = [];
    (req.items || []).forEach((item, index) => {
        const checkedInput = document.querySelector('input[name="item_' + index + '"]:checked');
        if (checkedInput) {
            selections.push(checkedInput.value);
        } else {
            selections.push('Skip');
        }
    });

    try {
        const result = await postToScript({
            action: 'systemPartialApprove',
            reqNo: reqNo,
            approver: currentUser.name,
            selections: selections,
            deferNotify: true
        });

        if (result.status === 'success') {
            approvalModalInstance.hide();
            fetchDashboard();
            // Send the result email in the background so the Admin does not wait for it
            if (result.updated) postToScript({ action: 'notifyDecision', reqNo: reqNo }).catch(err => console.warn('Notification email failed', err));
        } else {
            alertBox.innerText = result.message ? result.message : 'Failed to submit.';
            alertBox.className = 'text-danger mt-2';
            alertBox.style.display = 'block';
        }
    } catch (error) {
        console.error(error);
        alertBox.innerText = 'Network Error.';
        alertBox.className = 'text-danger mt-2';
        alertBox.style.display = 'block';
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Submit Selections';
    }
}

function printRequest(reqNo) {
    const req = findRequest(reqNo);
    if(!req) return alert('Request data not found.');

    const date = formatDisplayDate(req.date);
    let itemsRows = '';

    let sumAmt = 0;
    let sumVat = 0;
    let sumWht = 0;
    let sumTotal = 0;

    const validItems = (req.items || []).filter(item => item.status !== 'Rejected');

    if (validItems.length === 0) {
        alert('All items in this request were rejected. Nothing to print.');
        return;
    }

    validItems.forEach((item, index) => {
        sumAmt += toNumber(item.amount);
        sumVat += toNumber(item.vat);
        sumWht += toNumber(item.wht);
        sumTotal += toNumber(item.total);

        const formattedPayDate = formatDisplayDate(item.paymentDate);
        const detailRow = (label, value, extraStyle) =>
            '<tr><td style="color:#adb5bd; padding-right:5px;' + (extraStyle || '') + '">' + label + '</td><td style="color:#495057;">' + escapeHtml(value) + '</td></tr>';

        let detailsHtml = '';
        if (formattedPayDate) detailsHtml += detailRow('PAY DATE:', formattedPayDate, ' width:60px;');
        if (item.companyName) detailsHtml += detailRow('COMPANY:', item.companyName);
        if (item.supplierName) detailsHtml += detailRow('SUPPLIER:', item.supplierName);
        if (item.invoice) detailsHtml += detailRow('INV:', item.invoice);
        if (item.department) detailsHtml += detailRow('DEPT:', item.department);
        if (item.branch) detailsHtml += detailRow('BRANCH:', item.branch);
        if (item.paymentMethod) detailsHtml += detailRow('PAYMENT:', item.paymentMethod);
        if (item.bank) detailsHtml += detailRow('BANK:', item.bank);
        if (item.accName) detailsHtml += detailRow('A/C NAME:', item.accName);
        if (item.accNo) detailsHtml += detailRow('A/C NO:', item.accNo);
        if (item.remarks) detailsHtml += detailRow('REMARKS:', item.remarks);

        const itemStatus = toText(item.status);
        let statusColor = itemStatus === 'Completed' ? '#28a745' : (itemStatus === 'Rejected' ? '#dc3545' : '#f09433');

        itemsRows +=
            '<tr>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; vertical-align: top; color: #495057; text-align: center;">' + (index + 1) + '</td>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; vertical-align: top;">' +
                    '<div style="font-weight: 700; font-size: 13px; color: #212529; margin-bottom: 4px;">' + escapeHtml(item.description) + '</div>' +
                    '<table style="width:100%; border:none; margin:0; font-size:10px; line-height:1.2;">' + detailsHtml + '</table>' +
                '</td>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">' + formatMoney(item.amount) + '</td>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">' + formatMoney(item.vat) + '</td>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">' + formatMoney(item.wht) + '</td>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; font-weight: 700; color: #212529;">' + formatMoney(item.total) + '</td>' +
                '<td style="padding: 10px 6px; border-bottom: 1px solid #f1f3f5; text-align: center; vertical-align: top; font-weight: 700; color: ' + statusColor + '">' + escapeHtml(itemStatus) + '</td>' +
            '</tr>';
    });

    let docTypeStr = req.docType ? req.docType : 'Payment Voucher';
    let approverStr = req.approver ? req.approver : '-';
    let requestorNameStr = req.requestorName ? req.requestorName : '-';
    const reqStatus = toText(req.status);
    let badgeCls = reqStatus === 'Completed' ? 'status-completed' : (reqStatus === 'Rejected' ? 'status-rejected' : (reqStatus === 'Pending' ? 'status-pending' : 'status-partial'));

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Pop-up was blocked. Please allow pop-ups for this site to print.');
        return;
    }
    const html =
        '<!DOCTYPE html>' +
        '<html><head><meta charset="UTF-8"><title>Print Request ' + escapeHtml(reqNo) + '</title>' +
        '<style>' +
            '@media print { ' +
                '@page { margin: 15mm; size: A4 portrait; }' +
                'body { -webkit-print-color-adjust: exact; padding: 0 !important; margin: 0 !important; }' +
                '.summary-wrapper { page-break-inside: avoid; }' +
            '}' +
            'body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #212529; max-width: 210mm; margin: 0 auto; }' +
            '.header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #e9ecef; padding-bottom: 15px; }' +
            '.details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }' +
            '.details-box { background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef; }' +
            '.details-box p { margin: 0 0 5px 0; font-size: 11px; }' +
            '.details-box p:last-child { margin: 0; }' +
            '.status-badge { font-weight: 600; padding: 3px 8px; border-radius: 4px; font-size: 10px; }' +
            '.status-completed { background-color: #d1e7dd; color: #0f5132; }' +
            '.status-rejected { background-color: #f8d7da; color: #842029; }' +
            '.status-pending { background-color: #fff3cd; color: #664d03; }' +
            '.status-partial { background-color: #e2e3e5; color: #41464b; }' +
            '.main-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }' +
            '.main-table th { color: #adb5bd; border-bottom: 2px solid #dee2e6; padding: 8px 6px; text-transform: uppercase; font-size: 9px; font-weight: 600; }' +
            '.main-table td table td { padding: 2px 0; border: none; }' +
            '.summary-wrapper { display: flex; justify-content: flex-end; margin-top: 10px; }' +
            '.summary-box { width: 230px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }' +
            '.summary-row { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e9ecef; font-size: 10px; color: #495057; }' +
            '.summary-total { display: flex; justify-content: space-between; padding: 10px 12px; font-weight: 700; font-size: 13px; background-color: #f8f9fa; color: #212529; }' +
            '.total-amount-color { color: #dc3545; }' +
        '</style></head><body>' +
            '<div class="header">' +
                '<div>' +
                    '<h1 style="margin: 0 0 5px 0; font-size: 20px; color: #212529;">APPROVAL REQUEST</h1>' +
                    '<h2 style="margin: 0; color: #6c757d; font-size: 14px; font-weight: 500;">' + escapeHtml(reqNo) + ' <span style="font-size: 12px; color: #adb5bd;">(' + escapeHtml(docTypeStr) + ')</span></h2>' +
                '</div>' +
            '</div>' +

            '<div class="details-grid">' +
                '<div class="details-box">' +
                    '<p><span style="color:#6c757d; display:inline-block; width:95px;">Requestor Name:</span> <strong>' + escapeHtml(requestorNameStr) + '</strong></p>' +
                    '<p><span style="color:#6c757d; display:inline-block; width:95px;">Senders:</span> <strong>' + escapeHtml(req.requestor) + '</strong></p>' +
                    '<p><span style="color:#6c757d; display:inline-block; width:95px;">Date:</span> <strong>' + escapeHtml(date) + '</strong></p>' +
                '</div>' +
                '<div class="details-box">' +
                    '<p><span style="color:#6c757d; display:inline-block; width:95px;">Overall Status:</span> <span class="status-badge ' + badgeCls + '">' + escapeHtml(reqStatus) + '</span></p>' +
                    '<p><span style="color:#6c757d; display:inline-block; width:95px;">Approved By:</span> <strong>' + escapeHtml(approverStr) + '</strong></p>' +
                '</div>' +
            '</div>' +

            '<table class="main-table">' +
                '<tr>' +
                    '<th style="text-align: center; width: 5%;">#</th>' +
                    '<th style="text-align: left; width: 40%;">Description & Details</th>' +
                    '<th style="text-align: right; width: 11%;">Amount</th>' +
                    '<th style="text-align: right; width: 11%;">VAT(7%)</th>' +
                    '<th style="text-align: right; width: 11%;">WHT</th>' +
                    '<th style="text-align: right; width: 12%;">Total</th>' +
                    '<th style="text-align: center; width: 10%;">Item Status</th>' +
                '</tr>' +
                itemsRows +
            '</table>' +

            '<div class="summary-wrapper">' +
                '<div class="summary-box">' +
                    '<div class="summary-row">' +
                        '<span>Amount (Excl. VAT)</span>' +
                        '<span style="font-weight: 600;">' + formatMoney(sumAmt) + '</span>' +
                    '</div>' +
                    '<div class="summary-row">' +
                        '<span>VAT (7%)</span>' +
                        '<span style="font-weight: 600;">' + formatMoney(sumVat) + '</span>' +
                    '</div>' +
                    '<div class="summary-row">' +
                        '<span>Withholding Tax</span>' +
                        '<span style="font-weight: 600;">' + formatMoney(sumWht) + '</span>' +
                    '</div>' +
                    '<div class="summary-total">' +
                        '<span>GRAND TOTAL</span>' +
                        '<span class="total-amount-color">' + formatMoney(sumTotal) + ' THB</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            // "<\/script>" (single backslash) so the inline script is closed correctly; the old "<\\/script>" left it unclosed and printing never started
            '<script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 500); }<\/script>' +
        '</body></html>';

    printWindow.document.write(html);
    printWindow.document.close();
}
