const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwThYgHO5FSqCsm9pJW_yDv3Y1cLvWg3oMW3vGB1D48roMPwSZWgedP9O6mORz3Lse/exec';

let globalDropdownData = null;
let itemCount = 0;
let currentUser = null;

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
    
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnAddItem')?.addEventListener('click', addNewItem);
    document.getElementById('approvalForm')?.addEventListener('submit', handleFormSubmit);
    
    document.querySelectorAll('.sidemenu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidemenu-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(sec => sec.style.display = 'none');
            const targetId = e.currentTarget.getAttribute('data-target');
            if(document.getElementById(targetId)) {
                document.getElementById(targetId).style.display = 'block';
            }
        });
    });

    document.getElementById('btnLoadDashboard')?.addEventListener('click', fetchDashboard);
    document.getElementById('btnRefreshDashboard')?.addEventListener('click', fetchDashboard);
    
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
    const form = document.getElementById('loginForm');
    if(form) form.reset();
}

async function fetchDropdownData() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDropdowns');
        const data = await response.json();
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
        const result = await response.json();
        
        if (result.status === 'success') {
            currentUser = result.user;
            if(rememberMe) {
                localStorage.setItem('approvalAppUser', JSON.stringify(currentUser));
            } else {
                sessionStorage.setItem('approvalAppUser', JSON.stringify(currentUser));
            }
            showAppScreen();
        } else {
            alertBox.innerText = result.message;
            alertBox.style.display = 'block';
        }
    } catch (error) {
        alertBox.innerText = 'System error. Please try again.';
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
        const result = await response.json();
        
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

async function handleFormSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmit');
    const statusMsg = document.getElementById('statusMessage');
    
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    statusMsg.innerText = '';
    
    const reqData = {
        requestorEmail: document.getElementById('requestorEmail').value,
        approverEmail: document.getElementById('approverEmail').value,
        items: []
    };

    document.querySelectorAll('.item-block').forEach(block => {
        reqData.items.push({
            description: block.querySelector('.item-desc').value,
            amount: block.querySelector('.item-amt').value,
            vat: block.querySelector('.item-vat').value,
            wht: block.querySelector('.item-wht').value,
            total: block.querySelector('.item-total').value,
            invoice: block.querySelector('.item-inv').value,
            branch: block.querySelector('.item-branch').value,
            department: block.querySelector('.item-dept').value,
            remarks: block.querySelector('.item-remark').value,
            paymentMethod: block.querySelector('.item-paymethod').value,
            bank: block.querySelector('.item-bank').value || "",
            accName: block.querySelector('.item-accname').value || "",
            accNo: block.querySelector('.item-accno').value || ""
        });
    });

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'submitRequest', data: reqData }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            statusMsg.innerText = `Success! Submitted ${result.reqNo}`;
            statusMsg.className = 'fw-bold text-success';
            document.getElementById('approvalForm').reset();
            document.getElementById('itemsContainer').innerHTML = '';
            document.getElementById('requestorEmail').value = currentUser.name;
            addNewItem();
        }
    } catch (error) {
        statusMsg.innerText = 'Error submitting request.';
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
        const result = await response.json();
        
        if (result.status === 'success') {
            tbody.innerHTML = '';
            if (result.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-secondary">No requests found.</td></tr>';
                return;
            }
            
            result.data.forEach(req => {
                const date = new Date(req.date).toLocaleDateString('en-GB');
                let bClass = 'bg-warning text-dark';
                if (req.status === 'Completed') bClass = 'bg-success text-white';
                if (req.status === 'Rejected') bClass = 'bg-danger text-white';
                
                let resendBtn = '';
                if (req.status.includes('Pending') && (currentUser.role === 'Admin' || req.requestor === currentUser.name)) {
                    resendBtn = `<button class="btn btn-sm btn-outline-info rounded-pill ms-1" onclick="resendRequest('${req.reqNo}', this)"><i class="fa-solid fa-paper-plane"></i></button>`;
                }
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="fw-bold ig-text">${req.reqNo}</td>
                    <td class="text-light">${date}</td>
                    <td class="text-light">${req.requestor}</td>
                    <td><span class="badge ${bClass} rounded-pill px-3">${req.status}</span></td>
                    <td class="text-end fw-bold text-light">${parseFloat(req.grandTotal).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-light rounded-pill" onclick="printRequest('${req.reqNo}', '${req.requestor}', '${date}', '${req.status}', ${req.grandTotal})"><i class="fa-solid fa-print"></i></button>
                        ${resendBtn}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger">Failed to load data.</td></tr>';
    }
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
        const result = await response.json();
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

function printRequest(reqNo, requestor, date, status, total) {
    const printWindow = window.open('', '_blank');
    const html = `
        <html><head><title>Print Request ${reqNo}</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .details { margin-bottom: 30px; line-height: 1.6; }
            .total { font-size: 1.2em; font-weight: bold; margin-top: 20px; text-align: right; }
            .status { font-weight: bold; padding: 5px 10px; border: 1px solid #ccc; display: inline-block; }
        </style></head><body>
            <div class="header"><h2>APPROVAL REQUEST</h2><h3>${reqNo}</h3></div>
            <div class="details"><p><strong>Date:</strong> ${date}</p><p><strong>Requestor:</strong> ${requestor}</p><p><strong>Status:</strong> <span class="status">${status}</span></p></div>
            <div class="total">Grand Total: ${parseFloat(total).toLocaleString('en-US', {minimumFractionDigits: 2})} THB</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
        </body></html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
}