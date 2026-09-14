const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');
const os = require('os');
const QRCode = require('qrcode');

const db = require('./services/db');
const bigsellerBot = require('./bot/bigseller_bot');
const sheetsService = require('./services/sheets_service');
const analyticsService = require('./services/analytics_service');

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

app.post('/api/orders/import-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'ไม่พบไฟล์' });
    }
    const content = fs.readFileSync(req.file.path, 'utf8');
    const result = orderImporter.importCsvContent(content);
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
