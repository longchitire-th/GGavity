const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const db = require('../services/db');

const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'user_data');
const BIGSELLER_ORDER_URL = 'https://www.bigseller.com/web/order/index.htm?status=new';

// Ensure user data directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

class BigSellerBot {
  constructor() {
    this.isScraping = false;
    this.lastScrapedAt = null;
    this.lastError = null;
    this.isLoggedIn = false;
  }

  /**
   * Helper: calculate cutoff date & time range
   * Range: 12:00 PM yesterday -> 08:00 AM today
   */
  getCutoffRange(targetDate = new Date()) {
    const todayStr = targetDate.toISOString().split('T')[0];
    
    // Yesterday 12:00:00
    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);

    // Today 08:00:00
    const todayMorning = new Date(targetDate);
    todayMorning.setHours(8, 0, 0, 0);

    return {
      cutoffDate: todayStr,
      startTime: yesterday,
      endTime: todayMorning
    };
  }

  /**
   * Check if an order timestamp falls within the cutoff window
   */
  isWithinCutoff(orderTimeStr, targetDate = new Date()) {
    if (!orderTimeStr) return true; // If time not specified, include by default
    try {
      const orderDate = new Date(orderTimeStr);
      if (isNaN(orderDate.getTime())) return true;
      const { startTime, endTime } = this.getCutoffRange(targetDate);
      return orderDate >= startTime && orderDate <= endTime;
    } catch {
      return true;
    }
  }

  /**
   * Open interactive browser for the user to log in to BigSeller
   */
  async openInteractiveLogin() {
    console.log('[BigSellerBot] Launching interactive browser for user login...');
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page.goto(BIGSELLER_ORDER_URL, { waitUntil: 'domcontentloaded' });

    console.log('[BigSellerBot] Waiting for user to complete login in the opened browser window...');
    
    // Return a promise that resolves when user logs in or closes
    return {
      message: 'เปิดหน้าต่างเบราว์เซอร์ BigSeller แล้ว กรุณาล็อกอินให้เรียบร้อยในหน้าต่างที่ปรากฏขึ้น จากนั้นสามารถปิดหน้าต่างหรือกดดึงข้อมูลได้ทันที',
      success: true
    };
  }

  /**
   * Check login status by checking cookies or visiting page headlessly
   */
  async checkLoginStatus() {
    try {
      const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
      });
      const page = await context.newPage();
      await page.goto(BIGSELLER_ORDER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      const currentUrl = page.url();
      const isLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/signin');
      this.isLoggedIn = isLoggedIn;
      await context.close();
      return isLoggedIn;
    } catch (err) {
      console.warn('[BigSellerBot] Check login status failed:', err.message);
      return false;
    }
  }

  /**
   * Fetch new orders from BigSeller
   */
  async fetchOrders(options = {}) {
    if (this.isScraping) {
      throw new Error('ระบบกำลังดึงข้อมูลอยู่แล้ว กรุณารอสักครู่...');
    }

    this.isScraping = true;
    this.lastError = null;
    const extractedOrders = [];

    try {
      console.log('[BigSellerBot] Starting order extraction from BigSeller...');
      const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: options.headless !== false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });

      const page = await context.newPage();
      page.setDefaultTimeout(30000);

      // Listen to BigSeller internal API responses if present
      page.on('response', async (res) => {
        try {
          const url = res.url();
          if (url.includes('/order/') && (url.includes('query') || url.includes('list') || url.includes('page'))) {
            const json = await res.json().catch(() => null);
            if (json && (json.data || json.rows || json.list)) {
              console.log('[BigSellerBot] Intercepted internal BigSeller order API response!');
            }
          }
        } catch {}
      });

      await page.goto(BIGSELLER_ORDER_URL, { waitUntil: 'networkidle', timeout: 40000 });

      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
        this.isLoggedIn = false;
        await context.close();
        throw new Error('ยังไม่ได้เข้าสู่ระบบ BigSeller กรุณากดปุ่ม "เข้าสู่ระบบ BigSeller ครั้งแรก" เพื่อล็อกอิน');
      }

      this.isLoggedIn = true;

      // Wait for order table or container
      await page.waitForTimeout(3000);

      // Extract orders from DOM
      const scrapedData = await page.evaluate(() => {
        const results = [];

        // Method 1: Look for table rows or order cards
        const orderRows = document.querySelectorAll('tr.el-table__row, .order-item, .order-table-row, [class*="order-row"]');
        
        if (orderRows.length > 0) {
          orderRows.forEach(row => {
            const text = row.innerText || '';
            const orderNumMatch = text.match(/(?:เลขออเดอร์|Order No|SN|Order ID)?[:\s]*([0-9A-Za-z]{12,25})/i);
            const orderNum = orderNumMatch ? orderNumMatch[1] : '';

            // Detect platform
            let platform = 'Shopee';
            if (/lazada/i.test(text)) platform = 'Lazada';
            else if (/tiktok/i.test(text)) platform = 'TikTok';

            // Find store name
            let storeName = '';
            const storeEl = row.querySelector('[class*="shop"], [class*="store"], .shop-name');
            if (storeEl) storeName = storeEl.innerText.trim();

            // Find product title & variation
            const productEl = row.querySelector('[class*="product-name"], [class*="goods-name"], .product-title');
            const productName = productEl ? productEl.innerText.trim() : '';

            // Find quantity
            const qtyMatch = text.match(/(?:จำนวน|Qty|x|X)\s*[:\s]*(\d+)/i);
            const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

            if (orderNum || productName) {
              results.push({
                orderNumber: orderNum,
                storeName: storeName || (platform === 'Lazada' ? 'หลงฉื่อ กรุ๊ป Lazada' : 'Long Chi GROUP JACK Shopee'),
                platform,
                productName: productName || text.slice(0, 80),
                quantity,
                unit: 'เส้น'
              });
            }
          });
        }

        return results;
      });

      console.log(`[BigSellerBot] Scraped ${scrapedData.length} order items from page`);

      await context.close();

      // If page had orders, insert them into DB
      const { cutoffDate } = this.getCutoffRange();
      for (const item of scrapedData) {
        if (item.productName) {
          const saved = db.upsertOrder({
            ...item,
            cutoffDate,
            status: 'รอสั่ง'
          });
          extractedOrders.push(saved);
        }
      }

      this.lastScrapedAt = new Date().toISOString();
      return {
        success: true,
        count: extractedOrders.length,
        orders: extractedOrders
      };

    } catch (err) {
      console.error('[BigSellerBot] Error fetching orders:', err);
      this.lastError = err.message;
      throw err;
    } finally {
      this.isScraping = false;
    }
  }

  /**
   * Seed sample orders matching the user's Google Sheet template
   * Useful for testing and immediate demonstration
   */
  seedSampleOrders() {
    const { cutoffDate } = this.getCutoffRange();
    const samples = [
      {
        orderNumber: '1118781023321746',
        storeName: 'หลงฉื่อ กรุ๊ป Lazada',
        platform: 'Lazada',
        productName: 'ยาง 215/45R17 KUMHO รุ่น ECSTA PS31 ราคาต่อเส้น ปี 2025',
        quantity: 1,
        unit: 'เส้น',
        status: 'สั่งแล้ว (ส่งได้)',
        supplier: 'เจริญโชคไทร์การยาง',
        pricePerUnit: 1450,
        shippingFee: 50,
        totalCost: 1500,
        cutoffDate,
        orderTime: new Date(Date.now() - 3600000 * 5).toISOString(),
        extraNote: 'ซับมีของพร้อมส่ง'
      },
      {
        orderNumber: '2609142H7604TV',
        storeName: 'Long Chi GROUP JACK Shopee',
        platform: 'Shopee',
        productName: 'ยาง 235/65R17 KUMHO รุ่น ROAD VENTURE AT52 ราคาต่อเส้น ปี 2026',
        quantity: 1,
        unit: 'เส้น',
        status: 'รอสั่ง',
        supplier: 'เอกชัยซัพพลายยางยนต์',
        pricePerUnit: 2950,
        shippingFee: 100,
        totalCost: 3050,
        cutoffDate,
        orderTime: new Date(Date.now() - 3600000 * 3).toISOString(),
        extraNote: ''
      },
      {
        orderNumber: '2609149J8811AA',
        storeName: 'Long Chi GROUP JACK Shopee',
        platform: 'Shopee',
        productName: 'ยาง 195/65R15 BRIDGESTONE รุ่น ECOPIA EP150 ราคาต่อเส้น ปี 2025',
        quantity: 2,
        unit: 'เส้น',
        status: 'รอสั่ง',
        supplier: 'สยามยางไทยกรุ๊ป',
        pricePerUnit: 1850,
        shippingFee: 80,
        totalCost: 3780,
        cutoffDate,
        orderTime: new Date(Date.now() - 3600000 * 2).toISOString(),
        extraNote: 'สั่ง 2 เส้น'
      },
      {
        orderNumber: '1119284910294811',
        storeName: 'หลงฉื่อ กรุ๊ป Lazada',
        platform: 'Lazada',
        productName: 'ยาง 265/65R17 MICHELIN รุ่น PRIMACY SUV+ ราคาต่อเส้น ปี 2025',
        quantity: 1,
        unit: 'เส้น',
        status: 'สินค้าขาดตลาด (ส่งไม่ได้)',
        supplier: 'เจริญโชคไทร์การยาง',
        pricePerUnit: 4900,
        shippingFee: 100,
        totalCost: 5000,
        cutoffDate,
        orderTime: new Date(Date.now() - 3600000 * 8).toISOString(),
        extraNote: 'ซับแจ้งของหมดชั่วคราว ขาดตลาด'
      }
    ];

    const savedList = [];
    for (const s of samples) {
      savedList.push(db.upsertOrder(s));
    }
    return savedList;
  }
}

module.exports = new BigSellerBot();
