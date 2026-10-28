var SHEET_APPROVAL = 'Approval';
var SHEET_USERS = 'Users';
var SHEET_DROPDOWN = 'Dropdown';
var SHEET_EMAIL = 'Email';
var SHEET_EMAIL_CC = 'Email ACC';
var SHEET_COMPANIES = 'Companies';
var SHEET_VENDORS = 'Vendor name';
var SHEET_REQUESTORS = 'Requestor Name';
var SHEET_ACTIVITY = 'Activity Log';

var COL = {
  DATE: 0, REQ_NO: 1, DESC: 2, AMOUNT: 3, VAT: 4, WHT: 5, TOTAL: 6, PHOTO: 7, IMAGE_URL: 8,
  INVOICE: 9, BRANCH: 10, DEPT: 11, REMARKS: 12, PAY_METHOD: 13, BANK: 14, ACC_NAME: 15, ACC_NO: 16,
  STATUS: 17, SENDER: 18, APPROVER: 19, APPROVAL_DATE: 20, DOC_TYPE: 21, PAY_DATE: 22,
  COMPANY: 23, SUPPLIER: 24, REQUESTOR_NAME: 25
};
var NUM_COLS = 26;
var REQUESTOR_NAME_HEADER = 'Requestor Name';

var DEFAULT_APPROVER = 'admin@paperplanebkk.com';
var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
var PASSWORD_ITERATIONS = 500;
var MAX_FILE_BASE64_LENGTH = 7 * 1024 * 1024;
var MANUAL_PENDING = 'Pending (Manual)';
var SUBMIT_CACHE_SECONDS = 21600;
var DROPDOWN_CACHE_SECONDS = 300;
var USER_CACHE_SECONDS = 120;
var ACTIVITY_LIMIT = 500;

