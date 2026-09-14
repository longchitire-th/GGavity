/**
 * วุ่นวายโภชนา V2.0 - Core Application Logic
 * Supports both standalone Cloudflare Pages (offline/localStorage) & Local Node API
 */

const STORAGE_KEY = 'wanwanwan_db_v2';
const SETTINGS_KEY = 'wanwanwan_settings_v2';

let state = {
  transactions: [],
  settings: {
    sheetId: '1Jdw2KQM18-dLCYWxu9hw0xzxXjzX2Qx2N3Wpa8qvWdc',
    sheetName: 'ข้อมูลดิบ',
    webhookUrl: 'https://script.google.com/macros/s/AKfycbzJS4YRUzMfSSH0aFenTlPG5J376isvgFxExEZvVynuPbAxRNALPVlue90VhhZrvPeE/exec',
    driveUrl: 'https://drive.google.com/drive/folders/1ZcJAGvFH53J0oRDY-Cw3ba-hN4_mIW1i?usp=sharing',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1Jdw2KQM18-dLCYWxu9hw0xzxXjzX2Qx2N3Wpa8qvWdc/edit?usp=drivesdk'
  },
  currentType: 'in', // 'in' or 'ex'
  isSyncing: false,
  isOnline: true
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  loadData();
  setupNavigation();
  setupForm();
  updateTopHero();

  // Set default date to today
  const dateInput = document.getElementById('txnDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
});

// --- Settings Management ---
function initSettings() {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error parsing settings:', e);
    }
  } else if (window.DEFAULT_SETTINGS) {
    state.settings = { ...state.settings, ...window.DEFAULT_SETTINGS };
  }
}

function saveSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

// --- Data Management (Storage & API) ---
function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state.transactions = JSON.parse(saved);
    } catch (e) {
      state.transactions = [];
    }
  }

  // If local storage is empty, initialize with 269 records from Google Drive
  if (!state.transactions || state.transactions.length === 0) {
    if (window.INITIAL_TRANSACTIONS && window.INITIAL_TRANSACTIONS.length > 0) {
      state.transactions = [...window.INITIAL_TRANSACTIONS];
      saveLocalData();
    }
  }

  renderRecentTransactions();
  updateTopHero();
  if (window.renderDashboard) window.renderDashboard();
  if (window.renderReport) window.renderReport();
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

// --- Add / Delete Transaction ---
function addTransaction(data) {
  const now = new Date();
  const dateStr = data.date || now.toISOString().split('T')[0];
  const dateCode = dateStr.replace(/-/g, '');
  const randSuffix = Math.random().toString(36).substring(2, 6);
  const id = `TXN-${dateCode}-${Date.now().toString().slice(-4)}-${randSuffix}`;

  const item = {
    id,
    date: dateStr,
    type: data.type || state.currentType,
    category: data.category || (state.currentType === 'in' ? 'ขายอาหาร' : 'อื่น ๆ'),
    description: (data.description || '').trim(),
    amount: Number(data.amount) || 0,
    boxes: data.boxes ? String(data.boxes) : '',
    channel: data.channel || 'เงินสด',
    recorder: 'แอปวุ่นวายโภชนา',
    note: data.note || ''
  };

  // Add to local state at the beginning
  state.transactions.unshift(item);
  saveLocalData();

  renderRecentTransactions();
  updateTopHero();
  if (window.renderDashboard) window.renderDashboard();
  if (window.renderReport) window.renderReport();

  // Async sync to Google Apps Script Webhook
  syncItemToGoogleSheet(item);

  return item;
}

