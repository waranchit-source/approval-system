const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwThYgHO5FSqCsm9pJW_yDv3Y1cLvWg3oMW3vGB1D48roMPwSZWgedP9O6mORz3Lse/exec';

let globalDropdownData = null;
let itemCount = 0;
let currentUser = null;
let approvalModalInstance = null;
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

    const savedId = localStorage.getItem('savedApprovalId');
    const savedPass = localStorage.getItem('savedApprovalPass');
    if(savedId && savedPass) {
        const loginIdEl = document.getElementById('loginId');
        const loginPassEl = document.getElementById('loginPass');
        if (loginIdEl) loginIdEl.value = savedId;
        if (loginPassEl) loginPassEl.value = savedPass;
        const rememberMeEl = document.getElementById('rememberMe');
        if (rememberMeEl) rememberMeEl.checked = true;
    }
    
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnAddItem')?.addEventListener('click', addNewItem);
    document.getElementById('approvalForm')?.addEventListener('submit', handleFormSubmit);
    document.getElementById('modalApprovalForm')?.addEventListener('submit', handleModalSubmit);
    
    document.querySelectorAll('.sidemenu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidemenu-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
            const targetId = e.currentTarget.getAttribute('data-target');
            if(document.getElementById(targetId)) {
                document.getElementById(targetId).style.display = 'block';
                if(targetId === 'dashboardSection') {
                    document.querySelector('.page-title').innerText = 'Dashboard';
                    fetchDashboard();
                } else {
                    document.querySelector('.page-title').innerText = 'Create Request';
                }
            }
            if(window.innerWidth <= 768) {
                document.getElementById('sidebarMenu').classList.remove('show');
            }
        });
    });

    document.getElementById('btnRefreshDashboard')?.addEventListener('click', fetchDashboard);
    
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
        document.getElementById('sidebarMenu').classList.toggle('collapsed');
    });
    document.getElementById('btnMobileToggle')?.addEventListener('click', () => {
        document.getElementById('sidebarMenu').classList.add('show');
        document.getElementById('sidebarMenu').classList.remove('collapsed');
    });

    document.getElementById('searchDashboard')?.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        const filtered = window.dashboardData.filter(req => {
            const dateStr = new Date(req.date).toLocaleDateString('en-GB');
            return req.reqNo.toLowerCase().includes(keyword) || 
                   dateStr.includes(keyword) ||
                   req.requestor.toLowerCase().includes(keyword);
        });
        renderDashboard(filtered);
    });

    if(document.getElementById('approvalModal')) {
        approvalModalInstance = new bootstrap.Modal(document.getElementById('approvalModal'));
    }

    checkLocalSession();
    fetchDropdownData();
});

function checkLocalSession() {
    const savedUserLocal = localStorage.getItem('approvalAppUser');
    const savedUserSession = sessionStorage.getItem('approvalAppUser');
    if (savedUserLocal) {
        currentUser = JSON.parse(savedUserLocal);
        showAppScreen();
    } else if (savedUserSession) {
        currentUser = JSON.parse(savedUserSession);
        showAppScreen();
    }
}

