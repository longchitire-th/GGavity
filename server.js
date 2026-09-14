const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const dbService = require('./services/db_service');
const analyticsService = require('./services/analytics_service');

const app = express();
const PORT = process.env.PORT || 3838;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Network IP
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

// 1. Get transactions
app.get('/api/transactions', (req, res) => {
  try {
    const list = dbService.getAllTransactions(req.query);
    res.json({ ok: true, rows: list, total: list.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. Add transaction
app.post('/api/transactions', (req, res) => {
  try {
    const item = req.body;
    if (!item.amount || Number(item.amount) <= 0) {
      return res.status(400).json({ ok: false, error: 'กรุณาระบุจำนวนเงินที่ถูกต้อง' });
    }
    const created = dbService.addTransaction(item);
    res.json({ ok: true, transaction: created, id: created.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. Update transaction
app.put('/api/transactions/:id', (req, res) => {
  try {
    const updated = dbService.updateTransaction(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'ไม่พบรายการที่ต้องการแก้ไข' });
    }
    res.json({ ok: true, transaction: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. Delete transaction
app.delete('/api/transactions/:id', (req, res) => {
  try {
    const success = dbService.deleteTransaction(req.params.id);
    if (!success) {
      return res.status(404).json({ ok: false, error: 'ไม่พบรายการที่ต้องการลบ' });
    }
    res.json({ ok: true, message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. Dashboard summary
app.get('/api/dashboard', (req, res) => {
  try {
    const dateStr = req.query.date;
    const summary = analyticsService.getDashboardSummary(dateStr);
    res.json({ ok: true, data: summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. Settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = dbService.getSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = dbService.updateSettings(req.body);
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. Export CSV
app.get('/api/export/csv', (req, res) => {
  try {
    const list = dbService.getAllTransactions(req.query);
    const csvContent = analyticsService.generateCsv(list);
    const filename = `wanwanwan-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 8. Export JSON backup
app.get('/api/export/json', (req, res) => {
  try {
    const db = dbService.getDb();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wanwanwan-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 9. Info / QR code for mobile connection
app.get('/api/info', async (req, res) => {
  const ip = getLocalNetworkIp();
  const mobileUrl = `http://${ip}:${PORT}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, { width: 250, margin: 2 });
    res.json({
      ok: true,
      port: PORT,
      localIp: ip,
      mobileUrl,
      qrDataUrl
    });
  } catch (err) {
    res.json({
      ok: true,
      port: PORT,
      localIp: ip,
      mobileUrl,
      qrDataUrl: null
    });
  }
});

// Start server
app.listen(PORT, () => {
  const ip = getLocalNetworkIp();
  console.log('====================================================');
  console.log('🍜 วุ่นวายโภชนา V2.0 - เซิร์ฟเวอร์พร้อมทำงานแล้ว!');
  console.log(`💻 เปิดบนคอมพิวเตอร์: http://localhost:${PORT}`);
  console.log(`📱 เปิดบนมือถือผ่าน Wi-Fi: http://${ip}:${PORT}`);
  console.log('====================================================');
});
