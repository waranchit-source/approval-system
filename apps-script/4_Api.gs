// Approval System – 4_Api.gs (part of the Apps Script project, see 1_Config.gs)

// ======================================================================
// doPost: API used by the web page
// ======================================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return errorOut_('Empty request.');
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === 'register') return handleRegister_(payload.data || {});
    if (action === 'login') return handleLogin_(payload.data || {});

    var user = getAuthUser_(payload.token);
    if (!user) return errorOut_('Your session has expired. Please login again.', 'AUTH_REQUIRED');

    if (action === 'submitRequest') return handleSubmitRequest_(user, payload.data || {});
    if (action === 'getRequests') return handleGetRequests_(user);
    if (action === 'batchSendRequest') return handleBatchSend_(user, payload.reqNos);
    if (action === 'resendRequest') return handleBatchSend_(user, [payload.reqNo]);
    if (action === 'systemPartialApprove') return handleSystemPartialApprove_(user, payload);

    return errorOut_('Unknown action.');
  } catch (err) {
    console.error(err);
    return errorOut_(err.message);
  }
}

function handleRegister_(data) {
  var id = str_(data.id);
  var password = data.password === undefined || data.password === null ? '' : String(data.password);
  var name = cleanName_(data.name);
  var branch = str_(data.branch);
  if (!id || id.indexOf('@') < 1) return errorOut_('Please enter a valid email.');
  if (password.length < 6) return errorOut_('Password must be at least 6 characters.');
  if (!name) return errorOut_('Please enter your full name.');
  if (!branch) return errorOut_('Please select a branch.');

  return withLock_(function () {
    if (findUserRow_(id)) return errorOut_('ID already exists.');
    var sheet = getSheet_(SHEET_USERS);
    if (!sheet) return errorOut_('Sheet "' + SHEET_USERS + '" not found.');
    sheet.appendRow([cellText_(id), hashPassword_(password), cellText_(name), cellText_(branch), 'Pending', 'User']);
    return jsonOut_({ status: 'success' });
  });
}

function handleLogin_(data) {
  var found = findUserRow_(data.id);
  var password = data.password === undefined || data.password === null ? '' : String(data.password);
  if (!found || !checkPassword_(found.row[1], password)) return errorOut_('Invalid ID or Password.');

  var status = str_(found.row[4]);
  if (status === 'Rejected') return errorOut_('Registration rejected.');
  if (status !== 'Approved') return errorOut_('Account pending approval.');

  // Upgrade plain-text passwords to a hash on first successful login
  if (!isHashedPassword_(found.row[1])) {
    found.sheet.getRange(found.index + 1, 2).setValue(hashPassword_(password));
  }

  var user = userFromRow_(found.row);
  return jsonOut_({ status: 'success', user: user, token: createToken_(user.id) });
}