function showAppScreen() {
    if(!currentUser) return;
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('registerContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    
    const sidebarName = document.getElementById('sidebarUserName');
    if(sidebarName) sidebarName.innerText = currentUser.name || '';
    
    const roleBadge = document.getElementById('userRoleBadge');
    if(roleBadge) roleBadge.innerText = currentUser.role || 'User';
    
    const reqEmail = document.getElementById('requestorEmail');
    if(reqEmail) reqEmail.value = currentUser.name || '';
}

function handleLogout() {
    localStorage.removeItem('approvalAppUser');
    sessionStorage.removeItem('approvalAppUser');
    currentUser = null;
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'block';
}

async function fetchDropdownData() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDropdowns');
        const text = await response.text();
        const data = JSON.parse(text);
        globalDropdownData = data;
        
        const approverSelect = document.getElementById('approverEmail');
        if(approverSelect) {
            approverSelect.innerHTML = '<option value="">Select Approver...</option>';
            data.emails.forEach(email => approverSelect.innerHTML += `<option value="${email}">${email}</option>`);
        }
        
        const regBranchSelect = document.getElementById('regBranch');
        if(regBranchSelect) {
            regBranchSelect.innerHTML = '<option value="">Select Branch...</option>';
            data.branches.forEach(branch => regBranchSelect.innerHTML += `<option value="${branch}">${branch}</option>`);
        }

        if (itemCount === 0) addNewItem();
    } catch (error) {
        console.error(error);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const alertBox = document.getElementById('loginAlert');
    const id = document.getElementById('loginId').value;
    const password = document.getElementById('loginPass').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    alertBox.style.display = 'none';
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'login', data: { id: id, password: password } }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (result.status === 'success') {
            currentUser = result.user;
            if(rememberMe) {
                localStorage.setItem('savedApprovalId', id);
                localStorage.setItem('savedApprovalPass', password);
                localStorage.setItem('approvalAppUser', JSON.stringify(currentUser));
            } else {
                localStorage.removeItem('savedApprovalId');
                localStorage.removeItem('savedApprovalPass');
                sessionStorage.setItem('approvalAppUser', JSON.stringify(currentUser));
            }
            showAppScreen();
        } else {
            alertBox.innerText = result.message;
            alertBox.style.display = 'block';
        }
    } catch (error) {
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
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'register',
                data: {
                    id: document.getElementById('regId').value,
                    password: document.getElementById('regPass').value,
                    name: document.getElementById('regName').value,
                    branch: document.getElementById('regBranch').value
                }
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (result.status === 'success') {
            alertBox.className = 'alert alert-success';
            alertBox.innerText = 'Registration success! Wait for Admin approval.';
            alertBox.style.display = 'block';
            document.getElementById('registerForm').reset();
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.innerText = result.message;
            alertBox.style.display = 'block';
        }
    } catch (error) {
        alertBox.className = 'alert alert-danger';
        alertBox.innerText = 'System error.';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Sign Up';
    }
}

function addNewItem() {
    const template = document.getElementById('itemTemplate');
    if(!template) return;
    
    itemCount++;
    const clone = template.content.cloneNode(true);
    const block = clone.querySelector('.item-block');
    block.querySelector('.item-number').innerText = itemCount;
    
    if (itemCount > 1) {
        const removeBtn = block.querySelector('.btn-remove-item');
        removeBtn.style.display = 'block';
        removeBtn.addEventListener('click', function() {
            block.remove();
            updateItemNumbers();
        });
    }

    if (globalDropdownData) {
        populateSelect(block.querySelector('.item-branch'), globalDropdownData.branches, 'Select Branch');
        populateSelect(block.querySelector('.item-dept'), globalDropdownData.departments, 'Select Dept');
        populateSelect(block.querySelector('.item-paymethod'), globalDropdownData.paymentMethods, 'Select Method');
        populateSelect(block.querySelector('.item-bank'), globalDropdownData.banks, 'Select Bank');
        if (currentUser) block.querySelector('.item-branch').value = currentUser.branch;
    }

    setupItemCalculations(block);
    setupPaymentLogic(block);
    document.getElementById('itemsContainer').appendChild(block);
}

function populateSelect(element, dataArray, defaultText) {
    if(!element) return;
    element.innerHTML = `<option value="">${defaultText}</option>`;
    dataArray.forEach(val => element.innerHTML += `<option value="${val}">${val}</option>`);
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
        let amt = parseFloat(amtInput.value) || 0;
        let vat = parseFloat(vatInput.value) || 0;
        let wht = parseFloat(whtInput.value) || 0;
        totalInput.value = (amt + vat - wht).toFixed(2);
    }
    amtInput.addEventListener('input', () => {
        let amt = parseFloat(amtInput.value) || 0;
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

        if (val.includes('cash')) {
            container.style.display = 'none';
        } else if (val.includes('cheque')) {
            container.style.display = 'flex';
            nameCol.style.display = 'block';
            nameCol.classList.replace('col-md-4', 'col-md-12');
            nameInput.required = true;
        } else if (val.includes('transfer')) {
            container.style.display = 'flex';
            [bankCol, nameCol, noCol].forEach(el => el.style.display = 'block');
            nameCol.classList.replace('col-md-12', 'col-md-4');
            [bankInput, nameInput, noInput].forEach(el => el.required = true);
        } else {
            container.style.display = 'none';
        }
    });
}

const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

