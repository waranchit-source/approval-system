# Approval System

ระบบขออนุมัติเอกสาร (Payment Voucher / Petty Cash / Billing Receipt) ใช้ Google Sheet "Approval" เป็นฐานข้อมูล

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `style.css`, `app.js` | หน้าเว็บ (Login, สร้าง/แก้ไขคำขอ, Dashboard, พิมพ์ PDF) |
| `apps-script/Code.gs` | Backend บน Google Apps Script (ผูกกับ Google Sheet "Approval") |

## การติดตั้ง / อัปเดต Backend
1. เปิด Google Sheet "Approval" > Extensions > Apps Script
2. วางโค้ดจาก `apps-script/Code.gs` ทับไฟล์ `Code.gs` เดิมทั้งหมด แล้ว Save
3. Deploy > Manage deployments > แก้ไข deployment เดิม > Version: **New version** > Deploy
   (Execute as: Me, Who has access: Anyone) — URL จะเหมือนเดิม จึงไม่ต้องแก้ `SCRIPT_URL` ใน `app.js`
4. อัปโหลดไฟล์หน้าเว็บ (`index.html`, `style.css`, `app.js`) ชุดใหม่พร้อมกัน

## ชีทที่ใช้
- **Approval** – รายการคำขอ (คอลัมน์ Z "Requestor Name" ถูกสร้างอัตโนมัติ)
- **Requestor Name** – รายชื่อสำหรับช่อง Requestor Name (คอลัมน์ A, แถวแรกเป็นหัวตาราง)
- **Users** – ผู้ใช้ (รหัสผ่านถูกเข้ารหัสอัตโนมัติหลัง login; รีเซ็ตรหัสได้โดยพิมพ์รหัสใหม่ทับในชีท)
- **Email** – กลุ่มผู้อนุมัติและอีเมล, **Email ACC** – อีเมล CC ตอนแจ้งผล
- **Dropdown**, **Companies**, **Vendor name** – ตัวเลือกในฟอร์ม

## การอนุมัติ
- **ผ่านอีเมล:** ผู้อนุมัติกด APPROVE ALL / REJECT ALL หรือเลือกทีละรายการแล้วกด SUBMIT SELECTIONS
  ระบบจะเปิดหน้ายืนยันก่อน และบันทึกผลเมื่อกด **Confirm** เท่านั้น
- **ในระบบ:** เฉพาะผู้ใช้ Role = Admin กดปุ่ม Review ใน Dashboard
