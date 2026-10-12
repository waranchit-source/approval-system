// Approval System – 6_Emails.gs (part of the Apps Script project, see 1_Config.gs)

// ======================================================================
// Emails
// ======================================================================

function sendDetailedNotificationEmail(reqNo, senderName) {
  try {
    var sheet = getApprovalSheet_();
    var data = sheet.getDataRange().getValues();
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