function deleteTransaction(id) {
  if (!confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveLocalData();
  renderRecentTransactions();
  updateTopHero();
  if (window.renderDashboard) window.renderDashboard();
  if (window.renderReport) window.renderReport();
}

// --- Google Sheet Syncing ---
async function syncItemToGoogleSheet(item) {
  const url = state.settings.webhookUrl;
  if (!url) return;

  setSyncStatus('syncing', 'กำลังส่งขึ้นชีต Google…');
  try {
    const payload = {
      action: 'add',
      date: item.date,
      type: item.type === 'in' ? 'รายรับ' : 'รายจ่าย',
      category: item.category,
      description: item.description,
      amount: item.amount,
      boxes: item.boxes,
      channel: item.channel,
      note: item.note || 'บันทึกจากแอป V2.0'
    };

    // Use mode: no-cors or standard GET / POST
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    setSyncStatus('online', 'บันทึกลงชีตสำเร็จ');
  } catch (err) {
    console.warn('Sync warning:', err);
    setSyncStatus('offline', 'บันทึกในเครื่องแล้ว (จะซิงก์เมื่อต่อเน็ต)');
  }
}

async function syncAllFromGoogleSheet() {
  const url = state.settings.webhookUrl;
  if (!url) {
    alert('กรุณาระบุ URL ของ Google Webhook ในแท็บข้อมูล');
    return;
  }

  setSyncStatus('syncing', 'กำลังดึงข้อมูลจากชีต…');
  try {
    const res = await fetch(`${url}?t=${Date.now()}`);
    const json = await res.json();
    if (json.ok && Array.isArray(json.rows) && json.rows.length > 0) {
      // Map rows to state
      const mapped = json.rows.map(r => ({
        id: r.id || `TXN-${r.date}-${Math.random().toString(36).slice(2, 6)}`,
        date: r.date,
        type: r.type === 'รายรับ' || r.type === 'in' ? 'in' : 'ex',
        category: r.category || 'อื่น ๆ',
        description: r.description || '',
        amount: Number(r.amount) || 0,
        boxes: r.boxes ? String(r.boxes) : '',
        channel: r.channel || 'เงินสด',
        recorder: r.recorder || '',
        note: r.note || ''
      }));

      state.transactions = mapped;
      saveLocalData();
      renderRecentTransactions();
      updateTopHero();
      if (window.renderDashboard) window.renderDashboard();
      if (window.renderReport) window.renderReport();
      setSyncStatus('online', `อัปเดตแล้ว (${mapped.length} รายการ)`);
      alert(`ซิงก์ข้อมูลจาก Google Sheets สำเร็จ! (${mapped.length} รายการ)`);
    } else {
      setSyncStatus('online', 'ข้อมูลตรงกับชีตแล้ว');
      alert('ดึงข้อมูลสำเร็จ แต่ไม่มีแถวใหม่');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    setSyncStatus('offline', 'ออฟไลน์ (เปิดดูข้อมูลในเครื่องได้ปกติ)');
    alert('ไม่สามารถเชื่อมต่อ Google Apps Script ได้ในขณะนี้ ข้อมูลในเครื่องยังใช้งานได้ตามปกติครับ');
  }
}

function setSyncStatus(status, text) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncText');
  if (!dot || !label) return;

  dot.className = 'sync-dot ' + status;
  label.textContent = text;
}

// --- Navigation Tabs ---
function setupNavigation() {
  const tabs = document.querySelectorAll('[data-target]');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = tab.getAttribute('data-target');
      switchTab(targetId);
    });
  });
}

