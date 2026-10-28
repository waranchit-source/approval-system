/**
 * Approval System – Google Apps Script backend
 *
 * โค้ดแบ่งเป็น 6 ไฟล์ (ทุกไฟล์ทำงานร่วมกันเป็นโปรเจกต์เดียว)
 *   1_Config.gs  2_Security.gs  3_EmailApproval.gs  4_Api.gs  5_Dashboard.gs  6_Emails.gs
 *
 * วิธีติดตั้ง
 * 1) เปิด Google Sheet "Approval" > Extensions > Apps Script
 * 2) ไฟล์ Code.gs เดิม: ลบโค้ดข้างในทั้งหมด แล้ววางไฟล์ 1_Config.gs แทน (จะเปลี่ยนชื่อไฟล์หรือไม่ก็ได้)
 * 3) กด + (Add a file) > Script แล้วสร้างไฟล์ที่เหลือทีละไฟล์ (2 ถึง 6) วางโค้ดของแต่ละไฟล์ให้ครบ
 *    (ถ้าเคยเพิ่มไฟล์ RequestorName.gs ไว้ ให้ลบทิ้ง)
 * 4) กด Save แล้ว Deploy > Manage deployments > แก้ไข deployment เดิม > Version: New version > Deploy
 * 5) ผู้ใช้ทุกคนต้อง Login ใหม่ 1 ครั้ง และคำขอที่ยัง Pending อยู่ให้กด "Send Approval Email" ใหม่
 *
 * การอนุมัติผ่านอีเมล: ลิงก์ APPROVE ALL / REJECT ALL และปุ่ม SUBMIT SELECTIONS จะเปิด "หน้ายืนยัน" ก่อน
 * ระบบจะบันทึกผลเมื่อผู้อนุมัติกดปุ่ม Confirm บนหน้านั้นเท่านั้น
 *
 * โครงสร้างชีท Approval (คอลัมน์ Z "Requestor Name" ถูกสร้างอัตโนมัติ)
 * A Request Date | B No. | C Description | D Amount | E VAT | F WHT | G Total | H Product Photo | I Image URL
 * J Invoice No. | K Branch | L Department | M Remarks | N Payment Method | O Bank | P Account Name | Q Account No.
 * R Status | S Requested By (Senders) | T Approved By | U Approval Date | V Document Type | W Payment Date
 * X Company Name | Y Supplier Name | Z Requestor Name
 */

var SHEET_APPROVAL = 'Approval';
var SHEET_USERS = 'Users';
var SHEET_DROPDOWN = 'Dropdown';
var SHEET_EMAIL = 'Email';
var SHEET_EMAIL_CC = 'Email ACC';
var SHEET_COMPANIES = 'Companies';
var SHEET_VENDORS = 'Vendor name';
var SHEET_REQUESTORS = 'Requestor Name';

var COL = {
  DATE: 0, REQ_NO: 1, DESC: 2, AMOUNT: 3, VAT: 4, WHT: 5, TOTAL: 6, PHOTO: 7, IMAGE_URL: 8,
  INVOICE: 9, BRANCH: 10, DEPT: 11, REMARKS: 12, PAY_METHOD: 13, BANK: 14, ACC_NAME: 15, ACC_NO: 16,
  STATUS: 17, SENDER: 18, APPROVER: 19, APPROVAL_DATE: 20, DOC_TYPE: 21, PAY_DATE: 22,
  COMPANY: 23, SUPPLIER: 24, REQUESTOR_NAME: 25
};
var NUM_COLS = 26;
var REQUESTOR_NAME_HEADER = 'Requestor Name';

var DEFAULT_APPROVER = 'admin@paperplanebkk.com';
var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // login lasts 30 days
var PASSWORD_ITERATIONS = 500;
var MAX_FILE_BASE64_LENGTH = 7 * 1024 * 1024; // about 5MB of file data
var MANUAL_PENDING = 'Pending (Manual)';
var SUBMIT_CACHE_SECONDS = 21600;

function setupDrivePermission() {
  var file = DriveApp.createFile("test_permission_approval_system.txt", "Test");
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  file.setTrashed(true);
  var email = Session.getActiveUser().getEmail();
  MailApp.sendEmail(email, "System Auth Check", "Authorization Successful.");
}

// ======================================================================
// Helpers
// ======================================================================

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

// Text typed by users is stored as plain text: never run as a formula, keep leading zeros.
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

// Payment dates come back from the sheet as Date objects; send them to the web page as "yyyy-MM-dd".
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

// Writes approve/reject results. Rows next to each other are written together
// (2 sheet calls per block of rows instead of 2 calls per item).
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
