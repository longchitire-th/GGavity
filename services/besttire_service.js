const { chromium } = require('playwright');

class BestTireService {
  constructor() {
    this.username = 'longchi';
    this.password = '@Ait16011985';
    this.loginUrl = 'https://www.besttire.co.th/login.html';
    this.homeUrl = 'https://www.besttire.co.th/home.html';
  }

  parseDimensions(keyword = '') {
    const clean = keyword.replace(/\s+/g, ' ').trim();
    const match = clean.match(/(\d{3})[\/\s](\d{2})[\sR\-]*(?:R|r)?(\d{2})/);
    if (match) {
      return `${match[1]}/${match[2]}R${match[3]}`;
    }
    return keyword.trim();
  }

  async searchStock(keyword = '') {
    const query = this.parseDimensions(keyword);
    console.log(`[BestTire] Searching stock for: "${query}"...`);

    let browser = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(25000);

      // Login
      await page.goto(this.loginUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await page.fill('#username', this.username);
      await page.fill('#password', this.password);
      await page.click('button:has-text("เข้าสู่ระบบ")');
      await page.waitForTimeout(3000);

      // Fill search input
      const searchInput = await page.$('input[placeholder*="195/60R15"], input[type="search"], input[name="search"]');
      if (!searchInput) {
        console.warn('[BestTire] Search input not found');
        return [];
      }

      await searchInput.fill(query);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
        searchInput.press('Enter')
      ]);
      await page.waitForTimeout(2000);
      console.log('[BestTire] Current page URL:', page.url());

      // Extract results from .product-shop
      const items = await page.$$eval('.product-shop', elms => {
        const results = [];
        elms.forEach(elm => {
          const text = elm.innerText || '';
          const brandImg = elm.querySelector('.prod_tbl_li_col1 img, img');
          const brand = brandImg ? (brandImg.alt || brandImg.title || '') : '';

          const cols = Array.from(elm.querySelectorAll('[class*="prod_tbl_li_col"]')).map(c => c.innerText.trim());
          const codeMatch = text.match(/PRO-\d+/);
          const cCode = cols[1] || (codeMatch ? codeMatch[0] : '');
          const cName = cols[2] || (text.match(/ยางนอก[^\n\r]+/) ? text.match(/ยางนอก[^\n\r]+/)[0].trim() : '');
          const cPoints = cols[3] || '0';
          const cWeekYear = cols[4] || '';
          const cStockRaw = cols[5] || '0';
          const cPriceRaw = cols[6] || '0';

          const stock = parseInt(cStockRaw.replace(/[^\d]/g, ''), 10) || (cStockRaw.includes('+') ? 4 : 0);
          const price = parseFloat(cPriceRaw.replace(/[^\d.]/g, '')) || 0;

          if (cName && (price > 0 || stock > 0)) {
            results.push({
              source: 'BestTire',
              brand: brand || 'ยางรถยนต์',
              code: cCode,
              name: cName,
              points: cPoints,
              weekYear: cWeekYear,
              stock,
              price,
              wholesalePrice: price
            });
          }
        });
        return results;
      });

      console.log(`[BestTire] Found ${items.length} items for "${query}"`);
      return items;
    } catch (err) {
      console.error('[BestTire] Error searching stock:', err.message);
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  async evaluateOrder(productName, quantity = 1) {
    try {
      const items = await this.searchStock(productName);
      if (!items || items.length === 0) {
        return {
          matched: false,
          supplier: 'BestTire',
          reason: `ไม่พบสินค้าในสต็อก BestTire`
        };
      }

      const upperProd = (productName || '').toUpperCase();
      let matchedItem = items.find(it => upperProd.includes((it.brand || '').toUpperCase()));
      if (!matchedItem) matchedItem = items[0];

      const price = matchedItem.wholesalePrice || matchedItem.price;
      const totalCost = price * quantity;

      return {
        matched: true,
        supplier: 'BestTire',
        selectedItem: matchedItem,
        totalStockAvailable: matchedItem.stock,
        unitPrice: price,
        quantity,
        totalCost,
        promoSummary: matchedItem.points ? `รับคะแนนสะสม ${matchedItem.points} แต้ม` : '',
        recommendation: matchedItem.stock >= quantity
          ? `มีของในคลัง ${matchedItem.stock}+ เส้น (สัปดาห์: ${matchedItem.weekYear})`
          : `สต็อก BestTire หมด`,
        allAlternatives: items
      };
    } catch (err) {
      return { matched: false, supplier: 'BestTire', reason: err.message };
    }
  }
}

module.exports = new BestTireService();
