const { chromium } = require('playwright');

class KpsService {
  constructor() {
    this.email = 'longchi.tire@gmail.com';
    this.password = 'rg0842156566';
    this.loginUrl = 'http://kpsstockupdate.ddns.net:8000/Account/Login';
    this.searchUrl = 'http://kpsstockupdate.ddns.net:8000/TirePr/Search';
    this.browser = null;
  }

  parseDimensions(keyword = '') {
    const clean = keyword.replace(/\s+/g, ' ').trim();
    const match = clean.match(/(\d{3})[\/\s](\d{2})[\sR\-]*(?:R|r)?(\d{2})/);
    if (match) {
      return {
        size: match[1],
        ratio: match[2],
        rim: match[3]
      };
    }
    const parts = clean.split(' ').filter(p => /^\d+$/.test(p));
    if (parts.length >= 3) {
      return { size: parts[0], ratio: parts[1], rim: parts[2] };
    }
    return null;
  }

  async searchStock(keyword = '') {
    console.log(`[KPS] Searching stock for: "${keyword}"...`);
    const dims = this.parseDimensions(keyword);
    let browser = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(25000);

      // Login
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await page.fill('#Email', this.email);
      await page.fill('#Password', this.password);
      await page.click('input[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});

      // Navigate to search
      await page.goto(this.searchUrl, { waitUntil: 'networkidle', timeout: 20000 });

      if (dims) {
        await page.fill('#PET_Size', dims.size);
        await page.fill('#PET_Ratio', dims.ratio);
        await page.fill('#PET_Rim', dims.rim);
      } else {
        await page.fill('#PET_SearchKey', keyword);
      }

      const submitBtn = await page.$('input[value="ค้นหา"], button:has-text("ค้นหา"), .btn-primary');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }

      // Extract results from cards
      const items = await page.$$eval('.col-md-3, [class*="col-sm-"], [class*="col-xs-"]', cards => {
        const results = [];
        cards.forEach(card => {
          const text = card.innerText || '';
          if (!text.includes('เส้นละ') && !text.includes('สาขา')) return;

          // Extract title/model
          const titleMatch = text.match(/\d+\.\s*([^\n\r]+)/);
          const fullTitle = titleMatch ? titleMatch[1].trim() : text.split('\n')[0].trim();

          // Extract branch
          const branchMatch = text.match(/สาขา([^\n\r]+)/);
          const branch = branchMatch ? branchMatch[1].trim() : '';

          // Extract Brand
          const brandMatch = text.match(/ยี่ห้อ\s*([^\s\n\r]+)/);
          const brand = brandMatch ? brandMatch[1].trim() : '';

          // Extract Stock Qty
          const qtyMatch = text.match(/จำนวน\s*(\d+)\s*เส้น/);
          const stock = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;

          // Extract DOT / Year
          const dotMatch = text.match(/DOT\s*([0-9A-Za-z]+)/i);
          const yearMatch = text.match(/ปี\s*(\d+)/);
          const dot = dotMatch ? dotMatch[1] : (yearMatch ? yearMatch[1] : '');

          // Extract Price
          const priceMatch = text.match(/เส้นละ\s*([0-9,]+(?:\.\d+)?)\s*บาท/);
          let price = 0;
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(/,/g, ''));
          }

          // Extract Promo
          const promoMatch = text.match(/โปร[^\n\r]+/);
          const promo = promoMatch ? promoMatch[0].trim() : '';

          if (price > 0 || stock > 0) {
            results.push({
              source: 'KPS Stock',
              brand,
              name: fullTitle,
              stock,
              price,
              dot,
              branch,
              promo,
              wholesalePrice: price
            });
          }
        });
        return results;
      });

      console.log(`[KPS] Found ${items.length} items for "${keyword}"`);
      return items;
    } catch (err) {
      console.error('[KPS] Error searching stock:', err.message);
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }

  async evaluateOrder(productName, quantity = 1) {
    try {
      const dims = this.parseDimensions(productName);
      const query = dims ? `${dims.size} ${dims.ratio} ${dims.rim}` : productName;
      const items = await this.searchStock(query);
      if (!items || items.length === 0) {
        return {
          matched: false,
          supplier: 'KPS Stock',
          reason: `ไม่พบสินค้าขนาดยางในสต็อก KPS Stock`
        };
      }

      const upperProd = (productName || '').toUpperCase();
      let matchedItem = items.find(it => upperProd.includes((it.brand || '').toUpperCase()));
      if (!matchedItem) matchedItem = items[0];

      const price = matchedItem.wholesalePrice || matchedItem.price;
      const totalCost = price * quantity;

      return {
        matched: true,
        supplier: 'KPS Stock',
        selectedItem: matchedItem,
        totalStockAvailable: matchedItem.stock,
        unitPrice: price,
        quantity,
        totalCost,
        promoSummary: matchedItem.promo || `สาขา ${matchedItem.branch} (DOT: ${matchedItem.dot})`,
        recommendation: matchedItem.stock >= quantity
          ? `มีสต็อกพร้อมส่ง ${matchedItem.stock} เส้น (สาขา ${matchedItem.branch} DOT ${matchedItem.dot})`
          : `สต็อก KPS มีเพียง ${matchedItem.stock} เส้น (ต้องการ ${quantity} เส้น)`,
        allAlternatives: items
      };
    } catch (err) {
      return { matched: false, supplier: 'KPS Stock', reason: err.message };
    }
  }
}

module.exports = new KpsService();
