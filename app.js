const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwThYgHO5FSqCsm9pJW_yDv3Y1cLvWg3oMW3vGB1D48roMPwSZWgedP9O6mORz3Lse/exec';

let globalDropdownData = null;
let itemCount = 0;
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('autoDate').innerText = 'Date: ' + new Date().toLocaleDateString('en-GB');
    
    document.getElementById('showRegister').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('registerContainer').style.display = 'block';
    });
    
    document.getElementById('showLogin').addEventListener('click', (e) => {
        document.getElementById('registerContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'block';
    });
    
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('btnLogout').addEventListener('click', handleLogout);
    
    document.getElementById('btnAddItem').addEventListener('click', addNewItem);
    document.getElementById('approvalForm').addEventListener('submit', handleFormSubmit);
    
    checkLocalSession();
    fetchDropdownData();
});

function checkLocalSession() {
    const savedUser = localStorage.getItem('approvalAppUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showAppScreen();
    }
}

function showAppScreen() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('registerContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    document.getElementById('userDisplayInfo').innerText = `Welcome, ${currentUser.name} (${currentUser.branch})`;
    document.getElementById('requestorEmail').value = currentUser.name;
}

function handleLogout() {
    localStorage.removeItem('approvalAppUser');
    currentUser = null;
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'block';
    document.getElementById('loginForm').reset();
}

async function fetchDropdownData() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDropdowns');
        const data = await response.json();
        globalDropdownData = data;
        
        const approverSelect = document.getElementById('approverEmail');
        approverSelect.innerHTML = '<option value="">Select Approver...</option>';
        data.emails.forEach(email => {
            approverSelect.innerHTML += `<option value="${email}">${email}</option>`;
        });
        
        const regBranchSelect = document.getElementById('regBranch');
        regBranchSelect.innerHTML = '<option value="">Select Branch...</option>';
        data.branches.forEach(branch => {
            regBranchSelect.innerHTML += `<option value="${branch}">${branch}</option>`;
        });

        if (itemCount === 0) addNewItem();
    } catch (error) {
        console.error('Error fetching dropdowns:', error);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const alertBox = document.getElementById('loginAlert');
    const id = document.getElementById('loginId').value;
    const password = document.getElementById('loginPass').value;
    
    btn.disabled = true;
    btn.innerText = 'Logging in...';
    alertBox.style.display = 'none';
    
    const payload = {
        action: 'login',
        data: { id: id, password: password }
    };
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            currentUser = result.user;
            localStorage.setItem('approvalAppUser', JSON.stringify(currentUser));
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
    btn.innerText = 'Submitting...';
    alertBox.style.display = 'none';
    
    const payload = {
        action: 'register',
        data: {
            id: document.getElementById('regId').value,
            password: document.getElementById('regPass').value,
            name: document.getElementById('regName').value,
            branch: document.getElementById('regBranch').value
        }
    };
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            alertBox.className = 'alert alert-success';
            alertBox.innerText = 'Registration successful! Please wait for Admin approval.';
            alertBox.style.display = 'block';
            document.getElementById('registerForm').reset();
        } else {
            alertBox.className = 'alert alert-danger';
            alertBox.innerText = result.message;
            alertBox.style.display = 'block';
        }
    } catch (error) {
        alertBox.className = 'alert alert-danger';
        alertBox.innerText = 'System error. Please try again.';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Registration';
    }
}

function addNewItem() {
    itemCount++;
    const template = document.getElementById('itemTemplate');
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
        
        if (currentUser) {
            block.querySelector('.item-branch').value = currentUser.branch;
        }
    }

    setupItemCalculations(block);
    setupPaymentLogic(block);

    document.getElementById('itemsContainer').appendChild(block);
}

function populateSelect(element, dataArray, defaultText) {
    element.innerHTML = `<option value="">${defaultText}</option>`;
    dataArray.forEach(val => {
        element.innerHTML += `<option value="${val}">${val}</option>`;
    });
}

function updateItemNumbers() {
    const blocks = document.querySelectorAll('.item-block');
    itemCount = blocks.length;
    blocks.forEach((block, index) => {
        block.querySelector('.item-number').innerText = index + 1;
    });
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
        
        bankCol.style.display = 'none';
        nameCol.style.display = 'none';
        noCol.style.display = 'none';
        bankInput.required = false;
        nameInput.required = false;
        noInput.required = false;

        if (val.includes('cash')) {
            container.style.display = 'none';
        } else if (val.includes('cheque')) {
            container.style.display = 'flex';
            nameCol.style.display = 'block';
            nameCol.classList.remove('col-md-4');
            nameCol.classList.add('col-md-12');
            nameInput.required = true;
        } else if (val.includes('transfer')) {
            container.style.display = 'flex';
            bankCol.style.display = 'block';
            nameCol.style.display = 'block';
            noCol.style.display = 'block';
            nameCol.classList.remove('col-md-12');
            nameCol.classList.add('col-md-4');
            bankInput.required = true;
            nameInput.required = true;
            noInput.required = true;
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
    btnSubmit.innerText = 'Submitting...';
    statusMsg.innerText = '';
    statusMsg.className = 'me-auto align-self-center fw-bold';

    const reqData = {
        requestorEmail: document.getElementById('requestorEmail').value,
        approverEmail: document.getElementById('approverEmail').value,
        items: []
    };

    const blocks = document.querySelectorAll('.item-block');
    blocks.forEach(block => {
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
    
    const payload = {
        action: 'submitRequest',
        data: reqData
    };

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            statusMsg.innerText = `Success! Request ${result.reqNo} submitted. Status: Pending with ${reqData.approverEmail}`;
            statusMsg.classList.add('text-success');
            document.getElementById('approvalForm').reset();
            document.getElementById('itemsContainer').innerHTML = '';
            document.getElementById('requestorEmail').value = currentUser.name;
            addNewItem();
        }
    } catch (error) {
        statusMsg.innerText = 'Error submitting request. Please try again.';
        statusMsg.classList.add('text-danger');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Submit Request';
    }
}