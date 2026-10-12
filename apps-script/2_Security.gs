// Approval System – 2_Security.gs (part of the Apps Script project, see 1_Config.gs)

// ======================================================================
// Security: password hashing, login tokens, signed email links
// ======================================================================

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

// Accepts hashed passwords and (for old accounts / passwords reset by hand in the sheet) plain text.
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

// Returns the logged-in user (fresh from the Users sheet) or null when the token is missing/invalid/expired.
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
  var found = findUserRow_(parts[0]);
  if (!found || str_(found.row[4]) !== 'Approved') return null;
  return userFromRow_(found.row);
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

// ======================================================================
// Lookups
// ======================================================================

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
