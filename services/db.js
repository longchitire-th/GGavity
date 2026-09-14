const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB structure
const defaultData = {
  orders: [],
  suppliers: [
    { id: 'sup-1', name: 'เจริญโชคไทร์การยาง', phone: '081-234-5678', note: 'ส่งไว สินค้า Kumho/Bridgestone' },
    { id: 'sup-2', name: 'เอกชัยซัพพลายยางยนต์', phone: '089-876-5432', note: 'มีรุ่น AT52 ราคาดี' },
    { id: 'sup-3', name: 'สยามยางไทยกรุ๊ป', phone: '02-999-8888', note: 'สายไหม รับของได้เลย' }
  ],
  mappings: [
    {
      id: 'map-1',
      pattern: '215/45R17 KUMHO',
      supplier: 'เจริญโชคไทร์การยาง',
      pricePerUnit: 1450,
      shippingFee: 50,
      note: 'ยาง Kumho PS31 ประจำ'
    },
    {
      id: 'map-2',
      pattern: '235/65R17 KUMHO',
      supplier: 'เอกชัยซัพพลายยางยนต์',
      pricePerUnit: 2950,
      shippingFee: 100,
      note: 'รุ่น ROAD VENTURE AT52'
    }
  ],
  settings: {
    cutoffStartHour: 12, // เที่ยงเมื่อวาน (12:00)
    cutoffEndHour: 8,    // แปดโมงเช้าวันนี้ (08:00)
    googleSheetWebhook: '',
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1kKYSU-vcSVh3G8wQMOSO3HF42zA2yJ33dmlxwjk348E/edit?gid=391311781#gid=391311781',
    autoSyncSheet: false,
    bigsellerUrl: 'https://www.bigseller.com/web/order/index.htm?status=new'
  }
};

