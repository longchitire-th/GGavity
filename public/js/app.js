// Daily Tire Purchasing App - Client Script
let state = {
  orders: [],
  suppliers: [],
  mappings: [],
  analytics: null,
  activeOrderIdForSlip: null,
  selectedSlipFile: null
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initLucide();
  setupEventListeners();
  await loadInitialData();
});

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function loadInitialData() {
  await Promise.all([
    fetchOrders(),
    fetchSuppliers(),
    fetchMappings(),
    fetchAnalytics(),
    fetchSettings(),
    fetchNetworkInfo()
  ]);
}

// ==========================================
// DATA FETCHING
// ==========================================
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const json = await res.json();
    if (json.success) {
      state.orders = json.data;
      renderOrders();
      updateKpis();
    }
  } catch (err) {
    showToast('โหลดข้อมูลออเดอร์ไม่สำเร็จ: ' + err.message, 'error');
  }
}

async function fetchSuppliers() {
  try {
    const res = await fetch('/api/suppliers');
    const json = await res.json();
    if (json.success) {
      state.suppliers = json.data;
      renderSuppliers();
      updateSuppliersDatalist();
    }
  } catch (err) {
    console.error('Error fetching suppliers:', err);
  }
}

async function fetchMappings() {
  try {
    const res = await fetch('/api/mappings');
    const json = await res.json();
    if (json.success) {
      state.mappings = json.data;
      renderMappings();
    }
  } catch (err) {
    console.error('Error fetching mappings:', err);
  }
}

async function fetchAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    const json = await res.json();
    if (json.success) {
      state.analytics = json.data;
      renderAnalytics();
      updateKpis();
    }
  } catch (err) {
    console.error('Error fetching analytics:', err);
  }
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success && json.data) {
      const el = document.getElementById('settingWebhookUrl');
      if (el) el.value = json.data.googleSheetWebhook || '';
    }

    // Load Apps Script code
    const scriptRes = await fetch('/api/sheets/script-template');
    const scriptJson = await scriptRes.json();
    if (scriptJson.success) {
      const codeEl = document.getElementById('appsScriptCode');
      if (codeEl) codeEl.innerText = scriptJson.script;
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/system/network-info');
    const json = await res.json();
    if (json.success) {
      const qrImg = document.getElementById('qrImage');
      const qrUrl = document.getElementById('qrLocalUrl');
      if (qrImg) qrImg.src = json.qrDataUrl;
      if (qrUrl) qrUrl.innerText = json.localUrl;
    }
  } catch (err) {
    console.error('Error fetching network info:', err);
  }
}

// ==========================================
// RENDERING FUNCTIONS
// ==========================================
function updateKpis() {
  if (!state.analytics || !state.analytics.today) {
    document.getElementById('statTiresCount').innerText = state.orders.reduce((sum, o) => sum + (o.quantity || 1), 0);
    document.getElementById('statTotalExpense').innerText = '฿' + state.orders.reduce((sum, o) => sum + (o.totalCost || 0), 0).toLocaleString();
    return;
  }

  const t = state.analytics.today;
  document.getElementById('statTiresCount').innerText = t.totalTiresCount;
  document.getElementById('statTotalExpense').innerText = '฿' + t.totalExpense.toLocaleString();
  document.getElementById('statReadyCount').innerText = t.readyCount;
  document.getElementById('statOutOfStockCount').innerText = t.outOfStockCount;
  document.getElementById('statSlipsCount').innerText = t.slipsUploadedCount;
  document.getElementById('statSlipsTotal').innerText = `/ ${t.totalOrders} รายการ`;
  document.getElementById('badgeOrderCount').innerText = state.orders.length;
}

