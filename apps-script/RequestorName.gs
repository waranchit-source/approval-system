/**
 * Requestor Name support for the Approval System backend (Google Apps Script).
 *
 * วิธีติดตั้ง (ทำครั้งเดียว)
 * 1) เปิด Google Sheet "Approval" > Extensions > Apps Script
 * 2) กด + (Add a file) > Script ตั้งชื่อ RequestorName แล้ววางโค้ดทั้งไฟล์นี้ลงไป
 * 3) แก้ไฟล์ Code.gs เดิม 3 จุด:
 *
 *    (ก) ใน action 'getDropdowns' (ใน doGet) — เพิ่ม requestorNames ลงใน object ที่ส่งกลับ
 *          requestorNames: getRequestorNames_(),
 *
 *    (ข) ใน action 'submitRequest' (ใน doPost) — หลังบันทึกแถวลงชีทเสร็จ ก่อน return success
 *          saveRequestorName_(reqNo, data.requestorName);
 *        (reqNo = ตัวแปรเลข REQ-xxxx ที่ส่งกลับไปให้หน้าเว็บ ทั้งกรณีสร้างใหม่และกรณีแก้ไข data.editReqNo)
 *
 *    (ค) ใน action 'getRequests' (ใน doPost) — ก่อน return ข้อมูล
 *          attachRequestorNames_(requests);
 *        (requests = array ที่ส่งกลับใน field data)
 *
 * 4) Deploy > Manage deployments > แก้ไข deployment เดิม > Version: New version > Deploy
 *    (ต้องแก้ deployment เดิม URL จึงจะเหมือนเดิม ไม่ต้องแก้ SCRIPT_URL ใน app.js)
 *
 * หมายเหตุ
 * - คอลัมน์ "Requested By" เดิมยังเก็บชื่อผู้ใช้ที่ล็อกอิน (แสดงเป็น "Senders" บนหน้าเว็บ)
 * - คอลัมน์ "Requestor Name" ใหม่จะถูกสร้างต่อท้ายชีท Approval อัตโนมัติ (คอลัมน์ Z) เมื่อบันทึกครั้งแรก
 * - หน้าเว็บยังทำงานได้แม้ยังไม่ได้แก้ backend (แค่ dropdown จะว่างและชื่อจะไม่ถูกบันทึก)
 */

var RN_SPREADSHEET_SHEET_REQUESTORS = 'Requestor Name';
var RN_SPREADSHEET_SHEET_APPROVAL = 'Approval';
var RN_COLUMN_HEADER = 'Requestor Name';
var RN_REQNO_COLUMN = 2; // Column B "No."

/** Names from sheet "Requestor Name" column A (row 1 = header), trimmed and de-duplicated. */
function getRequestorNames_() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RN_SPREADSHEET_SHEET_REQUESTORS);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    var seen = {};
    var names = [];
    values.forEach(function (row) {
      var name = String(row[0]).replace(/\s+/g, ' ').trim();
      var key = name.toLowerCase();
      if (name && !seen[key]) {
        seen[key] = true;
        names.push(name);
      }
    });
    return names;
  } catch (err) {
    console.error('getRequestorNames_ failed: ' + err);
    return [];
  }
}

/** Column number of the "Requestor Name" header in the Approval sheet; creates it when missing. */
function getRequestorNameColumn_(sheet, createIfMissing) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === RN_COLUMN_HEADER) return i + 1;
  }
  if (!createIfMissing) return 0;
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(RN_COLUMN_HEADER);
  return newCol;
}

/** Writes the requestor name on every item row of the given request number. */
function saveRequestorName_(reqNo, requestorName) {
  if (!reqNo) return;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RN_SPREADSHEET_SHEET_APPROVAL);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var col = getRequestorNameColumn_(sheet, true);
    var name = String(requestorName || '').replace(/\s+/g, ' ').trim();
    // Prevent the text from being run as a spreadsheet formula
    if (/^[=+\-@]/.test(name)) name = "'" + name;

    var reqNos = sheet.getRange(2, RN_REQNO_COLUMN, lastRow - 1, 1).getDisplayValues();
    var range = sheet.getRange(2, col, lastRow - 1, 1);
    var current = range.getValues();
    var target = String(reqNo).trim();
    var changed = false;
    for (var i = 0; i < reqNos.length; i++) {
      if (String(reqNos[i][0]).trim() === target) {
        current[i][0] = name;
        changed = true;
      }
    }
    if (changed) range.setValues(current);
  } catch (err) {
    console.error('saveRequestorName_ failed: ' + err);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Adds requestorName to each request object returned by getRequests (matched by reqNo). */
function attachRequestorNames_(requests) {
  if (!requests || !requests.length) return requests;
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RN_SPREADSHEET_SHEET_APPROVAL);
    var col = sheet ? getRequestorNameColumn_(sheet, false) : 0;
    var map = {};
    if (col && sheet.getLastRow() >= 2) {
      var rows = sheet.getLastRow() - 1;
      var reqNos = sheet.getRange(2, RN_REQNO_COLUMN, rows, 1).getDisplayValues();
      var names = sheet.getRange(2, col, rows, 1).getDisplayValues();
      for (var i = 0; i < rows; i++) {
        var key = String(reqNos[i][0]).trim();
        var name = String(names[i][0]).trim();
        if (key && name && !map[key]) map[key] = name;
      }
    }
    requests.forEach(function (req) {
      if (req) req.requestorName = map[String(req.reqNo).trim()] || req.requestorName || '';
    });
  } catch (err) {
    console.error('attachRequestorNames_ failed: ' + err);
  }
  return requests;
}
