// Approval System – 5_Dashboard.gs (part of the Apps Script project, see 1_Config.gs)

// ======================================================================
// doPost actions: dashboard, send approval email, review in system
// ======================================================================

function handleGetRequests_(user) {
  var sheet = getApprovalSheet_();
  var data = sheet.getDataRange().getValues();
  var requests = {};
  var order = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var reqNo = str_(row[COL.REQ_NO]);
    if (!reqNo) continue;
    var sender = cleanName_(row[COL.SENDER]);
    if (!canAccess_(user, sender)) continue;

    if (!requests[reqNo]) {
      requests[reqNo] = {
        reqNo: reqNo, date: row[COL.DATE], requestor: sender, requestorName: cleanName_(row[COL.REQUESTOR_NAME]),
        items: [], grandTotal: 0, approver: str_(row[COL.APPROVER]), docType: str_(row[COL.DOC_TYPE]) || '-'
      };
      order.push(reqNo);
    }
    var req = requests[reqNo];
    if (!req.requestorName) req.requestorName = cleanName_(row[COL.REQUESTOR_NAME]);
    req.grandTotal += num_(row[COL.TOTAL]);
    req.items.push({
      description: str_(row[COL.DESC]), amount: num_(row[COL.AMOUNT]), vat: num_(row[COL.VAT]), wht: num_(row[COL.WHT]),
      total: num_(row[COL.TOTAL]), productPhoto: str_(row[COL.PHOTO]), imageURL: str_(row[COL.IMAGE_URL]),
      invoice: str_(row[COL.INVOICE]), branch: str_(row[COL.BRANCH]), department: str_(row[COL.DEPT]), remarks: str_(row[COL.REMARKS]),
      paymentMethod: str_(row[COL.PAY_METHOD]), bank: str_(row[COL.BANK]), accName: str_(row[COL.ACC_NAME]), accNo: str_(row[COL.ACC_NO]),
      status: str_(row[COL.STATUS]), paymentDate: dateOnly_(row[COL.PAY_DATE]),
      companyName: str_(row[COL.COMPANY]), supplierName: str_(row[COL.SUPPLIER])
    });
  }

  var resultArr = order.map(function (key) {
    var req = requests[key];
    var statuses = req.items.map(function (item) { return item.status; });
    if (statuses.every(function (s) { return s === 'Draft'; })) req.status = 'Draft';
    else if (statuses.every(function (s) { return s === 'Completed'; })) req.status = 'Completed';
    else if (statuses.every(function (s) { return s === 'Rejected'; })) req.status = 'Rejected';
    else if (statuses.some(isPending_)) req.status = 'Pending';
    else req.status = 'Partial';
    req.grandTotal = round2_(req.grandTotal);
    return req;
  }).reverse();

  return jsonOut_({ status: 'success', data: resultArr });
}

function handleBatchSend_(user, reqNosInput) {
  var reqNos = normalizeReqNos_(reqNosInput);
  if (reqNos.length === 0) return errorOut_('Please select at least one request.');
  var scriptUrl = ScriptApp.getService().getUrl();

  return withLock_(function () {
    var sheet = getApprovalSheet_();
    var data = sheet.getDataRange().getValues();
    var groups = {};       // approver -> { requests: { reqNo: request }, order: [], rows: [] }
    var itemCounters = {};
    var denied = false;
    var found = false;

    for (var k = 1; k < data.length; k++) {
      var row = data[k];
      var rNo = str_(row[COL.REQ_NO]);
      if (!rNo || reqNos.indexOf(rNo) === -1) continue;
      found = true;
      if (itemCounters[rNo] === undefined) itemCounters[rNo] = 0;
      var itemIndex = itemCounters[rNo]++;

      if (!canAccess_(user, row[COL.SENDER])) { denied = true; continue; }
      if (isFinal_(row[COL.STATUS])) continue; // approved/rejected items are not sent again

      var approver = str_(row[COL.APPROVER]) || DEFAULT_APPROVER;
      if (!groups[approver]) groups[approver] = { requests: {}, order: [], rows: [] };
      var group = groups[approver];
      if (!group.requests[rNo]) {
        group.requests[rNo] = {
          reqNo: rNo, reqDate: row[COL.DATE], senderName: cleanName_(row[COL.SENDER]),
          requestorName: cleanName_(row[COL.REQUESTOR_NAME]), docType: str_(row[COL.DOC_TYPE]) || 'Payment Voucher', items: []
        };
        group.order.push(rNo);
      }
      group.requests[rNo].items.push({
        index: itemIndex, description: row[COL.DESC], amount: row[COL.AMOUNT], total: row[COL.TOTAL],
        paymentMethod: row[COL.PAY_METHOD], invoice: row[COL.INVOICE], department: row[COL.DEPT], branch: row[COL.BRANCH],
        companyName: row[COL.COMPANY], supplierName: row[COL.SUPPLIER], photoUrl: str_(row[COL.PHOTO])
      });
      group.rows.push(k);
    }

    if (!found) return errorOut_('Requests not found.');
    var approvers = Object.keys(groups);
    if (approvers.length === 0) {
      return errorOut_(denied ? 'You do not have permission to send these requests.' : 'Nothing to send. All items in the selected requests have already been approved or rejected.');
    }

    var failures = [];
    approvers.forEach(function (approver) {
      var group = groups[approver];
      var requestsArray = group.order.map(function (rn) { return group.requests[rn]; });
      try {
        sendBatchApprovalEmail(requestsArray, approver, user, scriptUrl);
        // Only mark as pending after the email was sent successfully
        group.rows.forEach(function (k) {
          sheet.getRange(k + 1, COL.STATUS + 1).setValue('Pending with ' + approver);
        });
      } catch (err) {
        console.error(err);
        failures.push(approver + ': ' + err.message);
      }
    });

    if (failures.length > 0) return errorOut_('Could not send email to ' + failures.join('; '));
    return jsonOut_({ status: 'success' });
  });
}