function setupDrivePermission() {
  var file = DriveApp.createFile("test_permission_approval_system.txt", "Test");
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  file.setTrashed(true);
  var email = Session.getActiveUser().getEmail();
  MailApp.sendEmail(email, "System Auth Check", "Authorization Successful.");
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorOut_(message, code) {
  var obj = { status: 'error', message: message };
  if (code) obj.code = code;
  return jsonOut_(obj);
}

function str_(value) {
  return (value === null || value === undefined) ? '' : String(value).trim();
}

function num_(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  var n = parseFloat(str_(value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

function money_(value) {
  return num_(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc_(value) {
  return str_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cellText_(value) {
  var s = str_(value);
  if (/^[=+\-@]/.test(s) || /^0\d+$/.test(s)) return "'" + s;
  return s;
}

function cleanName_(value) {
  return str_(value).replace(/\s+/g, ' ');
}

function padReqNo_(n) {
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return 'REQ-' + s;
}

function dateOnly_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return str_(value);
}

function isPending_(status) {
  return str_(status).indexOf('Pending') > -1;
}

function isManualPending_(status) {
  return str_(status).indexOf(MANUAL_PENDING) === 0;
}

function isFinal_(status) {
  var s = str_(status);
  return s === 'Completed' || s === 'Rejected';
}

function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getApprovalSheet_() {
  var sheet = getSheet_(SHEET_APPROVAL);
  if (!sheet) throw new Error('Sheet "' + SHEET_APPROVAL + '" not found.');
  return sheet;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('System is busy. Please try again in a moment.');
  try {
    return fn();
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

function applyDecisions_(sheet, changes, approver, when) {
  var sorted = changes.slice().sort(function (a, b) { return a.rowIndex - b.rowIndex; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1].rowIndex === sorted[j].rowIndex + 1) j++;
    var run = sorted.slice(i, j + 1);
    var firstRow = run[0].rowIndex + 1;
    sheet.getRange(firstRow, COL.STATUS + 1, run.length, 1).setValues(run.map(function (c) { return [c.status]; }));
    sheet.getRange(firstRow, COL.APPROVER + 1, run.length, 2).setValues(run.map(function () { return [approver, when]; }));
    i = j + 1;
  }
}

function applyChangesToData_(data, changes, approver, when) {
  changes.forEach(function (c) {
    data[c.rowIndex][COL.STATUS] = c.status;
    if (approver !== undefined) {
      data[c.rowIndex][COL.APPROVER] = approver;
      data[c.rowIndex][COL.APPROVAL_DATE] = when;
    }
  });
}

function logActivity_(user, action, reqNos, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_ACTIVITY);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_ACTIVITY);
      sheet.appendRow(['Timestamp', 'User', 'Email', 'Role', 'Action', 'Ref No.', 'Details']);
      sheet.setFrozenRows(1);
    }
    var refs = Array.isArray(reqNos) ? reqNos.join(', ') : str_(reqNos);
    sheet.appendRow([new Date(), cellText_(user && user.name), cellText_(user && user.id), cellText_(user && user.role), cellText_(action), cellText_(refs), cellText_(details)]);
  } catch (e) {
    console.error('logActivity_ failed: ' + e);
  }
}

function buildRequests_(user, data, onlyReqNos) {
  var requests = {};
  var order = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var reqNo = str_(row[COL.REQ_NO]);
    if (!reqNo) continue;
    if (onlyReqNos && onlyReqNos.indexOf(reqNo) === -1) continue;
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

  return order.map(function (key) {
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
}

function setStatuses_(sheet, changes) {
  var sorted = changes.slice().sort(function (a, b) { return a.rowIndex - b.rowIndex; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1].rowIndex === sorted[j].rowIndex + 1) j++;
    var run = sorted.slice(i, j + 1);
    sheet.getRange(run[0].rowIndex + 1, COL.STATUS + 1, run.length, 1).setValues(run.map(function (c) { return [c.status]; }));
    i = j + 1;
  }
}

function deleteRowNumbers_(sheet, rowNumbers) {
  var sorted = rowNumbers.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] - 1) j++;
    sheet.deleteRows(sorted[j], j - i + 1);
    i = j + 1;
  }
}

var PAGE_CSS =
  '*{box-sizing:border-box}' +
  'body{margin:0;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.45}' +
  '.wrap{max-width:640px;margin:0 auto;padding:32px 16px}' +
  '.card{background:#161616;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:24px}' +
  'h1{margin:0 0 6px;font-size:24px}' +
  '.ig{background:linear-gradient(45deg,#f09433,#dc2743,#bc1888);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}' +
  '.muted{color:#9a9a9a}.light{color:#e6e6e6}.small{font-size:12px}' +
  '.summary{margin:12px 0 4px}' +
  '.tag{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px}' +
  '.tag-approve{background:rgba(40,167,69,.18);color:#4ade80}.tag-reject{background:rgba(220,53,69,.18);color:#f87171}' +
  '.req{border:1px solid rgba(255,255,255,.1);border-radius:14px;margin-top:16px;overflow:hidden}' +
  '.req-head{background:rgba(255,255,255,.05);padding:12px 16px}' +
  '.item{display:flex;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.06)}' +
  '.item-main{min-width:0}.item-desc{font-weight:600;word-break:break-word}' +
  '.item-side{text-align:right;flex-shrink:0}.amount{font-weight:700;margin-bottom:4px;font-variant-numeric:tabular-nums}' +
  '.grand{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(240,148,51,.12);font-weight:700}' +
  '.grand-amount{color:#ff8a8a;font-size:18px;font-variant-numeric:tabular-nums}' +
  '.actions{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}' +
  '.btn{flex:1 1 180px;padding:14px 20px;border:0;border-radius:999px;font-size:15px;font-weight:700;color:#fff;cursor:pointer}' +
  '.btn:disabled{opacity:.6;cursor:wait}' +
  '.btn-approve{background:#28a745}.btn-reject{background:#dc3545}' +
  '.btn-main{background:linear-gradient(45deg,#f09433,#dc2743,#bc1888)}' +
  '.btn-cancel{background:transparent;border:1px solid rgba(255,255,255,.3)}' +
  '.message{margin-top:16px;font-weight:600}.message:empty{display:none}' +
  '.message.ok{color:#4ade80}.message.error{color:#ff6b6b}.message.neutral{color:#cfcfcf}';

function pageShell_(title, bodyHtml) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + PAGE_CSS + '</style></head>' +
    '<body><div class="wrap">' + bodyHtml + '</div></body></html>'
  ).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function htmlPage_(title, message, isError) {
  return pageShell_(title,
    '<div class="card"><h1 class="' + (isError ? '' : 'ig') + '"' + (isError ? ' style="color:#ff6b6b"' : '') + '>' + esc_(title) + '</h1>' +
    '<p class="' + (isError ? 'light' : 'muted') + '">' + esc_(message) + '</p></div>');
}

var authSecretCache_ = null;

function getSecret_() {
  if (authSecretCache_) return authSecretCache_;
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('AUTH_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', secret);
  }
  authSecretCache_ = secret;
  return secret;
}

function sign_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, getSecret_())).replace(/=+$/, '');
}