function renderOrders() {
  const tbody = document.getElementById('ordersTableBody');
  const cardsContainer = document.getElementById('ordersCardsContainer');
  const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const statusFilter = document.getElementById('filterStatus')?.value || '';
  const platformFilter = document.getElementById('filterPlatform')?.value || '';

  let filtered = state.orders.filter(o => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (platformFilter && o.platform !== platformFilter) return false;
    if (search) {
      const full = `${o.orderNumber} ${o.productName} ${o.storeName} ${o.supplier}`.toLowerCase();
      if (!full.includes(search)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    const emptyHtml = `
      <div class="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 p-6">
        <i data-lucide="package-open" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
        <p class="text-xs sm:text-sm">ไม่พบคำสั่งซื้อในรอบเวลานี้ สามารถกด "ดึงออเดอร์" หรือ "จำลองข้อมูล" ด้านบน</p>
      </div>
    `;
    if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" class="py-12 text-center text-slate-400">ไม่พบคำสั่งซื้อในรอบเวลานี้</td></tr>`;
    }
    initLucide();
    return;
  }

  // 1. Render Mobile Cards (< lg)
  if (cardsContainer) {
    cardsContainer.innerHTML = filtered.map(order => {
      const total = (Number(order.quantity) || 1) * (Number(order.pricePerUnit) || 0) + (Number(order.shippingFee) || 0);

      let statusBorderClass = 'border-amber-300 bg-amber-50 text-amber-800';
      if (order.status === 'สั่งแล้ว (ส่งได้)' || order.status === 'สั่งแล้ว' || order.status === 'ส่งได้') {
        statusBorderClass = 'border-emerald-300 bg-emerald-50 text-emerald-800';
      } else if (order.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || order.status === 'ขาดตลาด' || order.status === 'ยกเลิก') {
        statusBorderClass = 'border-rose-300 bg-rose-50 text-rose-800';
      }

      const platformBadge = order.platform === 'Lazada' 
        ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Lazada</span>`
        : `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Shopee</span>`;

      const checkPriceLink = order.platform === 'Lazada'
        ? `https://sellercenter.lazada.co.th/order/detail/${order.orderNumber}`
        : `https://seller.shopee.co.th/portal/sale/order`;

      const slipSection = order.slipUrl
        ? `
          <div class="flex items-center gap-2">
            <img src="${order.slipUrl}" class="w-12 h-12 rounded-lg border border-slate-200 object-cover cursor-pointer hover:scale-105 transition" onclick="viewSlip('${order.slipUrl}')" title="แตะดูรูปสลิป">
            <button onclick="openSlipUpload('${order.id}')" class="text-xs text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg font-medium">
              เปลี่ยนรูป
            </button>
          </div>
        `
        : `
          <button onclick="openSlipUpload('${order.id}')" class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition active:scale-[0.98]">
            <i data-lucide="camera" class="w-4 h-4"></i>
            <span>ถ่ายสลิป</span>
          </button>
        `;

      return `
        <div class="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-sm space-y-3" id="card-${order.id}">
          <!-- Top Row: Status & Platform & Check Price -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs font-bold rounded-lg border px-2.5 py-1 focus:outline-none ${statusBorderClass}">
                <option value="รอสั่ง" ${order.status === 'รอสั่ง' ? 'selected' : ''}>⏳ รอสั่ง</option>
                <option value="สั่งแล้ว (ส่งได้)" ${order.status === 'สั่งแล้ว (ส่งได้)' || order.status === 'สั่งแล้ว' || order.status === 'ส่งได้' ? 'selected' : ''}>✅ พร้อมส่ง</option>
                <option value="สินค้าขาดตลาด (ส่งไม่ได้)" ${order.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || order.status === 'ขาดตลาด' ? 'selected' : ''}>❌ ขาดตลาด</option>
              </select>
              ${platformBadge}
            </div>

            <a href="${checkPriceLink}" target="_blank" class="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition">
              <span>ตรวจราคา</span>
              <i data-lucide="external-link" class="w-3 h-3"></i>
            </a>
          </div>

          <!-- Order No & Store -->
          <div class="flex items-center justify-between text-xs text-slate-500 pt-0.5">
            <span class="font-mono font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
              #${order.orderNumber}
              <button onclick="copyToClipboard('${order.orderNumber}')" class="text-slate-400 hover:text-slate-600 p-0.5" title="คัดลอก">
                <i data-lucide="copy" class="w-3 h-3"></i>
              </button>
            </span>
            <span class="truncate max-w-[150px] font-medium text-slate-600">${order.storeName || '-'}</span>
          </div>

          <!-- Product Title & Quantity -->
          <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start justify-between gap-2">
            <p class="font-bold text-slate-900 text-xs sm:text-sm leading-snug">${order.productName}</p>
            <span class="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0">
              ${order.quantity || 1} ${order.unit || 'เส้น'}
            </span>
          </div>

          <!-- Supplier & Pricing Inputs -->
          <div class="space-y-2 pt-1">
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">ร้านซับ (Supplier):</label>
              <input 
                type="text" 
                list="suppliersDataList" 
                value="${order.supplier || ''}" 
                placeholder="แตะเพื่อเลือกร้านซับ..." 
                onchange="saveMobileOrderPricing('${order.id}')" 
                id="mobile-supplier-${order.id}" 
                class="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">ราคาต้นทุน/เส้น (฿):</label>
                <input 
                  type="number" 
                  value="${order.pricePerUnit || ''}" 
                  placeholder="0" 
                  min="0"
                  oninput="recalcMobileRow('${order.id}', ${order.quantity || 1})" 
                  onchange="saveMobileOrderPricing('${order.id}')" 
                  id="mobile-price-${order.id}" 
                  class="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white font-bold text-slate-900 text-right focus:ring-2 focus:ring-blue-500 focus:outline-none">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">ค่าขนส่ง (฿):</label>
                <input 
                  type="number" 
                  value="${order.shippingFee || 0}" 
                  placeholder="0" 
                  min="0"
                  oninput="recalcMobileRow('${order.id}', ${order.quantity || 1})" 
                  onchange="saveMobileOrderPricing('${order.id}')" 
                  id="mobile-shipping-${order.id}" 
                  class="w-full text-xs sm:text-sm px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white text-slate-700 text-right focus:ring-2 focus:ring-blue-500 focus:outline-none">
              </div>
            </div>
          </div>

          <!-- Bottom: Total & Slip Upload -->
          <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-400 block">ยอดรวมจ่ายค่ายาง:</span>
              <span class="text-base sm:text-lg font-bold text-emerald-600" id="mobile-total-${order.id}">
                ฿${total.toLocaleString()}
              </span>
            </div>
            
            ${slipSection}
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Render Desktop Table (>= lg)
  if (tbody) {
    tbody.innerHTML = filtered.map(order => {
      const total = (Number(order.quantity) || 1) * (Number(order.pricePerUnit) || 0) + (Number(order.shippingFee) || 0);

      let statusClass = 'border-amber-300 bg-amber-50 text-amber-800';
      if (order.status === 'สั่งแล้ว (ส่งได้)' || order.status === 'สั่งแล้ว' || order.status === 'ส่งได้') {
        statusClass = 'border-emerald-300 bg-emerald-50 text-emerald-800';
      } else if (order.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || order.status === 'ขาดตลาด' || order.status === 'ยกเลิก') {
        statusClass = 'border-rose-300 bg-rose-50 text-rose-800';
      }

      const platformBadge = order.platform === 'Lazada' 
        ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">Lazada</span>`
        : `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">Shopee</span>`;

      const checkPriceLink = order.platform === 'Lazada'
        ? `https://sellercenter.lazada.co.th/order/detail/${order.orderNumber}`
        : `https://seller.shopee.co.th/portal/sale/order`;

      const slipDisplay = order.slipUrl
        ? `
          <div class="flex items-center justify-center gap-1">
            <img src="${order.slipUrl}" class="w-8 h-8 rounded border border-slate-200 object-cover cursor-pointer hover:scale-110 transition slip-thumbnail" onclick="viewSlip('${order.slipUrl}')" title="คลิกดูรูปสลิป">
            <button onclick="openSlipUpload('${order.id}')" class="text-slate-400 hover:text-blue-600 p-1" title="เปลี่ยนสลิป">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `
        : `
          <button onclick="openSlipUpload('${order.id}')" class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 border border-slate-200 rounded-lg transition">
            <i data-lucide="camera" class="w-3.5 h-3.5 text-blue-500"></i>
            <span>แนบสลิป</span>
          </button>
        `;

      return `
        <tr class="hover:bg-slate-50/80 transition" id="row-${order.id}">
          <td class="py-2.5 px-3">
            <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs font-semibold rounded-lg border px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none ${statusClass}">
              <option value="รอสั่ง" ${order.status === 'รอสั่ง' ? 'selected' : ''}>⏳ รอสั่ง</option>
              <option value="สั่งแล้ว (ส่งได้)" ${order.status === 'สั่งแล้ว (ส่งได้)' || order.status === 'สั่งแล้ว' ? 'selected' : ''}>✅ พร้อมส่ง</option>
              <option value="สินค้าขาดตลาด (ส่งไม่ได้)" ${order.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || order.status === 'ขาดตลาด' ? 'selected' : ''}>❌ ขาดตลาด</option>
            </select>
          </td>
          <td class="py-2.5 px-3">
            <div class="flex flex-col">
              <span class="font-medium text-slate-800 text-xs truncate max-w-[150px]" title="${order.storeName}">${order.storeName || '-'}</span>
              <div class="flex items-center gap-1.5 mt-0.5">
                ${platformBadge}
                <a href="${checkPriceLink}" target="_blank" class="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-0.5" title="คลิกเพื่อตรวจเช็กราคาจริง">
                  <span>ตรวจราคา</span>
                  <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                </a>
              </div>
            </div>
          </td>
          <td class="py-2.5 px-3 font-mono text-xs text-slate-700">
            <div class="flex items-center gap-1">
              <span class="truncate max-w-[120px]" title="${order.orderNumber}">${order.orderNumber}</span>
              <button onclick="copyToClipboard('${order.orderNumber}')" class="text-slate-400 hover:text-slate-600 p-0.5">
                <i data-lucide="copy" class="w-3 h-3"></i>
              </button>
            </div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-medium text-slate-900 leading-snug">${order.productName}</div>
          </td>
          <td class="py-2.5 px-2 text-center">
            <span class="inline-block px-2 py-0.5 font-bold text-slate-800 bg-slate-100 rounded text-xs">
              ${order.quantity || 1} ${order.unit || 'เส้น'}
            </span>
          </td>
          <td class="py-2.5 px-3">
            <input 
              type="text" 
              list="suppliersDataList" 
              value="${order.supplier || ''}" 
              placeholder="เลือกร้านซับ..." 
              onchange="saveOrderPricing('${order.id}')" 
              id="supplier-${order.id}" 
              class="w-full text-xs px-2 py-1 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 focus:bg-white font-medium text-slate-800">
          </td>
          <td class="py-2.5 px-3">
            <input 
              type="number" 
              value="${order.pricePerUnit || ''}" 
              placeholder="0" 
              min="0" 
              oninput="recalcRow('${order.id}', ${order.quantity || 1})" 
              onchange="saveOrderPricing('${order.id}')" 
              id="price-${order.id}" 
              class="w-20 text-xs px-2 py-1 text-right border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 focus:bg-white font-semibold text-slate-800">
          </td>
          <td class="py-2.5 px-2">
            <input 
              type="number" 
              value="${order.shippingFee || 0}" 
              placeholder="0" 
              min="0" 
              oninput="recalcRow('${order.id}', ${order.quantity || 1})" 
              onchange="saveOrderPricing('${order.id}')" 
              id="shipping-${order.id}" 
              class="w-16 text-xs px-2 py-1 text-right border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 focus:bg-white text-slate-600">
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="font-bold text-slate-900 text-xs sm:text-sm" id="total-${order.id}">
              ฿${total.toLocaleString()}
            </span>
          </td>
          <td class="py-2.5 px-3 text-center">
            ${slipDisplay}
          </td>
          <td class="py-2.5 px-2 text-center">
            <button onclick="deleteOrder('${order.id}')" class="text-slate-400 hover:text-red-600 p-1 transition" title="ลบรายการ">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  initLucide();
}

function recalcRow(orderId, qty) {
  const price = Number(document.getElementById(`price-${orderId}`)?.value) || 0;
  const shipping = Number(document.getElementById(`shipping-${orderId}`)?.value) || 0;
  const total = (qty * price) + shipping;
  const totalEl = document.getElementById(`total-${orderId}`);
  if (totalEl) totalEl.innerText = '฿' + total.toLocaleString();
}

function recalcMobileRow(orderId, qty) {
  const price = Number(document.getElementById(`mobile-price-${orderId}`)?.value) || 0;
  const shipping = Number(document.getElementById(`mobile-shipping-${orderId}`)?.value) || 0;
  const total = (qty * price) + shipping;
  const totalEl = document.getElementById(`mobile-total-${orderId}`);
  if (totalEl) totalEl.innerText = '฿' + total.toLocaleString();
}

async function saveOrderPricing(orderId) {
  const supplier = document.getElementById(`supplier-${orderId}`)?.value || '';
  const pricePerUnit = Number(document.getElementById(`price-${orderId}`)?.value) || 0;
  const shippingFee = Number(document.getElementById(`shipping-${orderId}`)?.value) || 0;

  try {
    const res = await fetch(`/api/orders/${orderId}/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier, pricePerUnit, shippingFee })
    });
    const json = await res.json();
    if (json.success) {
      const idx = state.orders.findIndex(o => o.id === orderId);
      if (idx >= 0) state.orders[idx] = json.data;
      updateKpis();
      fetchAnalytics();
      showToast('บันทึกข้อมูลเรียบร้อย');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error');
  }
}

