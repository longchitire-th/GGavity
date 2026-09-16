const https = require('https');

class TopFormService {
  constructor() {
    this.email = 'longchi.tire@gmail.com';
    this.password = '@Lc0985795449';
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Helper to make HTTPS requests
   */
  request(url, options = {}, postData = null) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'th',
          ...options.headers
        },
        timeout: 12000
      };

      const req = https.request(reqOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({ status: res.statusCode, headers: res.headers, data: json });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, raw: body });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TopForm request timed out'));
      });

      req.on('error', reject);

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Login and get JWT token
   */
  async login(force = false) {
    const now = Math.floor(Date.now() / 1000);
    if (!force && this.token && this.tokenExpiresAt > now + 300) {
      return this.token;
    }

    try {
      const payload = JSON.stringify({
        email: this.email,
        password: this.password,
        isForceLogin: true
      });

      const res = await this.request('https://topform.co.th/api/dealer/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, payload);

      if (res.data && res.data.token) {
        this.token = res.data.token;
        try {
          const parts = this.token.split('.');
          if (parts.length === 3) {
            const claims = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            this.tokenExpiresAt = claims.exp || (now + 86400);
          }
        } catch (e) {
          this.tokenExpiresAt = now + 86400;
        }
        console.log('[TopForm] Login successful for:', this.email);
        return this.token;
      } else {
        throw new Error(res.data?.message || 'Login failed, no token');
      }
    } catch (err) {
      console.error('[TopForm] Login error:', err.message);
      throw err;
    }
  }

  /**
   * Parse width/series/rim from string e.g. "215/45R17" or "ยาง 195/65R15 YOKOHAMA"
   */
  parseTireSize(text = '') {
    const match = text.match(/(\d{3})\/(\d{2})R?(\d{2})/i);
    if (match) {
      return {
        tread: match[1],
        aspectRatio: match[2],
        diameter: match[3],
        formatted: `${match[1]}/${match[2]}R${match[3]}`
      };
    }
    return null;
  }

  /**
   * Search stock in TopForm
   */
  async searchStock(query = {}) {
    const token = await this.login();
    let { keyword, width, series, rim, page = 1, pageSize = 20 } = query;

    let tread = width || '';
    let aspectRatio = series || '';
    let diameter = rim || '';

    if (keyword && (!tread || !aspectRatio || !diameter)) {
      const parsed = this.parseTireSize(keyword);
      if (parsed) {
        tread = parsed.tread;
        aspectRatio = parsed.aspectRatio;
        diameter = parsed.diameter;
      }
    }

    const payloadObj = {
      brandId: '',
      modelId: '',
      front: {
        tread: String(tread || ''),
        aspectRatio: String(aspectRatio || ''),
        diameter: String(diameter || '')
      },
      back: null,
      sortBy: 'price-asc',
      page: Number(page),
      pageSize: Number(pageSize)
    };

    const postData = JSON.stringify(payloadObj);

    const res = await this.request('https://topform.co.th/api/dealer/product/tire', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      }
    }, postData);

    if (res.status === 401) {
      await this.login(true);
      return this.searchStock(query);
    }

    const data = res.data || {};
    const total = data.pagination?.totalCount || 0;
    const items = [];

    if (data.productList && Array.isArray(data.productList)) {
      data.productList.forEach(p => {
        const item = p.group?.[0] || p;
        if (item) {
          let promoText = '';
          let promoDiscount = 0;
          if (item.promotions && item.promotions.length > 0) {
            promoText = item.promotions.map(pr => {
              if (pr.discountAmount) promoDiscount += pr.discountAmount;
              return pr.promotionName;
            }).join(' | ');
          }

          items.push({
            id: item.id,
            code: item.code || '-',
            name: item.name || '',
            brandName: item.name?.split(' ')?.[0] || 'TOPFORM',
            modelName: item.name || '',
            size: tread && aspectRatio && diameter ? `${tread}/${aspectRatio}R${diameter}` : '',
            price: Number(item.price) || 0,
            netPrice: Number(item.price) - promoDiscount,
            availableStock: Number(item.availableStock) || 0,
            year: item.year || '',
            country: item.country || '',
            promotions: item.promotions || [],
            promoSummary: promoText
          });
        }
      });
    }

    return {
      supplier: 'TopForm (ท็อปฟอร์ม)',
      keyword: keyword || '',
      sizeQuery: tread ? `${tread}/${aspectRatio}R${diameter}` : 'ทั้งหมด',
      totalFound: total,
      items
    };
  }

  /**
   * Evaluate tire order against TopForm inventory & promotions
   */
  async evaluateOrder(productName, quantity = 1) {
    const size = this.parseTireSize(productName);
    if (!size) {
      return {
        matched: false,
        reason: 'ไม่พบขนาดยางในชื่อสินค้า (เช่น 215/45R17)'
      };
    }

    const stockResult = await this.searchStock({ keyword: size.formatted });
    if (!stockResult.items || stockResult.items.length === 0) {
      return {
        matched: false,
        size: size.formatted,
        reason: `ไม่พบสินค้าขนาดยาง ${size.formatted} ในสต็อก TopForm`
      };
    }

    const upperProd = productName.toUpperCase();
    let matchedItem = stockResult.items.find(it => upperProd.includes(it.brandName.toUpperCase()));
    if (!matchedItem) {
      matchedItem = stockResult.items[0];
    }

    const price = matchedItem.price;
    const totalCost = price * quantity;

    return {
      matched: true,
      size: size.formatted,
      supplier: 'TopForm (ท็อปฟอร์ม)',
      selectedItem: matchedItem,
      totalStockAvailable: matchedItem.availableStock,
      unitPrice: price,
      quantity,
      totalCost,
      promotions: matchedItem.promotions,
      promoSummary: matchedItem.promoSummary,
      recommendation: matchedItem.availableStock >= quantity
        ? `มีสต็อกพร้อมส่ง ${matchedItem.availableStock} เส้น ในราคา ฿${price.toLocaleString()}/เส้น`
        : `สต็อก TopForm มีเพียง ${matchedItem.availableStock} เส้น (ต้องการ ${quantity} เส้น)`,
      allAlternatives: stockResult.items
    };
  }

  /**
   * Get reward catalog
   */
  async getRewards() {
    const token = await this.login();
    const res = await this.request('https://topform.co.th/api/dealer/rewards', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.data && res.data.reward) {
      return {
        rewards: res.data.reward.map(r => ({
          id: r.id,
          name: r.name,
          point: r.point,
          imageUrl: r.imageUrl ? `https://topform.co.th${r.imageUrl}` : ''
        }))
      };
    }
    return { rewards: [] };
  }
}

module.exports = new TopFormService();