function hashPassword_(password, salt) {
  salt = salt || Utilities.getUuid();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  for (var i = 0; i < PASSWORD_ITERATIONS; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return 'sha256$' + salt + '$' + Utilities.base64Encode(bytes);
}

function isHashedPassword_(stored) {
  return str_(stored).indexOf('sha256$') === 0;
}

function checkPassword_(stored, password) {
  var s = (stored === null || stored === undefined) ? '' : String(stored);
  if (isHashedPassword_(s)) {
    return hashPassword_(String(password), s.split('$')[1]) === s;
  }
  return s !== '' && s === String(password);
}

function createToken_(userId) {
  var payload = str_(userId).toLowerCase() + '|' + (Date.now() + TOKEN_TTL_MS);
  var encoded = Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8).replace(/=+$/, '');
  return encoded + '.' + sign_(payload);
}

function findUserRow_(userId) {
  var sheet = getSheet_(SHEET_USERS);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var id = str_(userId).toLowerCase();
  if (!id) return null;
  for (var i = 1; i < data.length; i++) {
    if (str_(data[i][0]).toLowerCase() === id) return { sheet: sheet, index: i, row: data[i] };
  }
  return null;
}

function userFromRow_(row) {
  return { id: str_(row[0]), name: cleanName_(row[2]), branch: str_(row[3]), role: str_(row[5]) || 'User' };
}

function getAuthUser_(token) {
  var t = str_(token);
  var dot = t.indexOf('.');
  if (dot < 1) return null;
  var encoded = t.slice(0, dot);
  var signature = t.slice(dot + 1);
  var payload;
  try {
    while (encoded.length % 4) encoded += '=';
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString('UTF-8');
  } catch (e) {
    return null;
  }
  if (sign_(payload) !== signature) return null;
  var parts = payload.split('|');
  var expires = Number(parts[1]);
  if (!expires || expires < Date.now()) return null;
  return findAuthUser_(parts[0]);
}

function findAuthUser_(userId) {
  var key = 'authuser|' + str_(userId).toLowerCase();
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  var found = findUserRow_(userId);
  if (!found || str_(found.row[4]) !== 'Approved') return null;
  var user = userFromRow_(found.row);
  cache.put(key, JSON.stringify(user), USER_CACHE_SECONDS);
  return user;
}

function canAccess_(user, senderName) {
  return user.role === 'Admin' || cleanName_(senderName) === user.name;
}

function normalizeReqNos_(value) {
  var list = Array.isArray(value) ? value : str_(value).split(',');
  var result = [];
  list.forEach(function (v) {
    var s = str_(v);
    if (s && result.indexOf(s) === -1) result.push(s);
  });
  return result;
}

function emailLinkSignature_(reqNos, approver) {
  return sign_('email|' + normalizeReqNos_(reqNos).join(',') + '|' + str_(approver));
}

function getEmailsFromGroup(groupName) {
  try {
    var sheet = getSheet_(SHEET_EMAIL);
    if (!sheet) return str_(groupName);
    var data = sheet.getDataRange().getValues();
    var collectedEmails = [];
    for (var i = 1; i < data.length; i++) {
      if (str_(data[i][0]) === str_(groupName)) {
        var emailAddress = str_(data[i][1]);
        if (emailAddress !== '' && collectedEmails.indexOf(emailAddress) === -1) collectedEmails.push(emailAddress);
      }
    }
    if (collectedEmails.length > 0) return collectedEmails.join(',');
  } catch (e) {}
  return str_(groupName);
}

function findUserEmailByName_(name) {
  var sheet = getSheet_(SHEET_USERS);
  if (!sheet) return '';
  var target = cleanName_(name);
  var data = sheet.getDataRange().getValues();
  for (var u = 1; u < data.length; u++) {
    if (cleanName_(data[u][2]) === target && str_(data[u][0]).indexOf('@') > -1) return str_(data[u][0]);
  }
  return '';
}

function getCcEmails_() {
  var sheet = getSheet_(SHEET_EMAIL_CC);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var list = [];
  values.forEach(function (r) {
    var e = str_(r[0]);
    if (e.indexOf('@') > -1 && list.indexOf(e) === -1) list.push(e);
  });
  return list;
}

