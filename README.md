# Approval System

ระบบขออนุมัติเอกสาร (Payment Voucher / Petty Cash / Billing Receipt) ใช้ Google Sheet "Approval" เป็นฐานข้อมูล

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `style.css`, `app.js` | หน้าเว็บ (Login, สร้าง/แก้ไขคำขอ, Dashboard, พิมพ์ PDF, Activity Log) |
| `apps-script/Code.gs` | Backend บน Google Apps Script (ผูกกับ Google Sheet "Approval") ไฟล์เดียว เหมือนกับที่ใช้งานจริง |

## การติดตั้ง / อัปเดต Backend
1. เปิด Google Sheet "Approval" > Extensions > Apps Script
2. ไฟล์ `Code.gs`: ลบโค้ดข้างในทั้งหมด แล้ววางโค้ดจาก `apps-script/Code.gs` แล้ว Save
3. Deploy > Manage deployments > แก้ไข deployment เดิม > Version: **New version** > Deploy
   (Execute as: Me, Who has access: Anyone) — URL จะเหมือนเดิม จึงไม่ต้องแก้ `SCRIPT_URL` ใน `app.js`
4. หน้าเว็บ (`index.html`, `style.css`, `app.js`) ขึ้นเว็บอัตโนมัติผ่าน GitHub Pages เมื่ออัปเดต branch `main`
   ทุกครั้งที่แก้ `app.js` หรือ `style.css` ให้เปลี่ยนเลข `?v=` ใน `index.html` ด้วย
   (GitHub Pages ให้เบราว์เซอร์จำไฟล์ไว้ 10 นาที ถ้าไม่เปลี่ยนเลข ผู้ใช้อาจได้ไฟล์เก่าปนไฟล์ใหม่และปุ่มใหม่จะกดไม่ทำงาน)
5. ถ้ามีการเปลี่ยน Backend ให้อัปเดต Backend ก่อน แล้วค่อยอัปเดตหน้าเว็บ

## ชีทที่ใช้
- **Approval** – รายการคำขอ (คอลัมน์ Z "Requestor Name" ถูกสร้างอัตโนมัติ)
- **Requestor Name** – รายชื่อสำหรับช่อง Requestor Name (คอลัมน์ A, แถวแรกเป็นหัวตาราง)
- **Users** – ผู้ใช้ (รหัสผ่านถูกเข้ารหัสอัตโนมัติหลัง login; รีเซ็ตรหัสได้โดยพิมพ์รหัสใหม่ทับในชีท)
- **Email** – กลุ่มผู้อนุมัติและอีเมล, **Email ACC** – อีเมล CC ตอนแจ้งผล
- **Dropdown**, **Companies**, **Vendor name** – ตัวเลือกในฟอร์ม
- **Activity Log** – ประวัติการใช้งาน (ระบบสร้างชีทนี้ให้อัตโนมัติเมื่อมีการใช้งานครั้งแรก)

## การอนุมัติ
- **ผ่านอีเมล:** ผู้อนุมัติกด APPROVE ALL / REJECT ALL หรือเลือกทีละรายการแล้วกด SUBMIT SELECTIONS
  ระบบจะเปิดหน้ายืนยันก่อน และบันทึกผลเมื่อกด **Confirm** เท่านั้น
- **ในระบบ:** เฉพาะผู้ใช้ Role = Admin กดปุ่ม Review ใน Dashboard
- **เซ็นเอกสาร (Manual):** ใน Dashboard ติ๊กเลือก Ref แล้วกด **Print PDF for Approval**
  ระบบเปลี่ยนสถานะเป็น `Pending (Manual) with <ผู้อนุมัติ>` แล้วเปิดหน้าพิมพ์ (เลือก Save as PDF หรือสั่งพิมพ์)
  เอกสารเป็นกระดาษ A4 แนวนอน **หน้าเดียว** รวมทุก Ref ที่เลือก แสดง Ref No., Description, Supplier, INV, Branch, Bank,
  Account No., จำนวนเงินของแต่ละรายการ, ยอดรวมทั้งหมด และช่องเซ็น **Approver** ช่องเดียว
  (ถ้ารายการเยอะ ระบบย่อขนาดตัวอักษรให้พอดีหน้าเดียวอัตโนมัติ, รายการที่ Rejected ไม่ถูกพิมพ์)
  เมื่อผู้อนุมัติเซ็นแล้ว ผู้ส่งคำขอ (หรือ Admin) กดปุ่ม **Approved** ที่แถวของ Ref นั้น เพื่อเปลี่ยนสถานะเป็น Completed
  (ปุ่มนี้แสดงเฉพาะ Ref ที่ผ่านการ Print PDF for Approval แล้ว และระบบส่งอีเมลแจ้งผลเหมือนการอนุมัติแบบอื่น)

## Activity Log (เฉพาะ Admin)
เมนู **Activity Log** แสดงประวัติล่าสุด 500 รายการ (ค้นหาและกรองตามประเภทได้):
Login, Register, Create / Edit Request, Send Approval Email, Print PDF for Approval,
Mark Approved (signed document), Review in system และ Approve / Reject by email

## การบันทึกคำขอ (กันรายการซ้ำ)
- ทุกครั้งที่กด Save หน้าเว็บส่งรหัสการบันทึก (`submitId`) ไปด้วย ถ้าคำขอเดิมถูกส่งซ้ำ (เช่น เน็ตหลุดแล้วกด Save อีกครั้ง)
  ระบบจะอัปเดต Ref เดิมแทนการสร้างรายการใหม่ซ้ำ
- ระบบบันทึกข้อมูลลงชีทให้เสร็จ (`SpreadsheetApp.flush()`) ก่อนปล่อยให้คำขอถัดไปทำงาน

## ความเร็ว
- ตัวเลือกใน Dropdown ถูกจำไว้ในเบราว์เซอร์และใน Apps Script (5 นาที) แก้ชีท Dropdown / Vendor / Email แล้วจะเห็นผลภายใน 5 นาที
- ข้อมูลผู้ใช้ที่ใช้ตรวจสิทธิ์ถูกจำไว้ 2 นาที (เปลี่ยนสถานะผู้ใช้ในชีท Users แล้วมีผลภายใน 2 นาที)
- Dashboard โหลดข้อมูลไว้ล่วงหน้าหลัง Login และหลังกด Send / Print / Approved / Review ระบบอัปเดตเฉพาะ Ref ที่เปลี่ยน
  โดยไม่ต้องโหลดข้อมูลทั้งหมดใหม่
