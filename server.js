const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');
const os = require('os');
const QRCode = require('qrcode');
const crypto = require('crypto');

const db = require('./services/db');
const bigsellerBot = require('./bot/bigseller_bot');
const sheetsService = require('./services/sheets_service');
const analyticsService = require('./services/analytics_service');
const saveTyreService = require('./services/savetyre_service');
const topformService = require('./services/topform_service');
const kpsService = require('./services/kps_service');
const bestTireService = require('./services/besttire_service');

const app = express();
const PORT = process.env.PORT || 3838;

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'slips');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage for slip uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const orderId = req.params.id || 'slip';
    const cleanId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `slip-${cleanId}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพ (JPG, PNG, WEBP) หรือ PDF'));
    }
  }
});

const dataUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.csv';
      cb(null, `import-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Helper to get local network IP for mobile access
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ==========================================
// API ROUTES
// ==========================================

// --- Orders ---
app.get('/api/orders', (req, res) => {
  try {
    const orders = db.getOrders(req.query);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const order = db.upsertOrder(req.body);
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/pricing', (req, res) => {
  try {
    const updated = db.updateOrderPricing(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'ไม่พบออเดอร์นี้' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const updated = db.updateOrderStatus(req.params.id, req.body.status);
    if (!updated) return res.status(404).json({ success: false, error: 'ไม่พบออเดอร์นี้' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const deleted = db.deleteOrder(req.params.id);
    res.json({ success: true, data: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Slip Upload (Mobile & PC)
const orderImporter = require('./bot/order_importer');

app.post('/api/orders/import-csv', dataUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'ไม่พบไฟล์' });
    }
    const result = orderImporter.importFile(req.file.path);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders/:id/slip', upload.single('slip'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'ไม่พบไฟล์ที่อัปโหลด' });
    }
    const updated = db.attachSlip(req.params.id, req.file.filename);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'ไม่พบออเดอร์นี้' });
    }
    res.json({
      success: true,
      message: 'อัปโหลดสลิปเรียบร้อยแล้ว',
      data: updated,
      slipUrl: updated.slipUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Suppliers ---
app.get('/api/suppliers', (req, res) => {
  res.json({ success: true, data: db.getSuppliers() });
});

app.post('/api/suppliers', (req, res) => {
  try {
    const newSup = db.addSupplier(req.body);
    res.json({ success: true, data: newSup });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/suppliers/:id', (req, res) => {
  try {
    db.deleteSupplier(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Mappings & Memory ---
app.get('/api/mappings', (req, res) => {
  res.json({ success: true, data: db.getMappings() });
});

app.post('/api/mappings', (req, res) => {
  try {
    db.saveMapping(req.body);
    res.json({ success: true, data: db.getMappings() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/mappings/:id', (req, res) => {
  try {
    db.deleteMapping(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Analytics ---
app.get('/api/analytics', (req, res) => {
  try {
    const summary = analyticsService.getSummary(req.query.date);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- BigSeller Bot ---
app.get('/api/bigseller/status', async (req, res) => {
  res.json({
    success: true,
    isScraping: bigsellerBot.isScraping,
    lastScrapedAt: bigsellerBot.lastScrapedAt,
    lastError: bigsellerBot.lastError,
    isLoggedIn: bigsellerBot.isLoggedIn
  });
});

app.post('/api/bigseller/login', async (req, res) => {
  try {
    const result = await bigsellerBot.openInteractiveLogin();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bigseller/fetch', async (req, res) => {
  try {
    const result = await bigsellerBot.fetchOrders(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bigseller/seed', (req, res) => {
  try {
    const seeded = bigsellerBot.seedSampleOrders();
    res.json({ success: true, count: seeded.length, data: seeded });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Google Sheets Sync & Export ---
app.post('/api/sheets/sync', async (req, res) => {
  try {
    const host = req.get('host') || `localhost:${PORT}`;
    const baseUrl = `${req.protocol}://${host}`;
    const result = await sheetsService.syncToGoogleSheet(req.body.orderIds, baseUrl);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sheets/export-csv', (req, res) => {
  try {
    const host = req.get('host') || `localhost:${PORT}`;
    const baseUrl = `${req.protocol}://${host}`;
    const orders = db.getOrders(req.query);
    const csv = sheetsService.generateCsv(orders, baseUrl);
    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daily_tire_orders_${today}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sheets/script-template', (req, res) => {
  res.json({
    success: true,
    script: sheetsService.getAppsScriptTemplate()
  });
});

// --- SaveTyre Integration ---
app.get('/api/savetyre/stock', async (req, res) => {
  try {
    const keyword = req.query.keyword || '';
    const result = await saveTyreService.searchStock(keyword);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/savetyre/redemption', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const result = await saveTyreService.getRedemptionCatalog(force);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/savetyre/evaluate', async (req, res) => {
  try {
    const { productName, quantity } = req.query;
    const result = await saveTyreService.evaluateOrder(productName, Number(quantity) || 1);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- TopForm Integration ---
app.get('/api/topform/stock', async (req, res) => {
  try {
    const { keyword, width, series, rim, page, pageSize } = req.query;
    const result = await topformService.searchStock({ keyword, width, series, rim, page, pageSize });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/topform/rewards', async (req, res) => {
  try {
    const result = await topformService.getRewards();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/topform/evaluate', async (req, res) => {
  try {
    const { productName, quantity } = req.query;
    const result = await topformService.evaluateOrder(productName, Number(quantity) || 1);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- KPS Stock Integration ---
app.get('/api/kps/stock', async (req, res) => {
  try {
    const keyword = req.query.keyword || '';
    const items = await kpsService.searchStock(keyword);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- BestTire Integration ---
app.get('/api/besttire/stock', async (req, res) => {
  try {
    const keyword = req.query.keyword || '';
    const items = await bestTireService.searchStock(keyword);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Multi-Supplier Smart Comparator (Save Tyre, TopForm, KPS Stock, BestTire) ---
app.get('/api/suppliers/compare', async (req, res) => {
  try {
    const { productName, quantity = 1 } = req.query;
    const qty = Number(quantity) || 1;

    const [saveTyrePromise, topFormPromise, kpsPromise, bestTirePromise] = await Promise.allSettled([
      saveTyreService.evaluateOrder(productName, qty),
      topformService.evaluateOrder(productName, qty),
      kpsService.evaluateOrder(productName, qty),
      bestTireService.evaluateOrder(productName, qty)
    ]);

    const saveTyreData = saveTyrePromise.status === 'fulfilled' ? saveTyrePromise.value : { matched: false, supplier: 'Save Tyre', reason: saveTyrePromise.reason?.message };
    const topFormData = topFormPromise.status === 'fulfilled' ? topFormPromise.value : { matched: false, supplier: 'TopForm', reason: topFormPromise.reason?.message };
    const kpsData = kpsPromise.status === 'fulfilled' ? kpsPromise.value : { matched: false, supplier: 'KPS Stock', reason: kpsPromise.reason?.message };
    const bestTireData = bestTirePromise.status === 'fulfilled' ? bestTirePromise.value : { matched: false, supplier: 'BestTire', reason: bestTirePromise.reason?.message };

    const suppliersList = [
      { key: 'savetyre', name: 'Save Tyre (ไทร์ทูยู)', data: saveTyreData },
      { key: 'topform', name: 'TopForm (ท็อปฟอร์ม)', data: topFormData },
      { key: 'kps', name: 'KPS Stock', data: kpsData },
      { key: 'besttire', name: 'BestTire', data: bestTireData }
    ];

    // Priority criteria: 1. มี/ไม่มี (Stock) -> 2. ราคา (Price) -> 3. เงื่อนไข (Promotions/Conditions)
    suppliersList.forEach(s => {
      const stock = s.data.totalStockAvailable || 0;
      s.hasStock = Boolean(s.data.matched && stock >= qty);
      s.partialStock = Boolean(s.data.matched && stock > 0 && stock < qty);
      s.outOfStock = Boolean(!s.data.matched || stock === 0);
      s.stockCount = stock;
      s.unitPrice = s.data.unitPrice || 0;
      s.totalCost = s.data.totalCost || 0;

      const conditions = [];
      if (s.data.bestVolumePromo) conditions.push(s.data.bestVolumePromo.promoName);
      if (s.data.promoSummary) conditions.push(s.data.promoSummary);
      if (s.data.lotYear) conditions.push(`ล็อต ${s.data.lotYear}`);
      if (s.data.selectedItem?.year) conditions.push(`DOT ${s.data.selectedItem.year}`);
      if (s.data.selectedItem?.dot) conditions.push(`DOT ${s.data.selectedItem.dot}`);
      if (s.data.selectedItem?.points) conditions.push(`แต้มสะสม ${s.data.selectedItem.points}`);
      if (s.data.selectedItem?.branch) conditions.push(`สาขา ${s.data.selectedItem.branch}`);
      s.conditions = conditions;
    });

    // Sort strictly by: 1. Stock (hasStock=2, partial=1, out=0) -> 2. Price (lowest totalCost) -> 3. Conditions count
    suppliersList.sort((a, b) => {
      const scoreA = a.hasStock ? 2 : (a.partialStock ? 1 : 0);
      const scoreB = b.hasStock ? 2 : (b.partialStock ? 1 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a.hasStock && b.hasStock) {
        if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
        return b.conditions.length - a.conditions.length;
      }
      return 0;
    });

    const inStockCandidates = suppliersList.filter(s => s.hasStock);
    let bestOption = null;

    if (inStockCandidates.length > 0) {
      const winner = inStockCandidates[0];
      const second = inStockCandidates[1];
      const savings = second ? (second.totalCost - winner.totalCost) : 0;
      
      let reason = `✅ มีของพร้อมส่ง (${winner.stockCount} เส้น) • ราคาดีที่สุด ฿${winner.unitPrice.toLocaleString()}/เส้น`;
      if (savings > 0) {
        reason += ` (ประหยัดกว่า ${second.name} ฿${savings.toLocaleString()})`;
      }
      if (winner.conditions.length > 0) {
        reason += ` • เงื่อนไข: ${winner.conditions.join(', ')}`;
      }

      bestOption = {
        supplier: winner.name,
        supplierKey: winner.key,
        pricePerUnit: winner.unitPrice,
        totalCost: winner.totalCost,
        stockCount: winner.stockCount,
        conditions: winner.conditions,
        reason
      };
    } else {
      const partialCandidates = suppliersList.filter(s => s.partialStock);
      if (partialCandidates.length > 0) {
        const candidate = partialCandidates[0];
        bestOption = {
          supplier: candidate.name,
          supplierKey: candidate.key,
          pricePerUnit: candidate.unitPrice,
          totalCost: candidate.totalCost,
          stockCount: candidate.stockCount,
          conditions: candidate.conditions,
          reason: `⚠️ ของไม่ครบตามสั่ง (มีเพียง ${candidate.stockCount} เส้น) @ ฿${candidate.unitPrice.toLocaleString()}/เส้น`
        };
      }
    }

    res.json({
      success: true,
      productName,
      quantity: qty,
      bestOption,
      rankedSuppliers: suppliersList,
      savetyre: saveTyreData,
      topform: topFormData,
      kps: kpsData,
      besttire: bestTireData
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- System & Network Info (QR Code for Mobile) ---
app.get('/api/system/network-info', async (req, res) => {
  try {
    const localIp = getLocalNetworkIp();
    const localUrl = `http://${localIp}:${PORT}`;
    const qrDataUrl = await QRCode.toDataURL(localUrl);
    res.json({
      success: true,
      port: PORT,
      localIp,
      localUrl,
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
  res.json({ success: true, data: db.getSettings() });
});

app.put('/api/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- PEAK Account Integration API Proxy ---
const peakTokenCache = new Map();

function getPeakTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}${hh}${mm}${ss}`;
}

function getPeakSignature(timeStamp, connectId) {
  return crypto.createHmac('sha1', connectId).update(timeStamp).digest('base64');
}

async function getPeakClientToken(baseUrl, connectId) {
  const cached = peakTokenCache.get(connectId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const timeStamp = getPeakTimestamp();
  const signature = getPeakSignature(timeStamp, connectId);

  const response = await fetch(`${baseUrl}/api/v1/ClientToken`, {
    method: 'POST',
    headers: {
      'Time-Stamp': timeStamp,
      'Time-Signature': signature,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  const data = await response.json();
  if (data && data.data && data.data.clientToken) {
    const token = data.data.clientToken;
    const expiresInMs = (data.data.expiresIn || 86400) * 1000 - 60000;
    peakTokenCache.set(connectId, { token, expiresAt: Date.now() + expiresInMs });
    return token;
  }
  throw new Error(data.message || 'Failed to obtain ClientToken from PEAK');
}

app.post('/api/peak/test', async (req, res) => {
  try {
    const { peakEnv, connectId, userToken } = req.body;
    if (!connectId || !userToken) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ Connect ID และ User Token' });
    }
    const baseUrl = peakEnv === 'uat' 
      ? 'https://peakengineapidev.azurewebsites.net' 
      : 'https://api.peakaccount.com';

    const clientToken = await getPeakClientToken(baseUrl, connectId);
    res.json({
      status: 'success',
      success: true,
      message: 'เชื่อมต่อกับ PEAK API สำเร็จ! Client-Token พร้อมใช้งาน',
      clientTokenPreview: clientToken.slice(0, 10) + '...'
    });
  } catch (err) {
    console.error('[PEAK Test] Error:', err.message);
    res.status(500).json({ status: 'error', success: false, message: err.message });
  }
});

app.post('/api/peak/quotation', async (req, res) => {
  try {
    const { peakEnv, connectId, userToken, quotationPayload } = req.body;
    if (!connectId || !userToken || !quotationPayload) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }
    const baseUrl = peakEnv === 'uat' 
      ? 'https://peakengineapidev.azurewebsites.net' 
      : 'https://api.peakaccount.com';

    const clientToken = await getPeakClientToken(baseUrl, connectId);
    const timeStamp = getPeakTimestamp();
    const signature = getPeakSignature(timeStamp, connectId);

    const peakRes = await fetch(`${baseUrl}/api/v1/Quotations`, {
      method: 'POST',
      headers: {
        'Time-Stamp': timeStamp,
        'Time-Signature': signature,
        'User-Token': userToken,
        'Client-Token': clientToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(quotationPayload)
    });

    const peakData = await peakRes.json();
    res.status(peakRes.status).json({
      status: peakRes.status === 200 ? 'success' : 'error',
      code: peakRes.status,
      data: peakData.data || peakData,
      message: peakData.message || (peakRes.status === 200 ? 'Created quotation successfully' : 'PEAK error')
    });
  } catch (err) {
    console.error('[PEAK Quotation] Error:', err.message);
    res.status(500).json({ status: 'error', success: false, message: err.message });
  }
});

// Automatic Scheduler (Daily at 08:00 AM)
cron.schedule('0 8 * * *', async () => {
  console.log('[Scheduler] 08:00 AM triggered: Auto-fetching BigSeller orders for 12:00-08:00 cutoff...');
  try {
    await bigsellerBot.fetchOrders({ headless: true });
    console.log('[Scheduler] Auto-fetch completed successfully!');
  } catch (err) {
    console.error('[Scheduler] Auto-fetch error:', err.message);
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalNetworkIp();
  console.log(`=======================================================`);
  console.log(`🚀 Daily Tire Purchasing App is running!`);
  console.log(`💻 Desktop Access: http://localhost:${PORT}`);
  console.log(`📱 Mobile Access:  http://${localIp}:${PORT}`);
  console.log(`⏰ Daily Cutoff:   12:00 PM (yesterday) - 08:00 AM (today)`);
  console.log(`=======================================================`);
});