async function handleFormSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmit');
    const statusMsg = document.getElementById('statusMessage');
    
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Submitting (Please wait)...';
    statusMsg.innerText = '';
    
    try {
        const reqData = {
            requestorEmail: document.getElementById('requestorEmail').value,
            approverEmail: document.getElementById('approverEmail').value,
            items: []
        };

        const blocks = document.querySelectorAll('.item-block');
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const desc = block.querySelector('.item-desc')?.value;
            if(!desc) throw new Error("Please fill Description in Item #" + (i + 1));

            let photoData = null;
            const fileInput = block.querySelector('.item-photo');
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 2 * 1024 * 1024) throw new Error(`File in Item #${i+1} is too large (Max 2MB)`);
                photoData = {
                    filename: file.name,
                    mimeType: file.type,
                    bytes: await getBase64(file)
                };
            }

            reqData.items.push({
                description: desc,
                amount: block.querySelector('.item-amt')?.value || 0,
                vat: block.querySelector('.item-vat')?.value || 0,
                wht: block.querySelector('.item-wht')?.value || 0,
                total: block.querySelector('.item-total')?.value || 0,
                productPhoto: photoData,
                imageURL: block.querySelector('.item-imageurl')?.value || "",
                invoice: block.querySelector('.item-inv')?.value || "",
                branch: block.querySelector('.item-branch')?.value || "",
                department: block.querySelector('.item-dept')?.value || "",
                remarks: block.querySelector('.item-remark')?.value || "",
                paymentMethod: block.querySelector('.item-paymethod')?.value || "",
                bank: block.querySelector('.item-bank')?.value || "",
                accName: block.querySelector('.item-accname')?.value || "",
                accNo: block.querySelector('.item-accno')?.value || ""
            });
        }

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'submitRequest', data: reqData }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (result.status === 'success') {
            statusMsg.innerText = `Success! Submitted ${result.reqNo}`;
            statusMsg.className = 'fw-bold text-success';
            document.getElementById('approvalForm').reset();
            document.getElementById('itemsContainer').innerHTML = '';
            document.getElementById('requestorEmail').value = currentUser.name;
            addNewItem();
        } else {
            throw new Error(result.message || 'Server error.');
        }
    } catch (error) {
        console.error(error);
        statusMsg.innerText = 'Error: ' + error.message;
        statusMsg.className = 'fw-bold text-danger';
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Submit Request <i class="fa-solid fa-arrow-right ms-2"></i>';
    }
}

async function fetchDashboard() {
    const tbody = document.getElementById('dashboardTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-secondary"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading data...</td></tr>';
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'getRequests', user: currentUser }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (result.status === 'success') {
            window.dashboardData = result.data;
            renderDashboard(window.dashboardData);
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger">Failed to load data.</td></tr>';
    }
}