function handleSubmitRequest_(user, data) {
  var items = Array.isArray(data.items) ? data.items : [];
  var requestorName = cleanName_(data.requestorName);
  var approver = str_(data.approverEmail);
  var docType = str_(data.docType) || 'Payment Voucher';
  var editReqNo = str_(data.editReqNo);

  if (items.length === 0) return errorOut_('Please add at least one item.');
  if (!requestorName) return errorOut_('Please select or type the Requestor Name.');
  if (!approver) return errorOut_('Please select an Approver.');
  for (var v = 0; v < items.length; v++) {
    if (!str_(items[v] && items[v].description)) return errorOut_('Please fill Description in Item #' + (v + 1));
  }

  // Upload attachments before taking the lock (this is the slow part)
  var photoUrls = items.map(function (item, idx) {
    var url = str_(item.existingFileUrl);
    var photo = item.productPhoto;
    if (photo && photo.bytes) {
      if (String(photo.bytes).length > MAX_FILE_BASE64_LENGTH) throw new Error('Item #' + (idx + 1) + ': attached files are larger than 5MB.');
      var blob = Utilities.newBlob(Utilities.base64Decode(photo.bytes), 'application/pdf', str_(photo.filename) || 'Attached_Files.pdf');
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      url = file.getUrl();
    }
    return url;
  });

  return withLock_(function () {
    var sheet = getApprovalSheet_();
    var all = sheet.getDataRange().getValues();
    var reqNo;
    var rowsToDelete = [];
    var sender = user.name;
    var reqDate = new Date();

    if (editReqNo) {
      reqNo = editReqNo;
      var allCompleted = true;
      for (var r = 1; r < all.length; r++) {
        if (str_(all[r][COL.REQ_NO]) === reqNo) {
          if (rowsToDelete.length === 0) {
            sender = cleanName_(all[r][COL.SENDER]) || user.name; // keep the original sender
            if (all[r][COL.DATE] instanceof Date) reqDate = all[r][COL.DATE]; // keep the original request date
          }
          if (str_(all[r][COL.STATUS]) !== 'Completed') allCompleted = false;
          rowsToDelete.push(r + 1);
        }
      }
      if (rowsToDelete.length === 0) return errorOut_('Request ' + reqNo + ' not found. It may have been deleted.');
      if (!canAccess_(user, sender)) return errorOut_('You do not have permission to edit this request.');
      if (allCompleted) return errorOut_('Completed requests cannot be edited.');
    } else {
      var maxNum = 0;
      for (var n = 1; n < all.length; n++) {
        var match = str_(all[n][COL.REQ_NO]).match(/REQ-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      reqNo = padReqNo_(maxNum + 1);
    }

    var rows = items.map(function (item, idx) {
      var amount = round2_(num_(item.amount));
      var vat = round2_(num_(item.vat));
      var wht = round2_(num_(item.wht));
      var row = [];
      row[COL.DATE] = reqDate;
      row[COL.REQ_NO] = reqNo;
      row[COL.DESC] = cellText_(item.description);
      row[COL.AMOUNT] = amount;
      row[COL.VAT] = vat;
      row[COL.WHT] = wht;
      row[COL.TOTAL] = round2_(amount + vat - wht);
      row[COL.PHOTO] = photoUrls[idx];
      row[COL.IMAGE_URL] = cellText_(item.imageURL);
      row[COL.INVOICE] = cellText_(item.invoice);
      row[COL.BRANCH] = cellText_(item.branch);
      row[COL.DEPT] = cellText_(item.department);
      row[COL.REMARKS] = cellText_(item.remarks);
      row[COL.PAY_METHOD] = cellText_(item.paymentMethod);
      row[COL.BANK] = cellText_(item.bank);
      row[COL.ACC_NAME] = cellText_(item.accName);
      row[COL.ACC_NO] = cellText_(item.accNo);
      row[COL.STATUS] = 'Draft';
      row[COL.SENDER] = cellText_(sender);
      row[COL.APPROVER] = cellText_(approver);
      row[COL.APPROVAL_DATE] = '';
      row[COL.DOC_TYPE] = cellText_(docType);
      row[COL.PAY_DATE] = /^\d{4}-\d{2}-\d{2}$/.test(str_(item.paymentDate)) ? str_(item.paymentDate) : '';
      row[COL.COMPANY] = cellText_(item.companyName);
      row[COL.SUPPLIER] = cellText_(item.supplierName);
      row[COL.REQUESTOR_NAME] = cellText_(requestorName);
      return row;
    });

    ensureRequestorNameHeader_(sheet);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, NUM_COLS).setValues(rows);
    // When editing, remove the old rows only after the new ones are written
    // (Sheets refuses to delete every non-frozen row, and nothing is lost if writing fails)
    for (var d = rowsToDelete.length - 1; d >= 0; d--) sheet.deleteRow(rowsToDelete[d]);
    return jsonOut_({ status: 'success', reqNo: reqNo });
  });
}
