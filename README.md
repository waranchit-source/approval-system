# Approval System

ระบบขออนุมัติเอกสาร (Payment Voucher / Petty Cash / Billing Receipt) ใช้ Google Sheet "Approval" เป็นฐานข้อมูล

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `style.css`, `app.js` | หน้าเว็บ (Login, สร้าง/แก้ไขคำขอ, Dashboard, พิมพ์ PDF) |
| `apps-script/1_Config.gs` … `6_Emails.gs` | Backend บน Google Apps Script (ผูกกับ Google Sheet "Approval") แบ่งเป็น 6 ไฟล์ |

## การติดตั้ง / อัปเดต Backend
1. เปิด Google Sheet "Approval" > Extensions > Apps Script
2. ไฟล์ `Code.gs` เดิม: ลบโค้ดข้างในทั้งหมด แล้ววางโค้ดจาก `apps-script/1_Config.gs`
   จากนั้นกด **+ > Script** สร้างไฟล์ใหม่อีก 5 ไฟล์ แล้ววางโค้ดจาก `2_Security.gs`, `3_EmailApproval.gs`,
   `4_Api.gs`, `5_Dashboard.gs`, `6_Emails.gs` ไฟล์ละ 1 ไฟล์ แล้ว Save
3. Deploy > Manage deployments > แก้ไข deployment เดิม > Version: **New version** > Deploy
   (Execute as: Me, Who has access: Anyone) — URL จะเหมือนเดิม จึงไม่ต้องแก้ `SCRIPT_URL` ใน `app.js`
4. หน้าเว็บ (`index.html`, `style.css`, `app.js`) ขึ้นเว็บอัตโนมัติผ่าน GitHub Pages เมื่ออัปเดต branch `main`
   ทุกครั้งที่แก้ `app.js` หรือ `style.css` ให้เปลี่ยนเลข `?v=` ใน `index.html` ด้วย
   (GitHub Pages ให้เบราว์เซอร์จำไฟล์ไว้ 10 นาที ถ้าไม่เปลี่ยนเลข ผู้ใช้อาจได้ไฟล์เก่าปนไฟล์ใหม่และปุ่มใหม่จะกดไม่ทำงาน)

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
- **เซ็นเอกสาร (Manual):** ใน Dashboard ติ๊กเลือก Ref แล้วกด **Print PDF for Approval**
  ระบบเปลี่ยนสถานะเป็น `Pending (Manual) with <ผู้อนุมัติ>` แล้วเปิดหน้าพิมพ์ (เลือก Save as PDF หรือสั่งพิมพ์)
  เอกสารรวมทุก Ref ที่เลือก มียอดรวมทั้งหมด และมีช่องเซ็น **Approver** ช่องเดียวท้ายเอกสาร (รายการที่ Rejected ไม่ถูกพิมพ์)
  เมื่อผู้อนุมัติเซ็นแล้ว ผู้ส่งคำขอ (หรือ Admin) กดปุ่ม **Approved** ที่แถวของ Ref นั้น เพื่อเปลี่ยนสถานะเป็น Completed
  (ปุ่มนี้แสดงเฉพาะ Ref ที่ผ่านการ Print PDF for Approval แล้ว และระบบส่งอีเมลแจ้งผลเหมือนการอนุมัติแบบอื่น)

## การบันทึกคำขอ (กันรายการซ้ำ)
- ทุกครั้งที่กด Save หน้าเว็บส่งรหัสการบันทึก (`submitId`) ไปด้วย ถ้าคำขอเดิมถูกส่งซ้ำ (เช่น เน็ตหลุดแล้วกด Save อีกครั้ง)
  ระบบจะอัปเดต Ref เดิมแทนการสร้างรายการใหม่ซ้ำ
- ระบบบันทึกข้อมูลลงชีทให้เสร็จ (`SpreadsheetApp.flush()`) ก่อนปล่อยให้คำขอถัดไปทำงาน
