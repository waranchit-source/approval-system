// Approval System – 3_EmailApproval.gs (part of the Apps Script project, see 1_Config.gs)

// ======================================================================
// doGet: dropdown data + approval links from email
// ======================================================================

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  try {
    if (params.action === 'getDropdowns') return jsonOut_(getDropdowns_());
    if (params.action === 'approve' || params.action === 'reject' || params.action === 'partialApprove') {
      return handleEmailActionPage_(params);
    }
    return htmlPage_('Approval System', 'Approval System is running.', false);
  } catch (err) {
    console.error(err);
    if (params.action === 'getDropdowns') return jsonOut_({ error: err.message });
    return htmlPage_('Error', 'Error: ' + err.message, true);
  }
}

function getDropdowns_() {
  var ddSheet = getSheet_(SHEET_DROPDOWN);
  var emailSheet = getSheet_(SHEET_EMAIL);
  var compSheet = getSheet_(SHEET_COMPANIES);
  var venSheet = getSheet_(SHEET_VENDORS);

  var ddData = ddSheet ? ddSheet.getDataRange().getValues() : [];
  var emailData = emailSheet ? emailSheet.getDataRange().getValues() : [];
  var compData = compSheet ? compSheet.getDataRange().getValues() : [];
  var venData = venSheet ? venSheet.getDataRange().getValues() : [];

  var branches = [], payMethods = [], banks = [], depts = [], emails = [], companies = [], vendors = [];

  for (var i = 1; i < ddData.length; i++) {
    if (str_(ddData[i][0])) branches.push(str_(ddData[i][0]));
    if (str_(ddData[i][1])) payMethods.push(str_(ddData[i][1]));
    if (str_(ddData[i][2])) banks.push(str_(ddData[i][2]));
    if (str_(ddData[i][3])) depts.push(str_(ddData[i][3]));
  }
  for (var j = 1; j < emailData.length; j++) {
    var groupName = str_(emailData[j][0]);
    if (groupName && emails.indexOf(groupName) === -1) emails.push(groupName);
  }
  for (var c = 1; c < compData.length; c++) {
    if (str_(compData[c][1])) companies.push(str_(compData[c][1]));
  }
  for (var v = 1; v < venData.length; v++) {
    if (str_(venData[v][2])) {
      vendors.push({ name: str_(venData[v][2]), bank: str_(venData[v][7]), accNo: str_(venData[v][8]) });
    }
  }

  return {
    branches: branches, paymentMethods: payMethods, banks: banks, departments: depts,
    emails: emails, companies: companies, vendors: vendors, requestorNames: getRequestorNames_()
  };
}

// ----------------------------------------------------------------------
// Email approvals use two steps:
// 1) The link / form in the email opens a confirmation page (GET). Opening it changes nothing,
//    so email security scanners that open every link cannot approve or reject by accident.
// 2) The approver presses "Confirm" on that page, which calls confirmEmailAction() and saves the result.
// ----------------------------------------------------------------------

// Reads and verifies the parameters of an email link/form. Returns { error } or the parsed action.
function parseEmailAction_(params) {
  params = params || {};
  var approver = str_(params.approver);
  var act = { approver: approver, decisionAll: null, decisions: {} };

  if (params.action === 'approve' || params.action === 'reject') {
    act.type = params.action;
    act.reqNos = normalizeReqNos_(params.reqNo);
    act.decisionAll = params.action === 'approve' ? 'Approve' : 'Reject';
  } else if (params.action === 'partialApprove') {
    act.type = 'partial';
    act.reqNos = normalizeReqNos_(params.reqNos);
  } else {
    return { error: 'Unknown action.' };
  }

  if (act.reqNos.length === 0) return { error: 'Request parameters are missing.' };
  if (!params.sig || params.sig !== emailLinkSignature_(act.reqNos, approver)) {
    return { error: 'This approval link is invalid or out of date. Please ask the requester to send the approval email again.' };
  }

  if (act.type === 'partial') {
    var count = 0;
    for (var key in params) {
      var m = key.match(/^(REQ-\d+)_(\d+)$/);
      if (m && act.reqNos.indexOf(m[1]) > -1 && (params[key] === 'Approve' || params[key] === 'Reject')) {
        if (!act.decisions[m[1]]) act.decisions[m[1]] = {};
        act.decisions[m[1]][parseInt(m[2], 10)] = params[key];
        count++;
      }
    }
    if (count === 0) return { error: 'No selections made. Please go back to the email and choose Approve or Reject for at least one item.' };
  }
  return act;
}

