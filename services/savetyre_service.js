const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SAVETYRE_SESSION_DIR = path.join(__dirname, '..', 'data', 'savetyre_session');
if (!fs.existsSync(SAVETYRE_SESSION_DIR)) {
  fs.mkdirSync(SAVETYRE_SESSION_DIR, { recursive: true });
}

class SaveTyreService {
  constructor() {
    this.username = 'Phrajan';
    this.password = 'Ttu123456';
    this.cachedRedemptionItems = [];
    this.lastRedemptionFetch = null;
    this.userRights = 0;
  }

  /**
   * Helper to get logged-in browser context
   */
  async getContext() {
    const context = await chromium.launchPersistentContext(SAVETYRE_SESSION_DIR, {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    return context;
  }

  async ensureLoggedIn(page) {
    await page.goto('https://order.savetyre.net/sale_support/index', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const url = page.url();
    if (url.includes('/login') || url.includes('/signin')) {
      console.log('[SaveTyre] Logging in...');
      await page.fill('input[type="text"], input[name*="user"]', this.username);
      await page.fill('input[type="password"]', this.password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        page.click('button[type="submit"], input[type="submit"]')
      ]);
      console.log('[SaveTyre] Login complete, current URL:', page.url());
    }
  }

  /**
   * Search tires in SaveTyre by size or model keyword (e.g. "215/45R17" or "PS31")
   */
  async searchStock(keyword) {
    if (!keyword) return { success: false, items: [], message: 'กรุณาระบุคำค้นหา' };

    console.log(`[SaveTyre] Searching stock for: "${keyword}"...`);
    const context = await this.getContext();
    const page = await context.newPage();

    try {
      await this.ensureLoggedIn(page);
      await page.goto('https://order.savetyre.net/sale_support/order/default', { waitUntil: 'networkidle', timeout: 30000 });

      // Search in DataTables input
      const searchInput = await page.$('input[type="search"], .dataTables_filter input');
      if (!searchInput) {
        throw new Error('ไม่พบช่องค้นหาในหน้าเว็บ SaveTyre');
      }

      await searchInput.fill(keyword);
      await page.waitForTimeout(1500);

      // Extract results
      const items = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(r => {
          const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 8) return null;
          return {
            sku: cells[1] || '',
            stockThisYear: cells[2] || '0',
            stockTotal: cells[3] || '0',
            itemType: cells[4] || '',
            brand: cells[5] || '',
            model: cells[6] || '',
            width: cells[7] || '',
            series: cells[8] || '',
            rim: cells[9] || '',
            priceRetail: parseFloat((cells[12] || '0').replace(/,/g, '')) || 0,
            promo: cells[13] || ''
          };
        }).filter(Boolean);
      });

      console.log(`[SaveTyre] Found ${items.length} items for "${keyword}"`);
      await context.close();

      return {
        success: true,
        keyword,
        count: items.length,
        items
      };

    } catch (err) {
      console.error('[SaveTyre] Error searching stock:', err);
      await context.close();
      return { success: false, error: err.message, items: [] };
    }
  }

  /**
   * Fetch all Redemption (แลกซื้อ) items and active rights
   */
  async fetchRedemptionCatalog(force = false) {
    if (!force && this.cachedRedemptionItems.length > 0 && this.lastRedemptionFetch && (Date.now() - this.lastRedemptionFetch < 1800000)) {
      return {
        success: true,
        userRights: this.userRights,
        items: this.cachedRedemptionItems,
        cached: true
      };
    }

    console.log('[SaveTyre] Fetching redemption catalog...');
    const context = await this.getContext();
    const page = await context.newPage();

    try {
      await this.ensureLoggedIn(page);
      await page.goto('https://order.savetyre.net/sale_support/order/redemption', { waitUntil: 'networkidle', timeout: 30000 });

      // Read user rights
      const pageInfo = await page.evaluate(() => {
        const body = document.body.innerText;
        const rightsMatch = body.match(/สิทธิ์แลกซื้อ.*?(\d+)\s*สิทธิ์/);
        const rights = rightsMatch ? parseInt(rightsMatch[1], 10) : 0;

        // Extract redemption table rows
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        const list = rows.map(r => {
          const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 13) return null;
          const retail = parseFloat((cells[12] || '0').replace(/,/g, '')) || 0;
          const redemptionPrice = parseFloat((cells[13] || '0').replace(/,/g, '')) || 0;
          const pointsNeeded = parseInt(cells[14] || '0', 10) || 0;
          const savings = retail - redemptionPrice;

          return {
            sku: cells[1] || '',
            stockThisYear: cells[2] || '0',
            stockTotal: cells[3] || '0',
            itemType: cells[4] || '',
            brand: cells[5] || '',
            model: cells[6] || '',
            width: cells[7] || '',
            series: cells[8] || '',
            rim: cells[9] || '',
            size: `${cells[7] || ''}/${cells[8] || ''}R${cells[9] || ''}`.replace(/^\/+|\/+$/g, ''),
            priceRetail: retail,
            priceRedemption: redemptionPrice,
            pointsNeeded,
            savings,
            savingsPercent: retail > 0 ? Math.round((savings / retail) * 100) : 0
          };
        }).filter(Boolean);

        return { rights, list };
      });

      this.userRights = pageInfo.rights;
      this.cachedRedemptionItems = pageInfo.list;
      this.lastRedemptionFetch = Date.now();

      await context.close();

      return {
        success: true,
        userRights: this.userRights,
        count: pageInfo.list.length,
        items: pageInfo.list
      };

    } catch (err) {
      console.error('[SaveTyre] Error fetching redemption:', err);
      await context.close();
      return { success: false, error: err.message, items: [], userRights: this.userRights };
    }
  }

  /**
   * Smart Optimizer: Evaluate an order against SaveTyre stock, promo and redemption
   */
  async evaluateOrder(productName, quantity = 1) {
    // Extract size pattern like 215/45R17
    const sizeMatch = productName.match(/\d{3}\/\d{2,3}R\d{2}/i);
    const searchKey = sizeMatch ? sizeMatch[0] : productName.slice(0, 15);

    // 1. Check redemption eligibility
    const redemptionData = await this.fetchRedemptionCatalog();
    const eligibleRedemption = redemptionData.items.find(item => {
      if (sizeMatch && item.size && item.size.toLowerCase() === sizeMatch[0].toLowerCase()) return true;
      if (item.sku && productName.toLowerCase().includes(item.sku.toLowerCase())) return true;
      return false;
    });

    // 2. Search live stock and promotions
    const stockResult = await this.searchStock(searchKey);
    const matchingStock = stockResult.items.filter(item => {
      if (sizeMatch && item.width && item.series && item.rim) {
        const itemSize = `${item.width}/${item.series}R${item.rim}`;
        return itemSize.toLowerCase() === sizeMatch[0].toLowerCase();
      }
      return true;
    });

    // 3. Analyze promotions & volume deals
    const promoSuggestions = [];
    matchingStock.forEach(s => {
      if (s.promo) {
        // e.g. "39 แถม 1" or "7 แถม 1"
        const promoMatch = s.promo.match(/(\d+)\s*แถม\s*(\d+)/);
        if (promoMatch) {
          const buyCount = parseInt(promoMatch[1], 10);
          const freeCount = parseInt(promoMatch[2], 10);
          const effectivePricePerUnit = (s.priceRetail * buyCount) / (buyCount + freeCount);
          const discountPct = Math.round((freeCount / (buyCount + freeCount)) * 100);

          promoSuggestions.push({
            sku: s.sku,
            promoText: s.promo,
            buyCount,
            freeCount,
            effectivePricePerUnit,
            discountPct,
            recommendation: `ซื้อ ${buyCount} แถม ${freeCount} ตกเส้นละ ฿${Math.round(effectivePricePerUnit).toLocaleString()} (ลด ${discountPct}%)`
          });
        }
      }
    });

    return {
      searchKey,
      inStock: matchingStock.some(s => s.stockTotal !== '0'),
      matchingStock,
      eligibleRedemption: eligibleRedemption ? {
        ...eligibleRedemption,
        hasEnoughRights: this.userRights >= eligibleRedemption.pointsNeeded
      } : null,
      userRights: this.userRights,
      promoSuggestions
    };
  }
}

module.exports = new SaveTyreService();