async function saveMobileOrderPricing(orderId) {
  const supplier = document.getElementById(`mobile-supplier-${orderId}`)?.value || '';
  const pricePerUnit = Number(document.getElementById(`mobile-price-${orderId}`)?.value) || 0;
  const shippingFee = Number(document.getElementById(`mobile-shipping-${orderId}`)?.value) || 0;

  try {
    const res = await fetch(`/api/orders/${orderId}/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier, pricePerUnit, shippingFee })
    });
    const json = await res.json();
    if (json.success) {
      const idx = state.orders.findIndex(o => o.id === orderId);
      if (idx >= 0) state.orders[idx] = json.data;
      updateKpis();
      fetchAnalytics();
      showToast('บันทึกข้อมูลเรียบร้อย');
    }
  } catch (err) {
    showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const json = await res.json();
    if (json.success) {
      const idx = state.orders.findIndex(o => o.id === orderId);
      if (idx >= 0) state.orders[idx] = json.data;
      renderOrders();
      updateKpis();
      fetchAnalytics();
      showToast(`เปลี่ยนสถานะเป็น "${newStatus}" แล้ว`);
    }
  } catch (err) {
    showToast('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message, 'error');
  }
}

async function deleteOrder(orderId) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบคำสั่งซื้อนี้?')) return;
  try {
    const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      state.orders = state.orders.filter(o => o.id !== orderId);
      renderOrders();
      updateKpis();
      fetchAnalytics();
      showToast('ลบรายการสำเร็จ');
    }
  } catch (err) {
    showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
  }
}

// ==========================================
// SUPPLIERS & MAPPINGS
// ==========================================
function updateSuppliersDatalist() {
  const datalist = document.getElementById('suppliersDataList');
  if (!datalist) return;
  datalist.innerHTML = state.suppliers.map(s => `<option value="${s.name}">`).join('');
}

function renderSuppliers() {
  const container = document.getElementById('suppliersContainer');
  if (!container) return;

  if (state.suppliers.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 col-span-3">ยังไม่มีร้านซับในระบบ</p>`;
    return;
  }

  container.innerHTML = state.suppliers.map(sup => `
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-start">
      <div>
        <h4 class="font-bold text-slate-800 text-xs sm:text-sm">${sup.name}</h4>
        ${sup.phone ? `<p class="text-xs text-slate-500 mt-0.5">📞 ${sup.phone}</p>` : ''}
        ${sup.note ? `<p class="text-xs text-slate-400 mt-0.5">${sup.note}</p>` : ''}
      </div>
      <button onclick="deleteSupplier('${sup.id}')" class="text-slate-400 hover:text-red-500 p-1" title="ลบร้านซับ">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');
  initLucide();
}

function renderMappings() {
  const tbody = document.getElementById('mappingsTableBody');
  if (!tbody) return;

  if (state.mappings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">ยังไม่มีการตั้งค่าคู่มือจับคู่</td></tr>`;
    return;
  }

  tbody.innerHTML = state.mappings.map(m => `
    <tr class="hover:bg-slate-50">
      <td class="py-2.5 px-3 font-semibold text-slate-800">${m.pattern}</td>
      <td class="py-2.5 px-3 font-medium text-blue-700">${m.supplier}</td>
      <td class="py-2.5 px-3 font-bold text-slate-800">฿${(m.pricePerUnit || 0).toLocaleString()}</td>
      <td class="py-2.5 px-3 text-slate-600">฿${(m.shippingFee || 0).toLocaleString()}</td>
      <td class="py-2.5 px-3 text-xs text-slate-500">${m.note || '-'}</td>
      <td class="py-2.5 px-3 text-center">
        <button onclick="deleteMapping('${m.id}')" class="text-slate-400 hover:text-red-500 p-1">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');
  initLucide();
}

async function deleteSupplier(id) {
  if (!confirm('ต้องการลบร้านซับนี้ใช่หรือไม่?')) return;
  try {
    await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
    state.suppliers = state.suppliers.filter(s => s.id !== id);
    renderSuppliers();
    updateSuppliersDatalist();
    showToast('ลบร้านซับสำเร็จ');
  } catch (err) {
    showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
  }
}

async function deleteMapping(id) {
  if (!confirm('ต้องการลบการจับคู่นี้ใช่หรือไม่?')) return;
  try {
    await fetch(`/api/mappings/${id}`, { method: 'DELETE' });
    state.mappings = state.mappings.filter(m => m.id !== id);
    renderMappings();
    showToast('ลบคู่มือจับคู่สำเร็จ');
  } catch (err) {
    showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
  }
}

// ==========================================
// ANALYTICS & REPORTS
// ==========================================
function renderAnalytics() {
  if (!state.analytics) return;

  // 1. Best Sellers
  const bestList = document.getElementById('bestSellersList');
  if (bestList) {
    if (state.analytics.bestSellers.length === 0) {
      bestList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">ยังไม่มีข้อมูลสถิติ</p>`;
    } else {
      bestList.innerHTML = state.analytics.bestSellers.map((item, idx) => `
        <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
          <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${idx === 0 ? 'bg-amber-400 text-amber-950' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-600'}">
              ${idx + 1}
            </span>
            <div class="min-w-0">
              <p class="font-medium text-slate-900 text-xs truncate">${item.name}</p>
              <p class="text-[11px] text-slate-500">มียอดสั่ง ${item.orderCount} ครั้ง</p>
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <span class="font-bold text-slate-900 text-xs sm:text-sm">${item.totalQty} เส้น</span>
            <p class="text-[11px] text-slate-500">฿${(item.totalSpent || 0).toLocaleString()}</p>
          </div>
        </div>
      `).join('');
    }
  }

  // 2. Out of Stock Frequent
  const outList = document.getElementById('outOfStockList');
  if (outList) {
    if (state.analytics.outOfStockFrequent.length === 0) {
      outList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">ไม่มีสินค้าขาดตลาดในขณะนี้ เยี่ยมมาก!</p>`;
    } else {
      outList.innerHTML = state.analytics.outOfStockFrequent.map((item, idx) => `
        <div class="flex items-center justify-between p-2.5 bg-rose-50/50 rounded-xl border border-rose-100">
          <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span class="w-6 h-6 rounded-full bg-rose-200 text-rose-800 flex items-center justify-center font-bold text-xs flex-shrink-0">
              ${idx + 1}
            </span>
            <div class="min-w-0">
              <p class="font-medium text-slate-900 text-xs truncate">${item.name}</p>
              <p class="text-[11px] text-rose-600 font-medium">ของหมด ${item.outOfStockCount} ครั้ง</p>
            </div>
          </div>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700 flex-shrink-0">ขาดบ่อย</span>
        </div>
      `).join('');
    }
  }

  // 3. Supplier Expenses
  const supList = document.getElementById('supplierExpenseList');
  if (supList) {
    if (state.analytics.supplierBreakdown.length === 0) {
      supList.innerHTML = `<p class="text-xs text-slate-400 col-span-3 text-center py-4">ยังไม่มีข้อมูลรายจ่ายแยกตามซับ</p>`;
    } else {
      supList.innerHTML = state.analytics.supplierBreakdown.map(sup => `
        <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
          <div class="flex justify-between items-start mb-1.5">
            <h4 class="font-bold text-slate-900 text-xs sm:text-sm truncate">${sup.supplier}</h4>
            <span class="text-[11px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full flex-shrink-0">${sup.tireQty} เส้น</span>
          </div>
          <div class="flex items-baseline justify-between mt-2 pt-2 border-t border-slate-200">
            <span class="text-[11px] text-slate-500">ยอดที่ต้องชำระ:</span>
            <span class="text-sm sm:text-base font-bold text-emerald-600">฿${sup.totalCost.toLocaleString()}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // 4. Slip Gallery
  const slipGrid = document.getElementById('slipGalleryGrid');
  if (slipGrid) {
    const ordersWithSlips = state.orders.filter(o => o.slipUrl);
    if (ordersWithSlips.length === 0) {
      slipGrid.innerHTML = `<p class="text-xs text-slate-400 col-span-6 text-center py-6">ยังไม่มีสลิปโอนเงินที่อัปโหลด</p>`;
    } else {
      slipGrid.innerHTML = ordersWithSlips.map(o => `
        <div class="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square cursor-pointer" onclick="viewSlip('${o.slipUrl}')">
          <img src="${o.slipUrl}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
          <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent flex flex-col justify-end p-2 text-white">
            <span class="text-[11px] font-bold line-clamp-1">฿${(o.totalCost || 0).toLocaleString()}</span>
            <span class="text-[10px] text-slate-300 truncate">${o.supplier || o.orderNumber}</span>
          </div>
        </div>
      `).join('');
    }
  }
}

// ==========================================
// SLIP UPLOAD (CAMERA & FILE MODAL)
// ==========================================
function openSlipUpload(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  state.activeOrderIdForSlip = orderId;
  state.selectedSlipFile = null;

  document.getElementById('modalOrderNumber').innerText = '#' + order.orderNumber;
  document.getElementById('modalProductName').innerText = order.productName;
  document.getElementById('modalTotalCost').innerText = '฿' + (order.totalCost || 0).toLocaleString();

  // Reset file inputs & preview
  document.getElementById('slipFileInput').value = '';
  document.getElementById('slipCameraInput').value = '';
  document.getElementById('slipPreviewContainer').classList.add('hidden');
  document.getElementById('dropZone').classList.remove('hidden');
  document.getElementById('btnConfirmUploadSlip').disabled = true;

  document.getElementById('slipUploadModal').classList.remove('hidden');
}

function viewSlip(slipUrl) {
  const img = document.getElementById('slipFullImage');
  if (img) img.src = slipUrl;
  document.getElementById('slipViewModal').classList.remove('hidden');
}

function handleSelectedFile(file) {
  if (!file) return;
  state.selectedSlipFile = file;
  const reader = new FileReader();
  reader.onload = (re) => {
    document.getElementById('slipImagePreview').src = re.target.result;
    document.getElementById('slipPreviewContainer').classList.remove('hidden');
    document.getElementById('dropZone').classList.add('hidden');
    document.getElementById('btnConfirmUploadSlip').disabled = false;
  };
  reader.readAsDataURL(file);
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('border-blue-600', 'text-blue-600', 'font-semibold');
        b.classList.add('border-transparent', 'text-slate-500', 'font-medium');
      });
      btn.classList.add('border-blue-600', 'text-blue-600', 'font-semibold');
      btn.classList.remove('border-transparent', 'text-slate-500', 'font-medium');

      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
      const activePane = document.getElementById(targetTab);
      if (activePane) activePane.classList.remove('hidden');

      if (targetTab === 'tab-analytics') renderAnalytics();
      if (targetTab === 'tab-memory') {
        renderMappings();
        renderSuppliers();
      }
    });
  });

  // Search & Filter change
  document.getElementById('searchInput')?.addEventListener('input', renderOrders);
  document.getElementById('filterStatus')?.addEventListener('change', renderOrders);
  document.getElementById('filterPlatform')?.addEventListener('change', renderOrders);

  // BigSeller Fetch Button
  const btnFetch = document.getElementById('btnFetchBigSeller');
  btnFetch?.addEventListener('click', async () => {
    const icon = document.getElementById('fetchIcon');
    icon?.classList.add('animate-spin');
    btnFetch.disabled = true;
    showToast('กำลังเชื่อมต่อ BigSeller เพื่อดึงออเดอร์ใหม่...');

    try {
      const res = await fetch('/api/bigseller/fetch', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(`ดึงข้อมูลสำเร็จ! พบ ${json.count} คำสั่งซื้อใหม่`);
        await fetchOrders();
        await fetchAnalytics();
      } else {
        showToast(json.error || 'ดึงข้อมูลไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('ไม่สามารถดึงข้อมูลได้: ' + err.message, 'error');
    } finally {
      icon?.classList.remove('animate-spin');
      btnFetch.disabled = false;
    }
  });

  // Seed Sample Data Button
  document.getElementById('btnSeedSample')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/bigseller/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('โหลดข้อมูลจำลอง Shopee & Lazada เรียบร้อยแล้ว!');
        await fetchOrders();
        await fetchAnalytics();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
  });

  // Sync to Google Sheets Button
  document.getElementById('btnSyncSheets')?.addEventListener('click', async () => {
    showToast('กำลังส่งข้อมูลเข้า Google Sheets...');
    try {
      const res = await fetch('/api/sheets/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const json = await res.json();
      if (json.success) {
        showToast(`ซิงก์สำเร็จ! อัปเดต ${json.count} รายการลงใน Google Sheets แล้ว`);
        await fetchOrders();
      } else {
        showToast(json.error || 'ส่งข้อมูลเข้า Sheet ไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('ซิงก์ไม่สำเร็จ: ' + err.message, 'error');
    }
  });

  // BigSeller Login Launch Button
  document.getElementById('btnBigSellerLogin')?.addEventListener('click', async () => {
    showToast('กำลังเปิดหน้าต่างเบราว์เซอร์ BigSeller...');
    try {
      const res = await fetch('/api/bigseller/login', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert(json.message);
      }
    } catch (err) {
      showToast('เปิดเบราว์เซอร์ไม่สำเร็จ: ' + err.message, 'error');
    }
  });

  // Save Settings Button
  document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
    const webhook = document.getElementById('settingWebhookUrl')?.value.trim() || '';
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleSheetWebhook: webhook })
      });
      const json = await res.json();
      if (json.success) {
        showToast('บันทึกการตั้งค่า Webhook สำเร็จ');
      }
    } catch (err) {
      showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    }
  });

  // Copy Apps Script Code Button
  document.getElementById('btnCopyScript')?.addEventListener('click', () => {
    const code = document.getElementById('appsScriptCode')?.innerText || '';
    copyToClipboard(code);
    showToast('คัดลอกโค้ด Apps Script ลงในคลิปบอร์ดแล้ว');
  });

  // Open QR Modal
  document.getElementById('btnOpenQr')?.addEventListener('click', () => {
    document.getElementById('qrModal')?.classList.remove('hidden');
  });

  // Modal Close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
    });
  });

  // Camera & Gallery Upload buttons
  const cameraInput = document.getElementById('slipCameraInput');
  const fileInput = document.getElementById('slipFileInput');

  document.getElementById('btnLaunchCamera')?.addEventListener('click', () => {
    cameraInput?.click();
  });

  document.getElementById('btnLaunchGallery')?.addEventListener('click', () => {
    fileInput?.click();
  });

  cameraInput?.addEventListener('change', (e) => handleSelectedFile(e.target.files[0]));
  fileInput?.addEventListener('change', (e) => handleSelectedFile(e.target.files[0]));

  document.getElementById('btnRemoveSlipPreview')?.addEventListener('click', () => {
    state.selectedSlipFile = null;
    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';
    document.getElementById('slipPreviewContainer').classList.add('hidden');
    document.getElementById('dropZone').classList.remove('hidden');
    document.getElementById('btnConfirmUploadSlip').disabled = true;
  });

  // Confirm Upload Slip
  document.getElementById('btnConfirmUploadSlip')?.addEventListener('click', async () => {
    if (!state.selectedSlipFile || !state.activeOrderIdForSlip) return;

    const formData = new FormData();
    formData.append('slip', state.selectedSlipFile);

    const uploadBtn = document.getElementById('btnConfirmUploadSlip');
    uploadBtn.disabled = true;
    uploadBtn.innerText = 'กำลังอัปโหลด...';

    try {
      const res = await fetch(`/api/orders/${state.activeOrderIdForSlip}/slip`, {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        showToast('อัปโหลดสลิปเรียบร้อยแล้ว!');
        document.getElementById('slipUploadModal').classList.add('hidden');
        await fetchOrders();
        await fetchAnalytics();
      } else {
        showToast(json.error || 'อัปโหลดสลิปไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('อัปโหลดสลิปไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerText = 'อัปโหลดสลิป';
    }
  });

  // Add Supplier Button
  document.getElementById('btnAddSupplier')?.addEventListener('click', async () => {
    const name = prompt('กรอกชื่อร้านซับ (Supplier):');
    if (!name || !name.trim()) return;
    const phone = prompt('กรอกเบอร์โทรศัพท์ (ถ้ามี):') || '';
    const note = prompt('หมายเหตุเพิ่มเติม (ถ้ามี):') || '';

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone, note })
      });
      const json = await res.json();
      if (json.success) {
        state.suppliers.push(json.data);
        renderSuppliers();
        updateSuppliersDatalist();
        showToast('เพิ่มร้านซับเรียบร้อยแล้ว');
      }
    } catch (err) {
      showToast('เพิ่มร้านซับไม่สำเร็จ: ' + err.message, 'error');
    }
  });

  // Add Manual Order Button
  document.getElementById('btnAddManualOrder')?.addEventListener('click', async () => {
    const orderNumber = prompt('กรอกเลขออเดอร์ (เช่น 260914...):');
    if (!orderNumber || !orderNumber.trim()) return;
    const productName = prompt('กรอกรายการสินค้า / ขนาดยาง (เช่น ยาง 215/45R17 KUMHO...):');
    if (!productName || !productName.trim()) return;
    const qtyStr = prompt('กรอกจำนวน (เส้น):', '1');
    const quantity = parseInt(qtyStr, 10) || 1;
    const platform = prompt('แพลตฟอร์ม (Shopee / Lazada):', 'Shopee') || 'Shopee';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          productName: productName.trim(),
          quantity,
          platform,
          storeName: platform === 'Lazada' ? 'หลงฉื่อ กรุ๊ป Lazada' : 'Long Chi GROUP JACK Shopee',
          unit: 'เส้น'
        })
      });
      const json = await res.json();
      if (json.success) {
        showToast('เพิ่มออเดอร์เรียบร้อยแล้ว');
        await fetchOrders();
        await fetchAnalytics();
      }
    } catch (err) {
      showToast('เพิ่มออเดอร์ไม่สำเร็จ: ' + err.message, 'error');
    }
  });

  // New Mapping Modal
  document.getElementById('btnNewMapping')?.addEventListener('click', () => {
    document.getElementById('mappingForm').reset();
    document.getElementById('mappingId').value = '';
    document.getElementById('mappingModalTitle').innerText = 'เพิ่มคู่มือจับคู่ยาง';
    document.getElementById('mappingModal').classList.remove('hidden');
  });

  // Submit Mapping Form
  document.getElementById('mappingForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('mappingId').value;
    const pattern = document.getElementById('mappingPattern').value.trim();
    const supplier = document.getElementById('mappingSupplier').value.trim();
    const pricePerUnit = Number(document.getElementById('mappingPrice').value) || 0;
    const shippingFee = Number(document.getElementById('mappingShipping').value) || 0;
    const note = document.getElementById('mappingNote').value.trim();

    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, pattern, supplier, pricePerUnit, shippingFee, note })
      });
      const json = await res.json();
      if (json.success) {
        state.mappings = json.data;
        renderMappings();
        document.getElementById('mappingModal').classList.add('hidden');
        showToast('บันทึกคู่มือจับคู่สำเร็จ');
      }
    } catch (err) {
      showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    }
  });
}

// ==========================================
// UTILITY HELPERS
// ==========================================
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`คัดลอก "${text}" แล้ว`);
    });
  } else {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(`คัดลอก "${text}" แล้ว`);
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast || !toastMessage) return;

  toastMessage.innerText = message;
  if (type === 'error') {
    toastIcon.setAttribute('data-lucide', 'alert-circle');
    toastIcon.className = 'w-4 h-4 text-rose-400 flex-shrink-0';
  } else {
    toastIcon.setAttribute('data-lucide', 'check-circle');
    toastIcon.className = 'w-4 h-4 text-emerald-400 flex-shrink-0';
  }
  initLucide();

  toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
  }, 3500);
}