function getRequestorNames_() {
  var sheet = getSheet_(SHEET_REQUESTORS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  var seen = {};
  var names = [];
  values.forEach(function (r) {
    var name = cleanName_(r[0]);
    if (name && !seen[name.toLowerCase()]) {
      seen[name.toLowerCase()] = true;
      names.push(name);
    }
  });
  return names;
}

function ensureRequestorNameHeader_(sheet) {
  var cell = sheet.getRange(1, COL.REQUESTOR_NAME + 1);
  if (str_(cell.getValue()) === '') cell.setValue(REQUESTOR_NAME_HEADER);
}

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  try {
    if (params.action === 'getDropdowns') return jsonOut_(getDropdownsCached_(params.refresh === '1'));
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

function getDropdownsCached_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('dropdowns_v1');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
  }
  var data = getDropdowns_();
  var json = JSON.stringify(data);
  if (json.length < 95000) cache.put('dropdowns_v1', json, DROPDOWN_CACHE_SECONDS);
  return data;
}

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
  logActivity_({ name: act.approver, id: '', role: 'Approver (email)' }, 'Approve / Reject by email', outcome.targets.requests.map(function (req) { return req.reqNo; }), parts.join(', '));
  return {
    ok: true,
    message: parts.join(' and ') + '. The requester will be notified by email.',
    notify: outcome.targets.requests.map(function (req) { return req.reqNo; })
  };
}

