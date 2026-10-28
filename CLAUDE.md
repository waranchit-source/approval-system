# Approval System – notes for Claude

ระบบขออนุมัติเอกสาร (Payment Voucher / Petty Cash / Billing Receipt) ของ PaperPlane

## Where things live
- **Frontend:** this repo (`waranchit-source/approval-system`), `index.html` + `app.js` + `style.css`.
  Published by GitHub Pages from branch `main` → https://waranchit-source.github.io/approval-system/
- **Backend:** Google Apps Script bound to the Google Sheet **"Approval"** (Apps Script project "Approval").
  The live project uses ONE file `Code.gs` (no comments). This repo keeps the same code split into
  `apps-script/1_Config.gs … 6_Emails.gs` (with comments). Keep both in sync: the logic must be identical.
  Deploy = paste code → Save → Deploy > Manage deployments > edit > New version (URL stays the same).
- Local working folder on the owner's PC: `C:\Bie\Approval` (copy of the frontend + `Code.gs\Code.gs`).

## Owner's rules (follow strictly)
- Change only what was asked; if another part must change, say exactly what changed.
- Test before delivering (backend in Node with mocked Apps Script services, frontend in a browser with a mocked fetch).
- Deliver full files, no shortened code, and do not add explanatory comments to the code.
- Explain any manual steps the owner must do (e.g. paste Code.gs and deploy a new version).
- Ask before touching sensitive data (e.g. reading the Approval sheet, which has bank account numbers).

## Data model (sheet "Approval", one row per item, grouped by REQ number)
A Date | B REQ-xxxx | C Description | D Amount | E VAT | F WHT | G Total | H File URL | I Image URL | J Invoice |
K Branch | L Dept | M Remarks | N Pay method | O Bank | P Acc name | Q Acc no | R Status | S Sender | T Approver |
U Approval date | V Doc type | W Pay date | X Company | Y Supplier | Z Requestor Name

Item status values: `Draft` → `Pending with <group>` (email sent) or `Pending (Manual) with <group>` (printed for
signature) → `Completed` / `Rejected`. Anything containing "Pending" counts as pending.

## API actions (doPost, all except login/register need the login token)
`submitRequest` (accepts `submitId` – repeated submits of the same form update the same REQ instead of duplicating),
`getRequests`, `batchSendRequest`, `resendRequest`, `systemPartialApprove` (Admin), `notifyDecision` (Admin),
`printBatchRequest` (selected REQs → Pending (Manual)), `manualApprove` (sender/Admin: Pending (Manual) → Completed).

## History
- 2026-10-28: fixed duplicated items after Save (idempotent `submitId`, `SpreadsheetApp.flush()` before releasing
  the lock, block row deletion on edit); added "Print PDF for Approval" (one Approver signature box at the end of
  the document, no approver group name printed) and the "Approved" button for manually signed requests.
