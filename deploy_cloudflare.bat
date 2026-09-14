@echo off
chcp 65001 >nul
title นำขึ้น Cloudflare Pages ฟรี - วุ่นวายโภชนา
echo =======================================================
echo    นำขึ้น Cloudflare Pages ฟรี (สำหรับลูกค้า 1 คน)
echo =======================================================
echo.
echo ขั้นตอน:
echo 1. หากยังไม่เคยล็อกอิน Cloudflare ให้ระบบเปิดหน้าล็อกอินเบราว์เซอร์
echo 2. อัปโหลดโฟลเดอร์ public ขึ้น Cloudflare Pages อัตโนมัติ
echo.
pause
echo กำลังเชื่อมต่อ Cloudflare...
cmd /c npx wrangler pages deploy public --project-name=wanwanwan
echo.
echo =======================================================
echo เสร็จสิ้น! คุณสามารถนำ URL (เช่น wanwanwan.pages.dev) ส่งให้ลูกค้าเปิดใช้งานได้ทันที
echo =======================================================
pause
