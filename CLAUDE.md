# Approval System – notes for Claude

ระบบขออนุมัติเอกสาร (Payment Voucher / Petty Cash / Billing Receipt) ของ PaperPlane

## Where things live
- **Frontend:** this repo (`waranchit-source/approval-system`), `index.html` + `app.js` + `style.css`.
  Published by GitHub Pages from branch `main` → https://waranchit-source.github.io/approval-system/
  GitHub Pages sends `Cache-Control: max-age=600`: whenever app.js or style.css change, bump the `?v=` query in
  index.html, otherwise browsers can mix a new index.html with an old cached app.js (new buttons do nothing).
- **UI:** light white + blue theme (since 2026-10-28 (3)), tokens in `:root` of style.css (primary #2563EB, status colours,
  Plus Jakarta Sans + Noto Sans Thai), Bootstrap 5 only for grid/modal, Font Awesome 6 free icons. Dashboard = status tabs + search +
  bulk bar (Print PDF / Send email enabled only with a selection) + table that turns into cards under 768px
  (cells carry `data-label`). Messages use `showToast()`; confirmations still use `confirm()`.
  Batch "Print PDF for Approval" prints from a hidden iframe (`printHtmlInFrame`), not a pop-up window; the document is ONE
  A4 landscape page (#, Ref No., Description, Supplier, INV, Branch, Bank, Account No., Amount, grand total, one Approver box);
  an inline script shrinks it with CSS zoom to fit one page.
  Every select in the request form is wrapped by `enhanceSelect()` (type-to-filter list; the real <select> stays hidden for
  values/validation; its `value` setter is patched so programmatic changes update the visible text).
  Admin-only "Activity Log" page (`.admin-only` nav, `fetchActivityLog`/`renderActivityLog`).
  Speed: dropdown data cached in localStorage (`approvalDropdowns_v1`), dashboard prefetched after login and refreshed
  silently, actions merge the `requests` returned by the backend instead of reloading everything.
- **Backend:** Google Apps Script bound to the Google Sheet **"Approval"** (Apps Script project "Approval").
  The live project uses ONE file `Code.gs` (no comments); `apps-script/Code.gs` in this repo is that exact file
  (the old 6 split files were removed on 2026-10-28). Deploy the backend BEFORE merging frontend changes that need it.
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
`getRequests`, `batchSendRequest`, `resendRequest`, `systemPartialApprove` (Admin), `notifyDecision` (Admin or sender),
`printBatchRequest` (selected REQs → Pending (Manual)), `manualApprove` (sender/Admin: Pending (Manual) → Completed,
accepts `deferNotify`), `getActivityLog` (Admin, latest 500 rows of sheet "Activity Log").
`batchSendRequest`, `printBatchRequest`, `manualApprove`, `systemPartialApprove` return `requests` (the changed REQs in the
same shape as `getRequests`). `notifyDecision` is allowed for Admin or the request's sender.
Caches (CacheService): dropdowns 5 min (`?action=getDropdowns&refresh=1` bypasses), auth user 2 min, submitId 6 h.
Every action is written to sheet "Activity Log" via `logActivity_` (failures never break the action).

## History
- 2026-10-28: fixed duplicated items after Save (idempotent `submitId`, `SpreadsheetApp.flush()` before releasing
  the lock, block row deletion on edit); added "Print PDF for Approval" (one Approver signature box at the end of
  the document, no approver group name printed) and the "Approved" button for manually signed requests.
- 2026-10-28 (2): "Print PDF for Approval did nothing" was a stale cached app.js after deploy → added `?v=` cache
  busting and switched batch printing to a hidden iframe. Full UI/UX redesign (all element IDs kept).
- 2026-10-28 (3): one-page landscape approval PDF with chosen columns, searchable dropdowns in the request form,
  white + blue theme, Admin Activity Log, speed (caches, prefetch, fewer round trips, deferred notification email).