// Finds the items this action would change (only items still pending), grouped by request.
function collectEmailTargets_(data, act) {
  var result = { found: false, requests: [], approveCount: 0, rejectCount: 0, total: 0 };
  var byReq = {};
  var itemCounters = {};
  for (var k = 1; k < data.length; k++) {
    var row = data[k];
    var rNo = str_(row[COL.REQ_NO]);
    if (!rNo || act.reqNos.indexOf(rNo) === -1) continue;
    result.found = true;
    if (itemCounters[rNo] === undefined) itemCounters[rNo] = 0;
    var itemIndex = itemCounters[rNo]++;
    var decision = act.decisionAll || (act.decisions[rNo] ? act.decisions[rNo][itemIndex] : null);
    if (!decision || !isPending_(row[COL.STATUS])) continue;

    if (!byReq[rNo]) {
      byReq[rNo] = {
        reqNo: rNo, docType: str_(row[COL.DOC_TYPE]) || 'Payment Voucher', senderName: cleanName_(row[COL.SENDER]),
        requestorName: cleanName_(row[COL.REQUESTOR_NAME]), items: []
      };
      result.requests.push(byReq[rNo]);
    }
    byReq[rNo].items.push({
      rowIndex: k, description: str_(row[COL.DESC]), invoice: str_(row[COL.INVOICE]),
      supplierName: str_(row[COL.SUPPLIER]), total: num_(row[COL.TOTAL]), decision: decision
    });
    result.total += num_(row[COL.TOTAL]);
    if (decision === 'Approve') result.approveCount++; else result.rejectCount++;
  }
  return result;
}

// GET: show the confirmation page (no changes are saved here)
function handleEmailActionPage_(params) {
  var act = parseEmailAction_(params);
  if (act.error) return htmlPage_('Invalid link', act.error, true);

  var targets = collectEmailTargets_(getApprovalSheet_().getDataRange().getValues(), act);
  if (!targets.found) return htmlPage_('Not found', 'Requests not found. (' + act.reqNos.join(', ') + ')', true);
  if (targets.requests.length === 0) {
    return htmlPage_('Already processed', 'These items have already been approved or rejected, or are no longer waiting for approval.', true);
  }
  return renderConfirmPage_(act, targets, params);
}

// Called from the confirmation page with google.script.run (must not end with "_").
// Saves the decision and answers right away; the page then calls sendEmailDecisionNotifications()
// so the approver does not wait for the notification email to be sent.
function confirmEmailAction(params) {
  var act = parseEmailAction_(params);
  if (act.error) return { ok: false, message: act.error };

  var outcome;
  try {
    outcome = withLock_(function () {
      var sheet = getApprovalSheet_();
      var targets = collectEmailTargets_(sheet.getDataRange().getValues(), act);
      var changes = [];
      targets.requests.forEach(function (req) {
        req.items.forEach(function (item) {
          changes.push({ rowIndex: item.rowIndex, status: item.decision === 'Approve' ? 'Completed' : 'Rejected' });
        });
      });
      applyDecisions_(sheet, changes, act.approver, new Date());
      return { targets: targets };
    });
  } catch (err) {
    console.error(err);
    return { ok: false, retry: true, message: err.message };
  }

  if (!outcome.targets.found) return { ok: false, message: 'Requests not found. (' + act.reqNos.join(', ') + ')' };
  if (outcome.targets.requests.length === 0) {
    return { ok: false, message: 'Nothing was changed. These items have already been approved or rejected.' };
  }

  var parts = [];
  if (outcome.targets.approveCount) parts.push(outcome.targets.approveCount + ' item(s) approved');
  if (outcome.targets.rejectCount) parts.push(outcome.targets.rejectCount + ' item(s) rejected');
  return {
    ok: true,
    message: parts.join(' and ') + '. The requester will be notified by email.',
    notify: outcome.targets.requests.map(function (req) { return req.reqNo; })
  };
}

// Second call from the confirmation page: sends the result emails in the background.
function sendEmailDecisionNotifications(params, reqNos) {
  var act = parseEmailAction_(params);
  if (act.error) return { ok: false };
  var cache = CacheService.getScriptCache();
  var list = normalizeReqNos_(reqNos).filter(function (rn) {
    // Only requests from this signed link, and at most once per request every 10 minutes
    return act.reqNos.indexOf(rn) > -1 && !cache.get('notified|' + params.sig + '|' + rn);
  });
  notifyRequesters_(list);
  list.forEach(function (rn) { cache.put('notified|' + params.sig + '|' + rn, '1', 600); });
  return { ok: true };
}

