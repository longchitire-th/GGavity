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
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    return context;
  }

  /**
   * Ensure user is logged into SaveTyre
   */
  async ensureLoggedIn(page) {
    await page.goto('https://order.savetyre.net/sale_support/index', { waitUntil: 'domcontentloaded', timeout: 25000 });
    const userField = await page.$('input[name*="user"]');
    if (userField) {
      console.log('[SaveTyre] Logging in...');
      await page.fill('input[name*="user"]', this.username);
      await page.fill('input[type="password"]', this.password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
        page.click('input[type="submit"]')
      ]);
      console.log('[SaveTyre] Login complete, current URL:', page.url());
    }
  }

  /**
   * Format search keyword into space-separated string e.g. "235 65 17"
   * DataTables in SaveTyre matches separate column values (หน้า / ซีรีย์ / ขอบ)
   */
  formatSearchQuery(text = '') {
    const match = text.match(/(\d{3})[\/\s-](\d{2,3})\s*R?\s*(\d{2})/i);
    if (match) {
      return `${match[1]} ${match[2]} ${match[3]}`;
    }
    return text.trim();
  }

  /**
   * Search tires in SaveTyre by size or model keyword
   */
  async searchStock(keyword) {
    if (!keyword) return { success: false, items: [], message: 'กรุณาระบุคำค้นหา' };

    const formattedQuery = this.formatSearchQuery(keyword);
    console.log(`[SaveTyre] Searching stock for: "${formattedQuery}" (original: "${keyword}")...`);
    
    const context = await this.getContext();
    const page = await context.newPage();

    try {
      await this.ensureLoggedIn(page);
      await page.goto('https://order.savetyre.net/sale_support/order/default', { waitUntil: 'networkidle', timeout: 30000 });

      const searchInput = await page.waitForSelector('input[type="search"], .dataTables_filter input', { timeout: 15000 });
      if (!searchInput) {
        throw new Error('ไม่พบช่องค้นหาในหน้าเว็บ SaveTyre');
      }

      await searchInput.fill('');
      await searchInput.fill(formattedQuery);
      await page.waitForTimeout(1500);

      // Expand first 5 rows to reveal wholesale price & lot info
      const expandButtons = await page.$$('table tbody tr td:first-child');
      for (const btn of expandButtons.slice(0, 5)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // Extract results
      const items = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        const list = [];

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.classList.contains('child') || r.querySelector('.child-row')) continue;

          const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 8) continue;

          let wholesalePrice = null;
          let lotYear = '';
          let promo = cells[13] || '';

          const nextTr = r.nextElementSibling;
          if (nextTr && (nextTr.classList.contains('child') || nextTr.querySelector('.child-row'))) {
            const promoBadge = nextTr.querySelector('.alert-success');
            if (promoBadge) promo = promoBadge.innerText.trim();

            const rowDivs = nextTr.querySelectorAll('.row');
            if (rowDivs.length >= 3) {
              const cols = Array.from(rowDivs[2].querySelectorAll('.col-2')).map(c => c.innerText.trim());
              lotYear = cols[0] || '';
              const priceStr = cols[4] || cols[2] || '';
              if (priceStr) {
                wholesalePrice = parseFloat(priceStr.replace(/,/g, '')) || null;
              }
            }
          }

          const retailPrice = parseFloat((cells[12] || '0').replace(/,/g, '')) || 0;

          list.push({
            sku: cells[1] || '',
            stockYearCurr: cells[2] || '0',
            stockTotal: cells[3] || '0',
            itemType: cells[4] || '',
            brand: cells[5] || '',
            model: cells[6] || '',
            width: cells[7] || '',
            series: cells[8] || '',
            rim: cells[9] || '',
            size: `${cells[7]}/${cells[8]}R${cells[9]}`,
            priceRetail: retailPrice,
            priceWholesale: wholesalePrice !== null ? wholesalePrice : retailPrice,
            promo,
            lotYear
          });
        }
        return list;
      });

      console.log(`[SaveTyre] Found ${items.length} items for "${formattedQuery}"`);
      await context.close();

      return {
        success: true,
        keyword: formattedQuery,
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
        userRights: this.userRights,
        items: this.cachedRedemptionItems
      };
    }

    console.log('[SaveTyre] Fetching redemption catalog...');
    const context = await this.getContext();
    const page = await context.newPage();

    try {
      await this.ensureLoggedIn(page);
      await page.goto('https://order.savetyre.net/sale_support/order/redemption', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const data = await page.evaluate(() => {
        let rights = 0;
        const allElements = Array.from(document.querySelectorAll('.alert-success, .badge, strong, span'));
        const rightsElem = allElements.find(el => el.innerText && el.innerText.includes('สิทธิ์'));
        if (rightsElem) {
          const match = rightsElem.innerText.match(/(\d+)\s*สิทธิ์/);
          if (match) rights = parseInt(match[1], 10);
        }

        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        const catalog = rows.map(r => {
          const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < 7) return null;

          const priceRetail = parseFloat((cells[3] || '0').replace(/,/g, '')) || 0;
          const priceRedemption = parseFloat((cells[4] || '0').replace(/,/g, '')) || 0;
          const rightsReq = parseInt(cells[5], 10) || 0;
          const savings = priceRetail - priceRedemption;
          const savingsPct = priceRetail > 0 ? Math.round((savings / priceRetail) * 100) : 0;

          return {
            title: cells[0] || '',
            brand: cells[1] || '',
            stock: cells[2] || '0',
            priceRetail,
            priceRedemption,
            rightsRequired: rightsReq,
            savingsAmount: savings > 0 ? savings : 0,
            savingsPercent: savingsPct
          };
        }).filter(Boolean);

        return { rights, catalog };
      });

      this.userRights = data.rights;
      this.cachedRedemptionItems = data.catalog;
      this.lastRedemptionFetch = Date.now();

      console.log(`[SaveTyre] Cached ${data.catalog.length} redemption items. Rights: ${data.rights}`);
      await context.close();

      return {
        userRights: this.userRights,
        items: this.cachedRedemptionItems
      };

    } catch (err) {
      console.error('[SaveTyre] Error fetching redemption:', err);
      await context.close();
      return { userRights: this.userRights, items: this.cachedRedemptionItems };
    }
  }

  /**
   * Smart Optimizer: Evaluate an order against SaveTyre stock, promo and redemption
   */
  async evaluateOrder(productName, quantity = 1) {
    const formattedSize = this.formatSearchQuery(productName);
    const stockResult = await this.searchStock(formattedSize);

    if (!stockResult.items || stockResult.items.length === 0) {
      return {
        matched: false,
        supplier: 'Save Tyre (ไทร์ทูยู)',
        size: formattedSize,
        reason: `ไม่พบสินค้าขนาดยาง ${formattedSize} ในสต็อก Save Tyre`
      };
    }

    // Match brand / model in productName e.g. "KUMHO", "AT52", "SL379"
    const upperProd = productName.toUpperCase();
    let matchedItem = stockResult.items.find(it => {
      if (it.model && upperProd.includes(it.model.toUpperCase().replace('ยางรถยนต์', '').trim())) return true;
      if (it.sku && upperProd.includes(it.sku.toUpperCase())) return true;
      if (it.brand && upperProd.includes(it.brand.toUpperCase())) return true;
      return false;
    });

    if (!matchedItem) {
      // Pick item with stock or lowest wholesale price
      matchedItem = stockResult.items.find(it => it.stockYearCurr !== '0') || stockResult.items[0];
    }

    const unitPrice = matchedItem.priceWholesale || matchedItem.priceRetail || 0;
    const totalCost = unitPrice * quantity;
    const stockAvailable = parseInt(matchedItem.stockYearCurr, 10) || parseInt(matchedItem.stockTotal, 10) || 0;

    // Check volume promotion (e.g. 39 แถม 1)
    let bestVolumePromo = null;
    if (matchedItem.promo) {
      const promoMatch = matchedItem.promo.match(/(\d+)\s*แถม\s*(\d+)/);
      if (promoMatch) {
        const buyCount = parseInt(promoMatch[1], 10);
        const freeCount = parseInt(promoMatch[2], 10);
        const effectivePricePerUnit = (unitPrice * buyCount) / (buyCount + freeCount);
        const discountPct = Math.round((freeCount / (buyCount + freeCount)) * 100);

        bestVolumePromo = {
          promoName: matchedItem.promo,
          buyCount,
          freeCount,
          effectivePricePerUnit,
          discountPct,
          description: `ซื้อ ${buyCount} แถม ${freeCount} ตกเส้นละ ฿${Math.round(effectivePricePerUnit).toLocaleString()} (ลด ${discountPct}%)`
        };
      }
    }

    // Check redemption eligibility
    const redemptionData = await this.fetchRedemptionCatalog();
    const redemptionMatch = redemptionData.items.find(r => {
      const sizePattern = formattedSize.replace(/\s+/g, '');
      const rTitle = r.title.replace(/[\s\/-]+/g, '');
      return rTitle.includes(sizePattern);
    });

    return {
      matched: true,
      supplier: 'Save Tyre (ไทร์ทูยู)',
      size: matchedItem.size || formattedSize,
      selectedItem: matchedItem,
      totalStockAvailable: stockAvailable,
      unitPrice,
      quantity,
      totalCost,
      bestVolumePromo,
      redemptionMatch,
      lotYear: matchedItem.lotYear,
      recommendation: stockAvailable >= quantity
        ? `มีสต็อกพร้อมส่ง ${stockAvailable} เส้น${matchedItem.lotYear ? ` (ล็อต ${matchedItem.lotYear})` : ''} ในราคา ฿${unitPrice.toLocaleString()}/เส้น${matchedItem.promo ? ` (โปร ${matchedItem.promo})` : ''}`
        : `สต็อก Save Tyre มี ${stockAvailable} เส้น (ต้องการ ${quantity} เส้น)`,
      allMatchingStock: stockResult.items
    };
  }
}

module.exports = new SaveTyreService();
