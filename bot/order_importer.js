const db = require('../services/db');

class OrderImporter {
  /**
   * Parse exported CSV from BigSeller
   */
  importCsvContent(content) {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return { success: false, count: 0, message: 'ไฟล์ไม่มีข้อมูล' };

    const headerLine = lines[0].toLowerCase();
    const rows = lines.slice(1);
    const importedOrders = [];

    // Identify column indexes based on header names
    const headers = this.parseCsvLine(lines[0]);
    let orderNumIdx = headers.findIndex(h => /order|sn|เลขออเดอร์|订单/i.test(h));
    let storeIdx = headers.findIndex(h => /store|shop|ร้านค้า|店铺/i.test(h));
    let productIdx = headers.findIndex(h => /item|product|goods|title|ชื่อสินค้า|รายการ/i.test(h));
    let qtyIdx = headers.findIndex(h => /qty|quantity|จำนวน|数量/i.test(h));
    let platformIdx = headers.findIndex(h => /platform|channel|ช่องทาง/i.test(h));

    // Fallbacks if header names are slightly different
    if (orderNumIdx === -1) orderNumIdx = 0;
    if (storeIdx === -1) storeIdx = 1;
    if (productIdx === -1) productIdx = 3;
    if (qtyIdx === -1) qtyIdx = 4;

    const todayStr = new Date().toISOString().split('T')[0];

    for (const rowLine of rows) {
      const cols = this.parseCsvLine(rowLine);
      if (cols.length <= 1) continue;

      const orderNumber = (cols[orderNumIdx] || '').replace(/['"]/g, '').trim();
      const storeName = (cols[storeIdx] || '').trim();
      const productName = (cols[productIdx] || '').trim();
      const quantity = parseInt(cols[qtyIdx], 10) || 1;
      let platform = 'Shopee';
      if (platformIdx >= 0 && cols[platformIdx]) {
        platform = cols[platformIdx].trim();
      } else if (/lazada/i.test(storeName) || /lazada/i.test(productName)) {
        platform = 'Lazada';
      }

      if (orderNumber || productName) {
        const orderRecord = db.upsertOrder({
          orderNumber: orderNumber || `ORD-${Date.now()}`,
          storeName: storeName || (platform === 'Lazada' ? 'หลงฉื่อ กรุ๊ป Lazada' : 'Long Chi GROUP JACK Shopee'),
          platform,
          productName: productName || 'ยางรถยนต์',
          quantity,
          unit: 'เส้น',
          cutoffDate: todayStr,
          status: 'รอสั่ง'
        });
        importedOrders.push(orderRecord);
      }
    }

    return {
      success: true,
      count: importedOrders.length,
      orders: importedOrders
    };
  }

  parseCsvLine(text) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  }
}

module.exports = new OrderImporter();