function handlePrintBatch_(user, reqNosInput) {
  var reqNos = normalizeReqNos_(reqNosInput);
  if (reqNos.length === 0) return errorOut_('Please select at least one request.');

  return withLock_(function () {
    var sheet = getApprovalSheet_();
    var data = sheet.getDataRange().getValues();
    var changes = [];
    var printable = [];
    var denied = false;
    var found = false;

    for (var k = 1; k < data.length; k++) {
      var row = data[k];
      var rNo = str_(row[COL.REQ_NO]);
      if (!rNo || reqNos.indexOf(rNo) === -1) continue;
      found = true;
      if (!canAccess_(user, row[COL.SENDER])) { denied = true; continue; }
      if (isFinal_(row[COL.STATUS])) continue;
      var approver = str_(row[COL.APPROVER]) || DEFAULT_APPROVER;
      changes.push({ rowIndex: k, status: MANUAL_PENDING + ' with ' + approver });
      if (printable.indexOf(rNo) === -1) printable.push(rNo);
    }

    if (!found) return errorOut_('Requests not found.');
    if (changes.length === 0) {
      return errorOut_(denied ? 'You do not have permission to print these requests.' : 'Nothing to print. All items in the selected requests have already been approved or rejected.');
    }

    setStatuses_(sheet, changes);
    return jsonOut_({ status: 'success', reqNos: printable, updated: changes.length });
  });
}

function handleSystemPartialApprove_(user, payload) {
  if (user.role !== 'Admin') return errorOut_('Only Admin can review requests in the system.');
  var reqNo = str_(payload.reqNo);
  var selections = Array.isArray(payload.selections) ? payload.selections : [];
  if (!reqNo) return errorOut_('Request number is missing.');

  var result = withLock_(function () {
    var sheet = getApprovalSheet_();
    var data = sheet.getDataRange().getValues();
    var itemCounter = 0;
    var changes = [];
    var found = false;
    var sender = '';
    for (var k = 1; k < data.length; k++) {
      if (str_(data[k][COL.REQ_NO]) !== reqNo) continue;
      found = true;
      sender = data[k][COL.SENDER];
      var choice = selections[itemCounter];
      itemCounter++;
      if ((choice === 'Approve' || choice === 'Reject') && isPending_(data[k][COL.STATUS])) {
        changes.push({ rowIndex: k, status: choice === 'Approve' ? 'Completed' : 'Rejected' });
      }
    }
    applyDecisions_(sheet, changes, user.name, new Date());
    return { found: found, updated: changes.length > 0, sender: sender };
  });

  if (!result.found) return errorOut_('Request ' + reqNo + ' not found.');
  // The web page sends deferNotify and asks for the email separately (notifyDecision) so the Admin does not wait
  if (result.updated && result.sender && !payload.deferNotify) sendDetailedNotificationEmail(reqNo, result.sender);
  return jsonOut_({ status: 'success', updated: result.updated });
}

function handleManualApprove_(user, payload) {
  var reqNo = str_(payload.reqNo);
  if (!reqNo) return errorOut_('Request number is missing.');

  var result = withLock_(function () {
    var sheet = getApprovalSheet_();
    var data = sheet.getDataRange().getValues();
    var changes = [];
    var found = false;
    var sender = '';
    var approver = '';
    for (var k = 1; k < data.length; k++) {
      if (str_(data[k][COL.REQ_NO]) !== reqNo) continue;
      if (!found) sender = data[k][COL.SENDER];
      found = true;
      if (isManualPending_(data[k][COL.STATUS])) {
        changes.push({ rowIndex: k, status: 'Completed' });
        if (!approver) approver = str_(data[k][COL.APPROVER]);
      }
    }
    if (!found) return { error: 'Request ' + reqNo + ' not found.' };
    if (!canAccess_(user, sender)) return { error: 'You do not have permission to change this request.' };
    if (changes.length === 0) return { error: 'This request is not waiting for manual approval. Please print it for approval first.' };
    applyDecisions_(sheet, changes, approver || DEFAULT_APPROVER, new Date());
    return { updated: changes.length, sender: sender };
  });

  if (result.error) return errorOut_(result.error);
  if (result.sender) sendDetailedNotificationEmail(reqNo, result.sender);
  return jsonOut_({ status: 'success', updated: result.updated });
}

function handleNotifyDecision_(user, payload) {
  if (user.role !== 'Admin') return errorOut_('Only Admin can review requests in the system.');
  notifyRequesters_([payload.reqNo]);
  return jsonOut_({ status: 'success' });
}