function switchTab(targetId) {
  // Update nav buttons
  document.querySelectorAll('[data-target]').forEach(btn => {
    if (btn.getAttribute('data-target') === targetId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Switch panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const targetPanel = document.getElementById(targetId);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // Trigger renders
  if (targetId === 'dashboard' && window.renderDashboard) window.renderDashboard();
  if (targetId === 'report' && window.renderReport) window.renderReport();
  if (targetId === 'ideas' && window.renderRecipes) window.renderRecipes();
  if (targetId === 'data' && window.renderDataTable) window.renderDataTable();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Form & Smart Suggestion ---
function setupForm() {
  const form = document.getElementById('addTxnForm');
  const typeIn = document.getElementById('typeInBtn');
  const typeEx = document.getElementById('typeExBtn');
  const catSelect = document.getElementById('txnCategory');
  const descInput = document.getElementById('txnDesc');
  const amtInput = document.getElementById('txnAmount');
  const boxesGroup = document.getElementById('boxesGroup');

  if (typeIn && typeEx) {
    typeIn.addEventListener('click', () => setFormType('in'));
    typeEx.addEventListener('click', () => setFormType('ex'));
  }

  // Smart Category Guessing
  if (descInput) {
    descInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      guessCategory(val);
    });
  }

  // Quick Chips
  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-text');
      const cat = chip.getAttribute('data-cat');
      const type = chip.getAttribute('data-type');

      if (type) setFormType(type);
      if (text && descInput) descInput.value = text;
      if (cat && catSelect) catSelect.value = cat;

      if (amtInput) amtInput.focus();
    });
  });

  // Date buttons
  const todayBtn = document.getElementById('setTodayBtn');
  const yestBtn = document.getElementById('setYesterdayBtn');
  const dateInput = document.getElementById('txnDate');

  if (todayBtn && dateInput) {
    todayBtn.addEventListener('click', () => {
      dateInput.value = new Date().toISOString().split('T')[0];
    });
  }
  if (yestBtn && dateInput) {
    yestBtn.addEventListener('click', () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      dateInput.value = y.toISOString().split('T')[0];
    });
  }

  // Submit
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(amtInput.value);
      if (!amount || amount <= 0) {
        alert('กรุณาระบุจำนวนเงินที่มากกว่า 0');
        amtInput.focus();
        return;
      }

      const desc = descInput.value.trim();
      if (!desc) {
        alert('กรุณาระบุชื่อรายการ');
        descInput.focus();
        return;
      }

      addTransaction({
        date: dateInput.value,
        type: state.currentType,
        category: catSelect.value,
        description: desc,
        amount: amount,
        boxes: document.getElementById('txnBoxes')?.value || '',
        channel: document.getElementById('txnChannel')?.value || 'เงินสด',
        note: document.getElementById('txnNote')?.value || ''
      });

      // Clear & focus
      amtInput.value = '';
      descInput.value = '';
      if (document.getElementById('txnBoxes')) document.getElementById('txnBoxes').value = '';
      if (document.getElementById('txnNote')) document.getElementById('txnNote').value = '';
      descInput.focus();
    });
  }
}

function setFormType(type) {
  state.currentType = type;
  const typeIn = document.getElementById('typeInBtn');
  const typeEx = document.getElementById('typeExBtn');
  const catSelect = document.getElementById('txnCategory');
  const boxesGroup = document.getElementById('boxesGroup');

  if (type === 'in') {
    typeIn.classList.add('active', 'in');
    typeEx.classList.remove('active', 'ex');
    if (boxesGroup) boxesGroup.style.display = 'block';
    if (catSelect) catSelect.value = 'ขายอาหาร';
  } else {
    typeEx.classList.add('active', 'ex');
    typeIn.classList.remove('active', 'in');
    if (boxesGroup) boxesGroup.style.display = 'none';
    if (catSelect) catSelect.value = 'วัตถุดิบ';
  }
}

function guessCategory(text) {
  const catSelect = document.getElementById('txnCategory');
  if (!catSelect || !text) return;

  const t = text.toLowerCase();
  if (t.includes('ก๋วยเตี๋ยว') && (t.includes('ส่ง') || t.includes('ขาย') || t.includes('ออเดอร์'))) {
    setFormType('in');
    catSelect.value = 'ขายอาหาร';
  } else if (t.includes('หมู') || t.includes('ไก่') || t.includes('ผัก') || t.includes('เส้น') || t.includes('เครื่องปรุง') || t.includes('ลูกชิ้น') || t.includes('เลือด') || t.includes('กระเทียม') || t.includes('พริก') || t.includes('ถั่วงอก') || t.includes('มะนาว')) {
    setFormType('ex');
    catSelect.value = 'วัตถุดิบ';
  } else if (t.includes('ถุง') || t.includes('กล่อง') || t.includes('ชาม') || t.includes('ช้อน') || t.includes('ตะเกียบ') || t.includes('ยางรัด')) {
    setFormType('ex');
    catSelect.value = 'กล่อง/ถุง';
  } else if (t.includes('รถ') || t.includes('ส่ง') || t.includes('น้ำมัน') || t.includes('วิน') || t.includes('แกร็บ') || t.includes('ไป-กลับ')) {
    setFormType('ex');
    catSelect.value = 'ค่าส่ง/ค่ารถ';
  } else if (t.includes('ส่วนตัว') || t.includes('ซักผ้า') || t.includes('บุหรี่') || t.includes('atome') || t.includes('เสื้อผ้า')) {
    setFormType('ex');
    catSelect.value = 'ค่าใช้จ่ายส่วนตัว';
  }
}