function renderConfirmPage_(act, targets, params) {
  var titles = {
    approve: { title: 'Confirm Approval', button: 'Confirm Approve', cls: 'btn-approve' },
    reject: { title: 'Confirm Rejection', button: 'Confirm Reject', cls: 'btn-reject' },
    partial: { title: 'Confirm Selections', button: 'Confirm Selections', cls: 'btn-main' }
  };
  var t = titles[act.type];

  var summary = [];
  if (targets.approveCount) summary.push('<span class="tag tag-approve">Approve ' + targets.approveCount + '</span>');
  if (targets.rejectCount) summary.push('<span class="tag tag-reject">Reject ' + targets.rejectCount + '</span>');

  var reqHtml = targets.requests.map(function (req) {
    var itemsHtml = req.items.map(function (item) {
      var isApprove = item.decision === 'Approve';
      var sub = [];
      if (item.invoice) sub.push('Inv: ' + esc_(item.invoice));
      if (item.supplierName) sub.push('Sup: ' + esc_(item.supplierName));
      return '<div class="item">' +
        '<div class="item-main"><div class="item-desc">' + esc_(item.description) + '</div>' +
        (sub.length ? '<div class="muted small">' + sub.join(' &middot; ') + '</div>' : '') + '</div>' +
        '<div class="item-side"><div class="amount">' + money_(item.total) + '</div>' +
        '<span class="tag ' + (isApprove ? 'tag-approve' : 'tag-reject') + '">' + (isApprove ? 'Approve' : 'Reject') + '</span></div>' +
        '</div>';
    }).join('');
    return '<div class="req">' +
      '<div class="req-head"><strong>' + esc_(req.reqNo) + '</strong> <span class="muted">(' + esc_(req.docType) + ')</span>' +
      '<div class="muted small">Requestor Name: <span class="light">' + esc_(req.requestorName || '-') + '</span> &middot; Senders: <span class="light">' + esc_(req.senderName || '-') + '</span></div></div>' +
      itemsHtml + '</div>';
  }).join('');

  var note = act.type === 'partial' ? '<p class="muted small">Items you did not select stay pending.</p>' : '';
  var paramsJson = JSON.stringify(params).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  var body =
    '<div class="card" id="confirmCard">' +
      '<h1 class="ig">' + t.title + '</h1>' +
      '<p class="muted">Approver: <span class="light">' + esc_(act.approver) + '</span></p>' +
      '<div class="summary">' + summary.join(' ') + '</div>' +
      reqHtml +
      '<div class="grand"><span>Total</span><span class="grand-amount">' + money_(targets.total) + ' THB</span></div>' +
      note +
      '<div id="message" class="message" role="status" aria-live="polite"></div>' +
      '<div class="actions" id="actions">' +
        '<button type="button" class="btn ' + t.cls + '" id="btnConfirm" onclick="confirmAction()">' + t.button + '</button>' +
        '<button type="button" class="btn btn-cancel" id="btnCancel" onclick="cancelAction()">Cancel</button>' +
      '</div>' +
    '</div>' +
    '<script>' +
      'var PARAMS = ' + paramsJson + ';' +
      'var LABEL = ' + JSON.stringify(t.button) + ';' +
      'function setBusy(busy){var b=document.getElementById("btnConfirm");b.disabled=busy;document.getElementById("btnCancel").disabled=busy;b.textContent=busy?"Processing...":LABEL;}' +
      'function showMessage(text,kind){var m=document.getElementById("message");m.textContent=text;m.className="message "+kind;}' +
      'function finish(text,kind,title){document.getElementById("actions").style.display="none";showMessage(text,kind);if(title){document.querySelector("#confirmCard h1").textContent=title;}}' +
      'function confirmAction(){setBusy(true);showMessage("","");' +
        'google.script.run' +
          '.withSuccessHandler(function(res){if(res&&res.ok){finish(res.message,"ok","Done");if(res.notify&&res.notify.length){google.script.run.withSuccessHandler(function(){}).withFailureHandler(function(){}).sendEmailDecisionNotifications(PARAMS,res.notify);}}else if(res&&res.retry){setBusy(false);showMessage(res.message+" Please try again.","error");}else{finish((res&&res.message)||"Something went wrong.","error");}})' +
          '.withFailureHandler(function(err){setBusy(false);showMessage("Could not save: "+((err&&err.message)||"connection error")+". Please try again.","error");})' +
          '.confirmEmailAction(PARAMS);}' +
      'function cancelAction(){finish("No changes were made. You can close this window.","neutral","Cancelled");}' +
    '</script>';

  return pageShell_(t.title, body);
}