function renderDashboard(dataToRender) {
    const tbody = document.getElementById('dashboardTableBody');
    tbody.innerHTML = '';
    if (dataToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-secondary">No requests found.</td></tr>';
        return;
    }
    
    dataToRender.forEach(req => {
        const date = new Date(req.date).toLocaleDateString('en-GB');
        let bClass = 'bg-warning text-dark';
        if (req.status === 'Completed') bClass = 'bg-success text-white';
        if (req.status === 'Rejected') bClass = 'bg-danger text-white';
        
        let resendBtn = '';
        if (currentUser.role === 'Admin' || req.requestor === currentUser.name) {
            resendBtn = `<button class="btn btn-sm btn-outline-info rounded-pill ms-1" onclick="resendRequest('${req.reqNo}', this)" title="Resend Email"><i class="fa-solid fa-paper-plane"></i></button>`;
        }
        
        let reviewBtn = '';
        if (currentUser.role === 'Admin' || (req.status.indexOf('Pending') > -1)) {
            reviewBtn = `<button class="btn btn-sm btn-outline-warning rounded-pill ms-1" onclick="openReviewModal('${req.reqNo}')" title="Review Items"><i class="fa-solid fa-list-check"></i> Review</button>`;
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="fw-bold ig-text">${req.reqNo}</td>
            <td class="text-light">${date}</td>
            <td class="text-light">${req.requestor}</td>
            <td><span class="badge ${bClass} rounded-pill px-3">${req.status}</span></td>
            <td class="text-end fw-bold text-light">${parseFloat(req.grandTotal).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td class="text-center" style="white-space: nowrap;">
                <button class="btn btn-sm btn-outline-light rounded-pill" onclick="printRequest('${req.reqNo}')" title="Print PDF"><i class="fa-solid fa-print"></i></button>
                ${resendBtn}
                ${reviewBtn}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function resendRequest(reqNo, btnEl) {
    const originalText = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'resendRequest', reqNo: reqNo }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const text = await response.text();
        const result = JSON.parse(text);
        if (result.status === 'success') {
            alert('Email resent successfully for ' + reqNo);
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        alert('Failed to resend email.');
    } finally {
        btnEl.disabled = false;
        btnEl.innerHTML = originalText;
    }
}

function openReviewModal(reqNo) {
    const req = window.dashboardData.find(r => r.reqNo === reqNo);
    if(!req) return;
    
    document.getElementById('modalReqNo').innerText = reqNo;
    document.getElementById('modalReqNoInput').value = reqNo;
    document.getElementById('modalAlert').style.display = 'none';
    
    const tbody = document.getElementById('modalItemsBody');
    tbody.innerHTML = '';
    
    req.items.forEach((item, index) => {
        let actionHtml = '';
        if (item.status.indexOf('Pending') > -1) {
            actionHtml = `
                <label class="me-2 text-success"><input type="radio" name="item_${index}" value="Approve" class="form-check-input" required> Approve</label>
                <label class="text-danger"><input type="radio" name="item_${index}" value="Reject" class="form-check-input" required> Reject</label>
            `;
        } else {
            let bClass = item.status === 'Completed' ? 'bg-success' : 'bg-danger';
            actionHtml = `<span class="badge ${bClass}">${item.status}</span>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="text-center fw-bold">${index + 1}</td>
                <td>
                    <div class="fw-bold">${item.description}</div>
                    <small class="text-muted">Inv: ${item.invoice || '-'} | Dept: ${item.department}</small>
                </td>
                <td class="text-end fw-bold">${parseFloat(item.total).toLocaleString('en-US')}</td>
                <td class="text-center" style="white-space:nowrap;">
                    ${actionHtml}
                </td>
            </tr>
        `;
    });
    
    approvalModalInstance.show();
}

async function handleModalSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmitReview');
    const alertBox = document.getElementById('modalAlert');
    const reqNo = document.getElementById('modalReqNoInput').value;
    const req = window.dashboardData.find(r => r.reqNo === reqNo);
    
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
    const selections = [];
    req.items.forEach((item, index) => {
        const checkedInput = document.querySelector(`input[name="item_${index}"]:checked`);
        if (checkedInput) {
            selections.push(checkedInput.value);
        } else {
            selections.push('Skip');
        }
    });
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'systemPartialApprove', 
                reqNo: reqNo,
                approver: currentUser.name,
                selections: selections
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const text = await response.text();
        const result = JSON.parse(text);
        
        if (result.status === 'success') {
            approvalModalInstance.hide();
            fetchDashboard();
        } else {
            alertBox.innerText = result.message;
            alertBox.className = 'text-danger mt-2';
            alertBox.style.display = 'block';
        }
    } catch (error) {
        alertBox.innerText = 'Network Error.';
        alertBox.className = 'text-danger mt-2';
        alertBox.style.display = 'block';
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Submit Selections';
    }
}

function printRequest(reqNo) {
    const req = window.dashboardData.find(r => r.reqNo === reqNo);
    if(!req) return alert('Request data not found.');
    
    const date = new Date(req.date).toLocaleDateString('en-GB');
    let itemsRows = '';
    
    let sumAmt = 0;
    let sumVat = 0;
    let sumWht = 0;
    let sumTotal = 0;
    
    const validItems = req.items.filter(item => item.status !== 'Rejected');
    
    if (validItems.length === 0) {
        alert('All items in this request were rejected. Nothing to print.');
        return;
    }
    
    validItems.forEach((item, index) => {
        sumAmt += parseFloat(item.amount) || 0;
        sumVat += parseFloat(item.vat) || 0;
        sumWht += parseFloat(item.wht) || 0;
        sumTotal += parseFloat(item.total) || 0;
        
        let detailsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 8px; color: #6c757d; font-size: 11px; margin-top: 4px;">`;
        if (item.invoice) detailsHtml += `<span><span style="color:#adb5bd;">INV:</span> <span style="color:#495057;">${item.invoice}</span></span>`;
        if (item.department) detailsHtml += `<span><span style="color:#adb5bd;">DEPT:</span> <span style="color:#495057;">${item.department}</span></span>`;
        if (item.branch) detailsHtml += `<span><span style="color:#adb5bd;">BRANCH:</span> <span style="color:#495057;">${item.branch}</span></span>`;
        if (item.paymentMethod) detailsHtml += `<span><span style="color:#adb5bd;">PAYMENT:</span> <span style="color:#495057;">${item.paymentMethod}</span></span>`;
        if (item.bank) detailsHtml += `<span><span style="color:#adb5bd;">BANK:</span> <span style="color:#495057;">${item.bank}</span></span>`;
        if (item.accNo) detailsHtml += `<span><span style="color:#adb5bd;">A/C NO:</span> <span style="color:#495057;">${item.accNo}</span></span>`;
        if (item.accName) detailsHtml += `<span><span style="color:#adb5bd;">A/C NAME:</span> <span style="color:#495057;">${item.accName}</span></span>`;
        if (item.remarks) detailsHtml += `<span style="width: 100%;"><span style="color:#adb5bd;">REMARKS:</span> <span style="color:#495057;">${item.remarks}</span></span>`;
        detailsHtml += `</div>`;

        itemsRows += `
            <tr>
                <td style="padding: 15px 10px; border-bottom: 1px solid #f1f3f5; vertical-align: top; color: #495057;">${index + 1}</td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #f1f3f5; vertical-align: top;">
                    <div style="font-weight: 600; font-size: 13px; color: #212529;">${item.description}</div>
                    ${detailsHtml}
                </td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">${parseFloat(item.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">${parseFloat(item.vat).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; color: #495057;">${parseFloat(item.wht).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #f1f3f5; text-align: right; vertical-align: top; font-weight: 600; color: #212529;">${parseFloat(item.total).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
        `;
    });

    const printWindow = window.open('', '_blank');
    const html = `
        <html><head><title>Print Request ${reqNo}</title>
        <style>
            @media print { body { -webkit-print-color-adjust: exact; } }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #212529; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; border-bottom: 2px solid #e9ecef; padding-bottom: 20px; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .details-box { background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; }
            .details-box p { margin: 0 0 8px 0; font-size: 13px; }
            .details-box p:last-child { margin: 0; }
            .status-badge { font-weight: 600; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
            .status-completed { background-color: #d1e7dd; color: #0f5132; }
            .status-rejected { background-color: #f8d7da; color: #842029; }
            .status-pending { background-color: #fff3cd; color: #664d03; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
            th { color: #adb5bd; border-bottom: 1px solid #dee2e6; padding: 8px; text-transform: uppercase; font-size: 10px; font-weight: 600; }
            .summary-wrapper { display: flex; justify-content: flex-end; page-break-inside: avoid; }
            .summary-box { width: 280px; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; }
            .summary-row { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #e9ecef; font-size: 11px; color: #495057; }
            .summary-total { display: flex; justify-content: space-between; padding: 12px; font-weight: 700; font-size: 14px; background-color: #f8f9fa; color: #212529; }
            .total-amount-color { color: #d97706; }
        </style></head><body>
            <div class="header">
                <div>
                    <h1 style="margin: 0 0 5px 0; font-size: 24px; color: #212529;">APPROVAL REQUEST</h1>
                    <h2 style="margin: 0; color: #6c757d; font-size: 16px; font-weight: 500;">${reqNo}</h2>
                </div>
            </div>
            
            <div class="details-grid">
                <div class="details-box">
                    <p><span style="color:#6c757d;">Requestor:</span> <strong>${req.requestor}</strong></p>
                    <p><span style="color:#6c757d;">Date:</span> <strong>${date}</strong></p>
                </div>
                <div class="details-box">
                    <p><span style="color:#6c757d;">Status:</span> <span class="status-badge ${req.status === 'Completed' ? 'status-completed' : (req.status === 'Rejected' ? 'status-rejected' : 'status-pending')}">${req.status}</span></p>
                    <p><span style="color:#6c757d;">Approved By:</span> <strong>${req.approver || '-'}</strong></p>
                </div>
            </div>
            
            <table>
                <tr>
                    <th style="text-align: left; width: 5%;">#</th>
                    <th style="text-align: left; width: 55%;">Description & Details</th>
                    <th style="text-align: right; width: 10%;">Amount</th>
                    <th style="text-align: right; width: 10%;">VAT(7%)</th>
                    <th style="text-align: right; width: 10%;">WHT</th>
                    <th style="text-align: right; width: 10%;">Total</th>
                </tr>
                ${itemsRows}
            </table>
            
            <div class="summary-wrapper">
                <div class="summary-box">
                    <div class="summary-row">
                        <span>Amount (Excl. VAT)</span>
                        <span style="font-weight: 600;">${sumAmt.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="summary-row">
                        <span>VAT (7%)</span>
                        <span style="font-weight: 600;">${sumVat.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="summary-row">
                        <span>Withholding Tax</span>
                        <span style="font-weight: 600;">${sumWht.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="summary-total">
                        <span>Grand Total</span>
                        <span class="total-amount-color">${sumTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </div>
                </div>
            </div>
            
            <script>window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
        </body></html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
}