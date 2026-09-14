const axios = require('axios');
const db = require('./db');

class SheetsService {
  /**
   * Convert an order object to the exact Google Sheet row format
   * Columns:
   * [สถาณะ, ร้านค้า, เลขออเดอร์, รายการสินค้า, จำนวน, หน่วย, ซับ, '', ราคา/เส้น, ค่าขนส่ง, shopee/lazada, ยอดรวมจ่ายค่ายาง, ลิงก์สลิป]
   */
  formatOrderToRow(order, baseUrl = 'http://localhost:3838') {
    const slipFullUrl = order.slipUrl ? `${baseUrl}${order.slipUrl}` : '';
    return [
      order.status || 'รอสั่ง',
      order.storeName || '',
      `'${order.orderNumber}`.replace(/^'+/, "'"), // Prefix with apostrophe so Google Sheets treats order number as string, not exponential notation
      order.productName || '',
      Number(order.quantity) || 1,
      order.unit || 'เส้น',
      order.supplier || '',
      order.extraNote || '',
      Number(order.pricePerUnit) || 0,
      Number(order.shippingFee) || 0,
      order.platform || 'Shopee',
      Number(order.totalCost) || ((Number(order.quantity) || 1) * (Number(order.pricePerUnit) || 0) + (Number(order.shippingFee) || 0)),
      slipFullUrl
    ];
  }

  /**
   * Sync orders to Google Sheets via Webhook (Google Apps Script)
   */
  async syncToGoogleSheet(orderIds = null, baseUrl = 'http://localhost:3000') {
    const settings = db.getSettings();
    const webhookUrl = settings.googleSheetWebhook;

    if (!webhookUrl) {
      throw new Error('ยังไม่ได้ระบุ Webhook URL สำหรับ Google Sheets กรุณาตั้งค่าในเมนู ตั้งค่าระบบ');
    }

    let orders = db.getOrders();
    if (orderIds && orderIds.length > 0) {
      orders = orders.filter(o => orderIds.includes(o.id));
    }

    if (orders.length === 0) {
      return { success: true, count: 0, message: 'ไม่มีออเดอร์ให้ซิงก์' };
    }

    const rows = orders.map(o => this.formatOrderToRow(o, baseUrl));

    const payload = {
      action: 'syncOrders',
      sheetGid: '391311781',
      rows,
      rawOrders: orders
    };

    const response = await axios.post(webhookUrl, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    // Mark orders as synced
    const now = new Date().toISOString();
    orders.forEach(o => {
      o.syncedToSheet = true;
      o.syncedAt = now;
      db.upsertOrder(o);
    });

    return {
      success: true,
      count: orders.length,
      response: response.data
    };
  }

  /**
   * Export orders as UTF-8 BOM CSV formatted identically to user's Google Sheet
   */
  generateCsv(orders, baseUrl = 'http://localhost:3000') {
    const headers = [
      'สถาณะ',
      'ร้านค้า',
      'เลขออเดอร์',
      'รายการสินค้า',
      'จำนวน',
      'หน่วย',
      'ซับ',
      '',
      'ราคา/เส้น',
      'ค่าขนส่ง',
      'shopee/lazada',
      'ยอดรวมจ่ายค่ายาง',
      'สลิปโอนเงิน'
    ];

    const rows = orders.map(o => {
      const r = this.formatOrderToRow(o, baseUrl);
      return r.map(val => {
        const s = String(val ?? '').replace(/"/g, '""');
        return `"${s}"`;
      }).join(',');
    });

    // UTF-8 BOM (\uFEFF) ensures Thai characters open correctly in Excel
    return '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
  }

  /**
   * Ready-to-paste Google Apps Script code for the user
   */
  getAppsScriptTemplate() {
    return `/**
 * Google Apps Script Webhook สำหรับรับข้อมูลจาก Daily Tire Purchasing App
 * 1. เปิด Google Sheet ของคุณ
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. วางโค้ดนี้ลงไปแทนที่ของเดิมทั้งหมด
 * 4. กดปุ่ม "ทำให้ใช้งานได้" (Deploy) > "การทำให้ใช้งานได้ใหม่" (New Deployment)
 * 5. เลือกประเภท "เว็บแอป" (Web app)
 *    - ดำเนินการในฐานะ: ฉัน (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน (Anyone)
 * 6. คัดลอก "URL เว็บแอป" นำมาใส่ในช่อง Webhook URL ในหน้าตั้งค่าของ App
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    
    // ค้นหาแถวที่มีอยู่แล้วเพื่ออัปเดต หรือเพิ่มแถวใหม่
    var rows = data.rows || [];
    if (rows.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", count: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var lastRow = sheet.getLastRow();
    var existingOrderMap = {};
    
    // เก็บเลขออเดอร์ที่มีอยู่เดิม (คอลัมน์ C คือ index 3)
    if (lastRow >= 10) {
      var existingData = sheet.getRange(10, 3, lastRow - 9, 1).getValues();
      for (var i = 0; i < existingData.length; i++) {
        var ordNum = String(existingData[i][0]).replace(/^'/, '').trim();
        if (ordNum) {
          existingOrderMap[ordNum] = 10 + i;
        }
      }
    }
    
    var insertedCount = 0;
    var updatedCount = 0;
    
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      var orderNum = String(row[2]).replace(/^'/, '').trim();
      
      if (existingOrderMap[orderNum]) {
        // อัปเดตแถวเดิม
        var targetRowIndex = existingOrderMap[orderNum];
        sheet.getRange(targetRowIndex, 1, 1, row.length).setValues([row]);
        updatedCount++;
      } else {
        // เพิ่มแถวใหม่ต่อท้าย
        sheet.appendRow(row);
        insertedCount++;
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      inserted: insertedCount,
      updated: updatedCount,
      totalProcessed: rows.length
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
  }
}

module.exports = new SheetsService();
