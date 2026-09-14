const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function getDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { transactions: [], settings: {} };
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return { transactions: [], settings: {} };
  }
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving db.json:', err);
    return false;
  }
}

function getAllTransactions(query = {}) {
  const db = getDb();
  let list = db.transactions || [];

  if (query.date) {
    list = list.filter(t => t.date === query.date);
  }
  if (query.month) {
    list = list.filter(t => t.date && t.date.startsWith(query.month));
  }
  if (query.type) {
    list = list.filter(t => t.type === query.type);
  }
  if (query.category) {
    list = list.filter(t => t.category === query.category);
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    list = list.filter(t => 
      (t.description && t.description.toLowerCase().includes(s)) ||
      (t.category && t.category.toLowerCase().includes(s)) ||
      (t.id && t.id.toLowerCase().includes(s)) ||
      (t.note && t.note.toLowerCase().includes(s))
    );
  }

  // Sort descending by date, then id
  return list.sort((a, b) => {
    if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
    return (b.id || '').localeCompare(a.id || '');
  });
}

function addTransaction(item) {
  const db = getDb();
  if (!db.transactions) db.transactions = [];

  const now = new Date();
  const dateStr = item.date || now.toISOString().split('T')[0];
  const dateCode = dateStr.replace(/-/g, '');
  const randSuffix = Math.random().toString(36).substring(2, 6);
  const id = item.id || `TXN-${dateCode}-${Date.now().toString().slice(-4)}-${randSuffix}`;

  const newTxn = {
    id,
    date: dateStr,
    type: item.type === 'in' || item.type === 'รายรับ' ? 'in' : 'ex',
    category: item.category || (item.type === 'in' ? 'ขายอาหาร' : 'อื่น ๆ'),
    description: (item.description || '').trim(),
    amount: Number(item.amount) || 0,
    boxes: item.boxes || '',
    channel: item.channel || 'เงินสด',
    recorder: item.recorder || 'ผู้ใช้',
    note: item.note || ''
  };

  db.transactions.unshift(newTxn);
  saveDb(db);
  return newTxn;
}

function updateTransaction(id, updates) {
  const db = getDb();
  const idx = (db.transactions || []).findIndex(t => t.id === id);
  if (idx === -1) return null;

  const current = db.transactions[idx];
  db.transactions[idx] = {
    ...current,
    ...updates,
    id: current.id,
    amount: updates.amount !== undefined ? Number(updates.amount) : current.amount
  };
  saveDb(db);
  return db.transactions[idx];
}

function deleteTransaction(id) {
  const db = getDb();
  const initialLen = (db.transactions || []).length;
  db.transactions = (db.transactions || []).filter(t => t.id !== id);
  if (db.transactions.length !== initialLen) {
    saveDb(db);
    return true;
  }
  return false;
}

function getSettings() {
  const db = getDb();
  return db.settings || {};
}

function updateSettings(settings) {
  const db = getDb();
  db.settings = { ...(db.settings || {}), ...settings };
  saveDb(db);
  return db.settings;
}

module.exports = {
  getDb,
  saveDb,
  getAllTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getSettings,
  updateSettings
};
