const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../services/db');

class OrderImporter {
  /**
   * Import from file path (supports .csv, .xlsx, .xls)
   */
  importFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let matrix = [];

    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      matrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    } else {
      // For CSV or text: read with UTF-8 first to preserve Thai characters
      const content = fs.readFileSync(filePath, 'utf8');
      const workbook = xlsx.read(content, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      matrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    }

    return this.importMatrix(matrix);
  }

  /**
   * Parse exported CSV string
   */
  importCsvContent(content) {
    const workbook = xlsx.read(content, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    return this.importMatrix(matrix);
  }

  importMatrix(matrix) {
    if (!matrix || matrix.length < 2) {
      return { success: false, count: 0, message: 'ไฟล์ไม่มีข้อมูลคำสั่งซื้อ' };
    }

    const headers = (matrix[0] || []).map(h => String(h || '').trim());
    const rows = matrix.slice(1);

    // Identify exact column indexes based on BigSeller header names
    let orderNumIdx = headers.findIndex(h => /หมายเลขคำสั่งซื้อ|เลขออเดอร์|เลขที่คำสั่งซื้อ|order\s*no|order\s*id|sn|订单/i.test(h));
    let platformIdx = headers.findIndex(h => /^แพลตฟอร์ม$|platform|channel|ช่องทาง/i.test(h));
    let storeIdx = headers.findIndex(h => /ร้านค้า\s*เพลตฟอร์ม|ร้านค้า\s*BigSeller|ร้านค้า|store|shop|店铺/i.test(h));
    let productIdx = headers.findIndex(h => /^ชื่อสินค้า$|ชื่อ\s*สินค้า|product\s*name|item\s*name|รายการสินค้า/i.test(h));
    let skuIdx = headers.findIndex(h => /^sku$/i.test(h));
    let qtyIdx = headers.findIndex(h => /^จำนวน$|quantity|qty|数量/i.test(h));
    let timeIdx = headers.findIndex(h => /เวลาสั่งซื้อ|เวลาที่สั่งซื้อ|order\s*time/i.test(h));
    let shippingIdx = headers.findIndex(h => /^ค่าจัดส่ง$|shipping\s*fee/i.test(h));

    // Fallbacks
    if (orderNumIdx === -1) orderNumIdx = 0;
    if (productIdx === -1) productIdx = skuIdx >= 0 ? skuIdx : 27;
    if (qtyIdx === -1) qtyIdx = 32;

    const todayStr = new Date().toISOString().split('T')[0];
    const importedOrders = [];

    for (const cols of rows) {
      if (!cols || cols.length === 0) continue;

      const orderNumber = String(cols[orderNumIdx] || '').replace(/['"]/g, '').trim();
      const rawProduct = (productIdx >= 0 && cols[productIdx]) ? String(cols[productIdx]).trim() : '';
      const rawSku = (skuIdx >= 0 && cols[skuIdx]) ? String(cols[skuIdx]).trim() : '';
      const productName = rawProduct || rawSku || 'ยางรถยนต์';

      if (!orderNumber && !productName) continue;

      // Platform detection
      let platform = 'Shopee';
      if (platformIdx >= 0 && cols[platformIdx]) {
        const platText = String(cols[platformIdx]).trim();
        if (/lazada/i.test(platText)) platform = 'Lazada';
        else if (/shopee/i.test(platText)) platform = 'Shopee';
        else if (/tiktok/i.test(platText)) platform = 'TikTok';
        else platform = platText;
      } else if (orderNumber.length >= 15 || /^\d{16}$/.test(orderNumber)) {
        // Lazada order numbers are typically 16 digits
        platform = 'Lazada';
      }

      // Store name
      let storeName = (storeIdx >= 0 && cols[storeIdx]) ? String(cols[storeIdx]).trim() : '';
      if (!storeName) {
        storeName = platform === 'Lazada' ? 'หลงฉื่อ กรุ๊ป' : 'Long Chi GROUP';
      }

      // Quantity
      let quantity = 1;
      if (qtyIdx >= 0 && cols[qtyIdx] !== undefined) {
        quantity = parseInt(String(cols[qtyIdx]).replace(/[^\d]/g, ''), 10) || 1;
      }

      // Order time
      const orderTimeRaw = (timeIdx >= 0 && cols[timeIdx]) ? String(cols[timeIdx]).trim() : '';

      const orderRecord = db.upsertOrder({
        orderNumber: orderNumber || `ORD-${Date.now()}`,
        storeName,
        platform,
        productName,
        quantity,
        unit: 'เส้น',
        cutoffDate: todayStr,
        status: 'รอสั่ง',
        extraNote: orderTimeRaw ? `เวลาสั่งซื้อ: ${orderTimeRaw}` : ''
      });

      importedOrders.push(orderRecord);
    }

    console.log(`[OrderImporter] Successfully processed ${importedOrders.length} orders from BigSeller file`);

    return {
      success: true,
      count: importedOrders.length,
      orders: importedOrders
    };
  }
}

module.exports = new OrderImporter();