class Database {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return { ...defaultData, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.error('Error loading DB, creating default:', err);
    }
    this.save(defaultData);
    return defaultData;
  }

  save(data = this.data) {
    try {
      this.data = data;
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving DB:', err);
    }
  }

  // --- Orders ---
  getOrders(filter = {}) {
    let result = [...this.data.orders];
    if (filter.status) {
      result = result.filter(o => o.status === filter.status);
    }
    if (filter.cutoffDate) {
      result = result.filter(o => o.cutoffDate === filter.cutoffDate);
    }
    if (filter.platform) {
      result = result.filter(o => o.platform?.toLowerCase() === filter.platform.toLowerCase());
    }
    return result.sort((a, b) => new Date(b.orderTime || b.createdAt) - new Date(a.orderTime || a.createdAt));
  }

  getOrderById(id) {
    return this.data.orders.find(o => o.id === id || o.orderNumber === id);
  }

  upsertOrder(orderData) {
    const existingIndex = this.data.orders.findIndex(
      o => o.orderNumber === orderData.orderNumber && o.productName === orderData.productName
    );

    const quantity = Number(orderData.quantity) || 1;
    const pricePerUnit = Number(orderData.pricePerUnit) || 0;
    const shippingFee = Number(orderData.shippingFee) || 0;
    const totalCost = (quantity * pricePerUnit) + shippingFee;

    const record = {
      id: orderData.id || `ord-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      status: orderData.status || 'รอสั่ง',
      storeName: orderData.storeName || '',
      orderNumber: orderData.orderNumber || '',
      productName: orderData.productName || '',
      quantity,
      unit: orderData.unit || 'เส้น',
      supplier: orderData.supplier || '',
      extraNote: orderData.extraNote || '',
      pricePerUnit,
      shippingFee,
      platform: orderData.platform || 'Shopee',
      totalCost,
      slipUrl: orderData.slipUrl || '',
      slipUploadedAt: orderData.slipUploadedAt || null,
      orderTime: orderData.orderTime || new Date().toISOString(),
      cutoffDate: orderData.cutoffDate || new Date().toISOString().split('T')[0],
      syncedToSheet: orderData.syncedToSheet || false,
      syncedAt: orderData.syncedAt || null,
      updatedAt: new Date().toISOString()
    };

    // Auto-apply mapping if supplier/price not yet set
    if (!record.supplier || !record.pricePerUnit) {
      const match = this.findMatchingSupplier(record.productName);
      if (match) {
        if (!record.supplier) record.supplier = match.supplier;
        if (!record.pricePerUnit) record.pricePerUnit = match.pricePerUnit;
        if (!record.shippingFee && match.shippingFee) record.shippingFee = match.shippingFee;
        record.totalCost = (record.quantity * record.pricePerUnit) + record.shippingFee;
      }
    }

    if (existingIndex >= 0) {
      this.data.orders[existingIndex] = {
        ...this.data.orders[existingIndex],
        ...record,
        id: this.data.orders[existingIndex].id
      };
    } else {
      record.createdAt = new Date().toISOString();
      this.data.orders.push(record);
    }

    this.save();
    return existingIndex >= 0 ? this.data.orders[existingIndex] : record;
  }

  updateOrderStatus(id, status) {
    const order = this.data.orders.find(o => o.id === id);
    if (!order) return null;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  updateOrderPricing(id, { supplier, pricePerUnit, shippingFee, status, extraNote }) {
    const order = this.data.orders.find(o => o.id === id);
    if (!order) return null;

    if (supplier !== undefined) order.supplier = supplier;
    if (pricePerUnit !== undefined) order.pricePerUnit = Number(pricePerUnit) || 0;
    if (shippingFee !== undefined) order.shippingFee = Number(shippingFee) || 0;
    if (status !== undefined) order.status = status;
    if (extraNote !== undefined) order.extraNote = extraNote;

    order.totalCost = (order.quantity * order.pricePerUnit) + order.shippingFee;
    order.updatedAt = new Date().toISOString();

    // Auto-update or remember this mapping
    if (order.supplier && order.pricePerUnit > 0) {
      this.learnMapping(order.productName, order.supplier, order.pricePerUnit, order.shippingFee);
    }

    this.save();
    return order;
  }

  attachSlip(id, slipFilename) {
    const order = this.data.orders.find(o => o.id === id);
    if (!order) return null;
    order.slipUrl = `/uploads/slips/${slipFilename}`;
    order.slipUploadedAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  deleteOrder(id) {
    const index = this.data.orders.findIndex(o => o.id === id);
    if (index >= 0) {
      const removed = this.data.orders.splice(index, 1);
      this.save();
      return removed[0];
    }
    return null;
  }

  // --- Suppliers ---
  getSuppliers() {
    return this.data.suppliers;
  }

  addSupplier(supplier) {
    const newSup = {
      id: `sup-${Date.now()}`,
      name: supplier.name,
      phone: supplier.phone || '',
      note: supplier.note || ''
    };
    this.data.suppliers.push(newSup);
    this.save();
    return newSup;
  }

  deleteSupplier(id) {
    this.data.suppliers = this.data.suppliers.filter(s => s.id !== id && s.name !== id);
    this.save();
  }

  // --- Mappings & Memory ---
  getMappings() {
    return this.data.mappings;
  }

  findMatchingSupplier(productName) {
    if (!productName) return null;
    const lower = productName.toLowerCase();
    for (const m of this.data.mappings) {
      if (lower.includes(m.pattern.toLowerCase())) {
        return m;
      }
    }
    return null;
  }

  learnMapping(productName, supplier, pricePerUnit, shippingFee) {
    if (!productName || !supplier) return;
    
    // Extract key tire size pattern like "215/45R17" or brand if possible
    const sizeMatch = productName.match(/\d{3}\/\d{2,3}R\d{2}/i);
    const pattern = sizeMatch ? `${sizeMatch[0]}` : productName.slice(0, 25);

    const existing = this.data.mappings.find(m => m.pattern.toLowerCase() === pattern.toLowerCase());
    if (existing) {
      existing.supplier = supplier;
      existing.pricePerUnit = pricePerUnit;
      existing.shippingFee = shippingFee || existing.shippingFee || 0;
      existing.updatedAt = new Date().toISOString();
    } else {
      this.data.mappings.push({
        id: `map-${Date.now()}`,
        pattern,
        supplier,
        pricePerUnit,
        shippingFee: shippingFee || 0,
        createdAt: new Date().toISOString()
      });
    }
    this.save();
  }

  saveMapping(mapping) {
    const index = this.data.mappings.findIndex(m => m.id === mapping.id);
    if (index >= 0) {
      this.data.mappings[index] = { ...this.data.mappings[index], ...mapping };
    } else {
      this.data.mappings.push({
        id: `map-${Date.now()}`,
        ...mapping
      });
    }
    this.save();
  }

  deleteMapping(id) {
    this.data.mappings = this.data.mappings.filter(m => m.id !== id);
    this.save();
  }

  // --- Settings ---
  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }
}

module.exports = new Database();