// --- Top Hero Banner ---
function updateTopHero() {
  const currentMonth = new Date().toISOString().substring(0, 7);
  let inSum = 0;
  let exSum = 0;

  state.transactions.forEach(t => {
    if (t.date && t.date.startsWith(currentMonth)) {
      if (t.type === 'in') inSum += t.amount;
      else exSum += t.amount;
    }
  });

  const balance = inSum - exSum;
  const margin = inSum > 0 ? ((balance / inSum) * 100).toFixed(1) : '0.0';

  const heroBal = document.getElementById('heroBalance');
  const heroIn = document.getElementById('heroIncome');
  const heroEx = document.getElementById('heroExpense');
  const heroMargin = document.getElementById('heroMargin');
  const heroMonth = document.getElementById('heroMonthName');

  if (heroBal) {
    heroBal.textContent = `${balance >= 0 ? '+' : ''}${formatMoney(balance)} ฿`;
    heroBal.className = `hero-balance ${balance >= 0 ? 'green' : 'red'}`;
  }
  if (heroIn) heroIn.textContent = formatMoney(inSum);
  if (heroEx) heroEx.textContent = formatMoney(exSum);
  if (heroMargin) heroMargin.textContent = `${margin}%`;

  if (heroMonth) {
    const d = new Date();
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    heroMonth.textContent = `${thMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  }
}

// --- Render Recent Transactions on Add Tab ---
function renderRecentTransactions() {
  const container = document.getElementById('recentTxnList');
  if (!container) return;

  const today = new Date().toISOString().split('T')[0];
  const items = state.transactions.slice(0, 15); // Show top 15 recent

  if (items.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-dim);">ยังไม่มีรายการบันทึก</div>';
    return;
  }

  container.innerHTML = items.map(item => {
    const isIn = item.type === 'in';
    return `
      <div class="txn-item">
        <div class="txn-left">
          <div class="txn-icon ${isIn ? 'in' : 'ex'}">
            ${isIn ? '💰' : '🛒'}
          </div>
          <div class="txn-details">
            <div class="txn-desc">${escapeHtml(item.description)}</div>
            <div class="txn-meta">
              <span>${item.date}</span>
              <span class="badge">${escapeHtml(item.category)}</span>
              ${item.boxes ? `<span class="badge">${item.boxes} กล่อง</span>` : ''}
              ${item.channel ? `<span class="badge">${item.channel}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="txn-right">
          <div class="txn-amount ${isIn ? 'green' : 'red'}">
            ${isIn ? '+' : '-'}${formatMoney(item.amount)} ฿
          </div>
          <button class="btn-del" onclick="deleteTransaction('${item.id}')" title="ลบรายการ">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// --- Utility Functions ---
function formatMoney(num) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Export CSV for Thai Excel
function exportCsv() {
  const headers = ['รหัสอัตโนมัติ', 'วันที่', 'ประเภท', 'หมวด', 'รายการ', 'จำนวนเงิน (บาท)', 'จำนวนกล่อง', 'ช่องทางรับ/จ่าย', 'ผู้บันทึก', 'หมายเหตุ'];
  const rows = state.transactions.map(t => [
    t.id || '',
    t.date || '',
    t.type === 'in' ? 'รายรับ' : 'รายจ่าย',
    t.category || '',
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.amount || 0,
    t.boxes || '',
    t.channel || '',
    `"${(t.recorder || '').replace(/"/g, '""')}"`,
    `"${(t.note || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `วุ่นวายโภชนา_ข้อมูลดิบ_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export JSON Backup
function exportJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.transactions, null, 2));
  const a = document.createElement('a');
  a.href = dataStr;
  a.download = `wanwanwan_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Expose state globally for dashboard/report modules
window.AppState = state;
window.formatMoney = formatMoney;
window.escapeHtml = escapeHtml;
window.deleteTransaction = deleteTransaction;
window.syncAllFromGoogleSheet = syncAllFromGoogleSheet;
window.exportCsv = exportCsv;
window.exportJson = exportJson;
window.switchTab = switchTab;