function sendEmailDecisionNotifications(params, reqNos) {
  var act = parseEmailAction_(params);
  if (act.error) return { ok: false };
  var cache = CacheService.getScriptCache();
  var list = normalizeReqNos_(reqNos).filter(function (rn) {
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
    if (action === 'notifyDecision') return handleNotifyDecision_(user, payload);
    if (action === 'printBatchRequest') return handlePrintBatch_(user, payload.reqNos);
    if (action === 'manualApprove') return handleManualApprove_(user, payload);
    if (action === 'getActivityLog') return handleGetActivityLog_(user, payload);

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
    logActivity_({ name: name, id: id, role: 'User' }, 'Register', '', 'Branch: ' + branch);
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

  if (!isHashedPassword_(found.row[1])) {
    found.sheet.getRange(found.index + 1, 2).setValue(hashPassword_(password));
  }

  var user = userFromRow_(found.row);
  logActivity_(user, 'Login', '', '');
  return jsonOut_({ status: 'success', user: user, token: createToken_(user.id) });
}

function handleSubmitRequest_(user, data) {
  var items = Array.isArray(data.items) ? data.items : [];
  var requestorName = cleanName_(data.requestorName);
  var approver = str_(data.approverEmail);
  var docType = str_(data.docType) || 'Payment Voucher';
  var editReqNo = str_(data.editReqNo);
  var submitKey = str_(data.submitId) ? 'submit|' + str_(data.submitId).slice(0, 100) : '';

  if (items.length === 0) return errorOut_('Please add at least one item.');
  if (!requestorName) return errorOut_('Please select or type the Requestor Name.');
  if (!approver) return errorOut_('Please select an Approver.');
  for (var v = 0; v < items.length; v++) {
    if (!str_(items[v] && items[v].description)) return errorOut_('Please fill Description in Item #' + (v + 1));
  }

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
    var cache = submitKey ? CacheService.getScriptCache() : null;
    var targetReqNo = editReqNo;

    if (!targetReqNo && cache) {
      var savedReqNo = str_(cache.get(submitKey));
      if (savedReqNo) {
        for (var s = 1; s < all.length; s++) {
          if (str_(all[s][COL.REQ_NO]) === savedReqNo) {
            targetReqNo = savedReqNo;
            break;
          }
        }
      }
    }

    if (targetReqNo) {
      reqNo = targetReqNo;
      var allCompleted = true;
      for (var r = 1; r < all.length; r++) {
        if (str_(all[r][COL.REQ_NO]) === reqNo) {
          if (rowsToDelete.length === 0) {
            sender = cleanName_(all[r][COL.SENDER]) || user.name;
            if (all[r][COL.DATE] instanceof Date) reqDate = all[r][COL.DATE];
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

    if (rowsToDelete.length > 0) deleteRowNumbers_(sheet, rowsToDelete);
    if (cache) cache.put(submitKey, reqNo, SUBMIT_CACHE_SECONDS);
    var savedTotal = rows.reduce(function (sum, row) { return sum + num_(row[COL.TOTAL]); }, 0);
    var saveAction = editReqNo ? 'Edit Request' : (targetReqNo ? 'Save Request (repeated)' : 'Create Request');
    logActivity_(user, saveAction, reqNo, rows.length + ' item(s), total ' + money_(savedTotal) + ' THB, approver: ' + approver);
    return jsonOut_({ status: 'success', reqNo: reqNo });
  });
}

function handleGetRequests_(user) {
  var data = getApprovalSheet_().getDataRange().getValues();
  return jsonOut_({ status: 'success', data: buildRequests_(user, data) });
}

function handleBatchSend_(user, reqNosInput) {
  var reqNos = normalizeReqNos_(reqNosInput);
  if (reqNos.length === 0) return errorOut_('Please select at least one request.');
  var scriptUrl = ScriptApp.getService().getUrl();

  return withLock_(function () {
    var sheet = getApprovalSheet_();
    var data = sheet.getDataRange().getValues();
    var groups = {};
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
      if (isFinal_(row[COL.STATUS])) continue;

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
    var sentReqNos = [];
    var sentTo = [];
    approvers.forEach(function (approver) {
      var group = groups[approver];
      var requestsArray = group.order.map(function (rn) { return group.requests[rn]; });
      try {
        sendBatchApprovalEmail(requestsArray, approver, user, scriptUrl);

        setStatuses_(sheet, group.rows.map(function (k) { return { rowIndex: k, status: 'Pending with ' + approver }; }));
        group.rows.forEach(function (k) { data[k][COL.STATUS] = 'Pending with ' + approver; });
        group.order.forEach(function (rn) { if (sentReqNos.indexOf(rn) === -1) sentReqNos.push(rn); });
        sentTo.push(approver);
      } catch (err) {
        console.error(err);
        failures.push(approver + ': ' + err.message);
      }
    });

    if (sentReqNos.length > 0) logActivity_(user, 'Send Approval Email', sentReqNos, 'To: ' + sentTo.join(', '));
    if (failures.length > 0) return errorOut_('Could not send email to ' + failures.join('; '));
    return jsonOut_({ status: 'success', requests: buildRequests_(user, data, reqNos) });
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
    applyChangesToData_(data, changes);
    logActivity_(user, 'Print PDF for Approval', printable, changes.length + ' item(s) set to Pending (Manual)');
    return jsonOut_({ status: 'success', reqNos: printable, updated: changes.length, requests: buildRequests_(user, data, printable) });
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
    var when = new Date();
    applyDecisions_(sheet, changes, user.name, when);
    applyChangesToData_(data, changes, user.name, when);
    var approvedCount = changes.filter(function (c) { return c.status === 'Completed'; }).length;
    return {
      found: found, updated: changes.length > 0, sender: sender,
      summary: approvedCount + ' approved, ' + (changes.length - approvedCount) + ' rejected',
      requests: buildRequests_(user, data, [reqNo])
    };
  });

  if (!result.found) return errorOut_('Request ' + reqNo + ' not found.');

  if (result.updated) logActivity_(user, 'Review in system', reqNo, result.summary);
  if (result.updated && result.sender && !payload.deferNotify) sendDetailedNotificationEmail(reqNo, result.sender);
  return jsonOut_({ status: 'success', updated: result.updated, requests: result.requests });
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
    var when = new Date();
    applyDecisions_(sheet, changes, approver || DEFAULT_APPROVER, when);
    applyChangesToData_(data, changes, approver || DEFAULT_APPROVER, when);
    return { updated: changes.length, sender: sender, requests: buildRequests_(user, data, [reqNo]) };
  });

  if (result.error) return errorOut_(result.error);
  logActivity_(user, 'Mark Approved (signed document)', reqNo, result.updated + ' item(s) set to Completed');
  if (result.sender && !payload.deferNotify) sendDetailedNotificationEmail(reqNo, result.sender);
  return jsonOut_({ status: 'success', updated: result.updated, requests: result.requests });
}

function handleNotifyDecision_(user, payload) {
  var reqNo = str_(payload.reqNo);
  if (user.role !== 'Admin') {
    var data = getApprovalSheet_().getDataRange().getValues();
    var sender = null;
    for (var i = 1; i < data.length; i++) {
      if (str_(data[i][COL.REQ_NO]) === reqNo) {
        sender = data[i][COL.SENDER];
        break;
      }
    }
    if (sender === null || !canAccess_(user, sender)) return errorOut_('You do not have permission to send this notification.');
  }
  notifyRequesters_([reqNo]);
  return jsonOut_({ status: 'success' });
}

function handleGetActivityLog_(user, payload) {
  if (user.role !== 'Admin') return errorOut_('Only Admin can view the activity log.');
  var sheet = getSheet_(SHEET_ACTIVITY);
  if (!sheet || sheet.getLastRow() < 2) return jsonOut_({ status: 'success', data: [] });
  var limit = Math.min(Math.max(parseInt(payload && payload.limit, 10) || ACTIVITY_LIMIT, 1), 2000);
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - limit + 1);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var rows = values.map(function (r) {
    var when = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd HH:mm:ss') : str_(r[0]);
    return { time: when, user: str_(r[1]), email: str_(r[2]), role: str_(r[3]), action: str_(r[4]), refs: str_(r[5]), details: str_(r[6]) };
  }).reverse();
  return jsonOut_({ status: 'success', data: rows });
}

function notifyRequesters_(reqNos) {
  var list = normalizeReqNos_(reqNos);
  if (list.length === 0) return;
  var data = getApprovalSheet_().getDataRange().getValues();
  list.forEach(function (rn) {
    for (var i = 1; i < data.length; i++) {
      if (str_(data[i][COL.REQ_NO]) === rn) {
        sendDetailedNotificationEmail(rn, data[i][COL.SENDER], data);
        return;
      }
    }
  });
}

function sendDetailedNotificationEmail(reqNo, senderName, preloadedData) {
  try {
    var data = preloadedData || getApprovalSheet_().getDataRange().getValues();
    var allItemsHtml = '';
    var approver = '';
    var requestorName = '';
    var grandTotal = 0;
    var docTypeStr = 'Payment Voucher';
    var isAllComplete = true;
    var isAllReject = true;
    var hasPending = false;
    var found = false;

    allItemsHtml += "<div style='margin-top:20px; background:#fefefe; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;'>";
    allItemsHtml += "<table style='width:100%; border-collapse:collapse; font-size:13px;'>";

    for (var i = 1; i < data.length; i++) {
      if (str_(data[i][COL.REQ_NO]) !== reqNo) continue;
      found = true;
      approver = str_(data[i][COL.APPROVER]) || approver;
      docTypeStr = str_(data[i][COL.DOC_TYPE]) || docTypeStr;
      requestorName = cleanName_(data[i][COL.REQUESTOR_NAME]) || requestorName;
      var status = str_(data[i][COL.STATUS]);
      var color = status === 'Completed' ? '#28a745' : (status === 'Rejected' ? '#dc3545' : '#f09433');
      grandTotal += num_(data[i][COL.TOTAL]);

      if (status !== 'Completed') isAllComplete = false;
      if (status !== 'Rejected') isAllReject = false;
      if (isPending_(status)) hasPending = true;

      var pUrl = str_(data[i][COL.PHOTO]);
      var fileLinkHtml = pUrl !== '' ? "<br><a href=\"" + esc_(pUrl) + "\" target=\"_blank\" style=\"color:#0d6efd; font-size:11px; text-decoration:underline;\">📄 View Attached File</a>" : '';

      allItemsHtml += "<tr style='border-bottom:1px solid #eee;'>" +
        "<td style='padding:15px; width:45%;'>" +
        "<div style='margin-top:6px; font-weight:bold; color:#222;'>" + esc_(data[i][COL.DESC]) + " <span style='color:" + color + ";'>[" + esc_(status) + "]</span></div>" +
        "<div style='color:#777; font-size:11px; margin-top:3px;'>Inv: " + esc_(str_(data[i][COL.INVOICE]) || '-') + " | Co: " + esc_(str_(data[i][COL.COMPANY]) || '-') + " | Sup: " + esc_(str_(data[i][COL.SUPPLIER]) || '-') + "</div>" +
        fileLinkHtml + "</td>" +
        "<td style='padding:15px; text-align:right; color:#444; width:20%;'>" + money_(data[i][COL.AMOUNT]) + "</td>" +
        "<td style='padding:15px; text-align:center; color:#444; width:15%;'>" + esc_(data[i][COL.PAY_METHOD]) + "</td>" +
        "<td style='padding:15px; text-align:right; font-weight:bold; color:#111; width:20%;'>" + money_(data[i][COL.TOTAL]) + "</td>" +
        "</tr>";
    }
    if (!found) return;

    allItemsHtml += "<tr><td colspan='3' style='padding:12px 15px; text-align:right; font-size:12px; color:#555;'>Subtotal " + esc_(reqNo) + ":</td><td style='padding:12px 15px; text-align:right; font-weight:bold;'>" + money_(grandTotal) + "</td></tr>";
    allItemsHtml += "</table></div>";

    var overallStatus = isAllComplete ? 'Completed' : (isAllReject ? 'Rejected' : (hasPending ? 'Pending' : 'Partial'));
    var titleColor = overallStatus === 'Completed' ? '#28a745' : (overallStatus === 'Rejected' ? '#dc3545' : '#f09433');

    var notifBody = "<div style='font-family:Arial,sans-serif; max-width:700px; margin:0 auto; background:#fff; border-radius:15px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);'>" +
      "<div style='background:" + titleColor + "; padding:25px; text-align:center; color:#fff;'>" +
      "<h2 style='margin:0; font-size:24px;'>Request " + overallStatus + "</h2><p style='margin:5px 0 0 0; opacity: 0.9;'>" + esc_(reqNo) + " (" + esc_(docTypeStr) + ")</p></div>" +
      "<div style='padding:25px;'>" +
      "<p style='color:#444; margin:0 0 5px 0;'><strong>Requestor Name:</strong> " + esc_(requestorName || '-') + "</p>" +
      "<p style='color:#444; margin:0 0 20px 0;'><strong>Senders:</strong> " + esc_(senderName) + "</p>" +
      "<p style='color:#444; margin-bottom:20px;'>Your request has been reviewed by <strong>" + esc_(approver) + "</strong>.</p>" +
      allItemsHtml +
      "</div></div>";

    var emailOptions = {
      subject: 'Update: Your Request ' + reqNo + ' is ' + overallStatus,
      htmlBody: notifBody,
      name: 'Approval System'
    };

    var senderEmail = findUserEmailByName_(senderName);
    var ccList = getCcEmails_().filter(function (e) { return e.toLowerCase() !== senderEmail.toLowerCase(); });
    if (senderEmail) {
      emailOptions.to = senderEmail;
      if (ccList.length > 0) emailOptions.cc = ccList.join(',');
    } else if (ccList.length > 0) {
      emailOptions.to = ccList.shift();
      if (ccList.length > 0) emailOptions.cc = ccList.join(',');
    } else {
      return;
    }
    MailApp.sendEmail(emailOptions);
  } catch (e) {
    console.error('sendDetailedNotificationEmail failed: ' + e);
  }
}

function sendBatchApprovalEmail(requestsArray, approverGroup, sentBy, scriptUrl) {
  var targetEmails = getEmailsFromGroup(approverGroup);
  if (targetEmails.indexOf('@') === -1) throw new Error('No email address found for approver "' + approverGroup + '" in sheet "' + SHEET_EMAIL + '".');

  var reqNos = requestsArray.map(function (r) { return r.reqNo; });
  var sig = emailLinkSignature_(reqNos, approverGroup);
  var enc = function (s) { return encodeURIComponent(s).replace(/'/g, '%27'); };
  var linkParams = 'reqNo=' + enc(reqNos.join(',')) + '&approver=' + enc(approverGroup) + '&sig=' + enc(sig);
  var approveUrl = scriptUrl + '?action=approve&' + linkParams;
  var rejectUrl = scriptUrl + '?action=reject&' + linkParams;

  var formHtml = "<form action=\"" + esc_(scriptUrl) + "\" method=\"GET\" target=\"_blank\">" +
    "<input type=\"hidden\" name=\"action\" value=\"partialApprove\">" +
    "<input type=\"hidden\" name=\"approver\" value=\"" + esc_(approverGroup) + "\">" +
    "<input type=\"hidden\" name=\"reqNos\" value=\"" + esc_(reqNos.join(',')) + "\">" +
    "<input type=\"hidden\" name=\"sig\" value=\"" + esc_(sig) + "\">";

  var allItemsHtml = '';
  var superGrandTotal = 0;

  requestsArray.forEach(function (req) {
    allItemsHtml += "<div style='margin-top:20px; background:#fefefe; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;'>";
    allItemsHtml += "<div style='background:#f1f3f5; padding:12px 15px; border-bottom:1px solid #e0e0e0;'>";
    allItemsHtml += "<strong style='color:#333; font-size:16px;'>" + esc_(req.reqNo) + "</strong> <span style='color:#666; font-size:14px;'>(" + esc_(req.docType || 'Payment Voucher') + ")</span>";
    allItemsHtml += "<div style='color:#555; font-size:12px; margin-top:4px;'>Requestor Name: <strong>" + esc_(req.requestorName || '-') + "</strong> &nbsp;|&nbsp; Senders: " + esc_(req.senderName || '-') + "</div>";
    allItemsHtml += "</div>";
    allItemsHtml += "<table style='width:100%; border-collapse:collapse; font-size:13px;'>";
    var reqTotal = 0;

    req.items.forEach(function (item) {
      reqTotal += num_(item.total);
      var radioName = esc_(req.reqNo + '_' + item.index);
      var pUrl = str_(item.photoUrl);
      var fileLinkHtml = pUrl !== '' ? "<br><a href=\"" + esc_(pUrl) + "\" target=\"_blank\" style=\"color:#0d6efd; font-size:11px; text-decoration:underline;\">📄 View Attached File</a>" : '';

      allItemsHtml += "<tr style='border-bottom:1px solid #eee;'>" +
        "<td style='padding:15px; width:45%;'>" +
        "<div><label><input type='radio' name='" + radioName + "' value='Approve' style='accent-color:#28a745;'> <b style='color:#28a745'>Approve</b></label> &nbsp;|&nbsp; " +
        "<label><input type='radio' name='" + radioName + "' value='Reject' style='accent-color:#dc3545;'> <b style='color:#dc3545'>Reject</b></label></div>" +
        "<div style='margin-top:6px; font-weight:bold; color:#222;'>" + esc_(item.description) + "</div>" +
        "<div style='color:#777; font-size:11px; margin-top:3px;'>Inv: " + esc_(str_(item.invoice) || '-') + " | Co: " + esc_(str_(item.companyName) || '-') + " | Sup: " + esc_(str_(item.supplierName) || '-') + "</div>" +
        fileLinkHtml + "</td>" +
        "<td style='padding:15px; text-align:right; color:#444; width:20%;'>" + money_(item.amount) + "</td>" +
        "<td style='padding:15px; text-align:center; color:#444; width:15%;'>" + esc_(item.paymentMethod) + "</td>" +
        "<td style='padding:15px; text-align:right; font-weight:bold; color:#111; width:20%;'>" + money_(item.total) + "</td>" +
        "</tr>";
    });
    superGrandTotal += reqTotal;
    allItemsHtml += "<tr><td colspan='3' style='padding:12px 15px; text-align:right; font-size:12px; color:#555;'>Subtotal " + esc_(req.reqNo) + ":</td><td style='padding:12px 15px; text-align:right; font-weight:bold;'>" + money_(reqTotal) + "</td></tr>";
    allItemsHtml += "</table></div>";
  });

  var htmlBody = "<div style='font-family:Arial,sans-serif; max-width:700px; margin:0 auto; background:#fff; border-radius:15px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);'>" +
    "<div style='background:linear-gradient(45deg, #f09433, #dc2743, #bc1888); padding:25px; text-align:center; color:#fff;'>" +
    "<h2 style='margin:0; font-size:24px;'>Approval Requests</h2><p style='margin:5px 0 0 0; opacity:0.9;'>Batch Review</p>" +
    "</div>" +
    "<div style='padding:25px;'>" +
    "<p style='color:#444; margin-bottom:5px;'><strong>Sent by:</strong> " + esc_(sentBy.name) + "</p>" +
    "<p style='color:#444; margin-top:0;'><strong>Date Sent:</strong> " + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') + "</p>" +
    formHtml +
    allItemsHtml +
    "<div style='margin-top:20px; padding:15px 20px; background:#fff3cd; border-radius:8px; display:flex; justify-content:space-between; align-items:center;'>" +
    "<span style='font-weight:bold; color:#664d03; font-size:16px;'>TOTAL ALL REQUESTS:</span>" +
    "<span style='font-weight:bold; color:#dc3545; font-size:18px;'>" + money_(superGrandTotal) + " THB</span>" +
    "</div>" +
    "<div style='text-align:center; margin-top:25px; padding:20px; background:#fefefe; border:2px dashed #ddd; border-radius:10px;'>" +
    "<p style='margin-top:0; font-size:15px; font-weight:bold; color:#222;'>Submit Specific Items Selection</p>" +
    "<p style='font-size:12px; color:#777; margin-bottom:15px;'>Review items above and click this button to apply partial selections.</p>" +
    "<button type='submit' style='padding:14px 35px; background:#111; color:#fff; border:none; border-radius:30px; font-weight:bold; font-size:14px; cursor:pointer;'>SUBMIT SELECTIONS</button>" +
    "</div></form>" +
    "</div>" +
    "<div style='padding:25px; text-align:center; background:#f8f9fa; border-top:1px solid #eee;'>" +
    "<p style='margin-top:0; font-size:14px; font-weight:bold; color:#444;'>OR QUICK ACTION FOR ALL ITEMS ABOVE</p>" +
    "<p style='margin-top:0; font-size:12px; color:#777;'>You will be asked to confirm on the next page before anything is saved.</p>" +
    "<a href=\"" + esc_(approveUrl) + "\" style=\"background:#28a745; color:#fff; padding:14px 35px; text-decoration:none; border-radius:30px; font-weight:bold; font-size:14px; margin:5px; display:inline-block;\">APPROVE ALL</a>" +
    "<a href=\"" + esc_(rejectUrl) + "\" style=\"background:#dc3545; color:#fff; padding:14px 35px; text-decoration:none; border-radius:30px; font-weight:bold; font-size:14px; margin:5px; display:inline-block;\">REJECT ALL</a>" +
    "</div></div>";

  var emailOptions = {
    to: targetEmails,
    subject: 'Action Required: Batch Approval Requests',
    htmlBody: htmlBody,
    name: sentBy.name + ' (Approval System)'
  };
  if (str_(sentBy.id).indexOf('@') > -1) emailOptions.replyTo = str_(sentBy.id);

  MailApp.sendEmail(emailOptions);
}