// Daily Tire Purchasing App - Client Script
let state = {
  orders: [],
  suppliers: [],
  mappings: [],
  analytics: null,
  activeOrderIdForSlip: null,
  selectedSlipFile: null,
  saveTyreRedemption: null,
  topFormRewards: null,
  activeCompareOrder: null
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
    fetchNetworkInfo(),
    fetchSaveTyreRedemption(),
    fetchTopFormRewards()
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
      updateSuppliersDatalist();
      renderSuppliers();
    }
  } catch (err) {
    console.warn('โหลดร้านซับไม่สำเร็จ:', err.message);
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
    console.warn('โหลดคู่มือจับคู่ไม่สำเร็จ:', err.message);
  }
}

async function fetchAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    const json = await res.json();
    if (json.success) {
      state.analytics = json.data;
      renderAnalytics();
    }
  } catch (err) {
    console.warn('โหลดสถิติไม่สำเร็จ:', err.message);
  }
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success && json.data) {
      const webhookInput = document.getElementById('settingWebhookUrl');
      if (webhookInput) webhookInput.value = json.data.googleSheetWebhook || '';
    }

    const scriptRes = await fetch('/api/sheets/script-template');
    const scriptJson = await scriptRes.json();
    if (scriptJson.success) {
      const codeElem = document.getElementById('appsScriptCode');
      if (codeElem) codeElem.innerText = scriptJson.script;
    }
  } catch (err) {
    console.warn('โหลดการตั้งค่าไม่สำเร็จ:', err.message);
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
    console.warn('โหลดข้อมูลเครือข่ายไม่สำเร็จ:', err.message);
  }
}

// ==========================================
// KPI SUMMARY BAR
// ==========================================
function updateKpis() {
  const totalOrders = state.orders.length;
  let orderedCount = 0;
  let pendingCount = 0;
  let oosCount = 0;
  let totalExpense = 0;
  let slipsCount = 0;

  state.orders.forEach(o => {
    if (o.status === 'สั่งแล้ว (ส่งได้)' || o.status === 'สั่งแล้ว' || o.status === 'ส่งได้') {
      orderedCount++;
    } else if (o.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || o.status === 'ขาดตลาด' || o.status === 'ยกเลิก') {
      oosCount++;
    } else {
      pendingCount++;
    }

    const itemTotal = (Number(o.quantity) || 1) * (Number(o.pricePerUnit) || 0) + (Number(o.shippingFee) || 0);
    totalExpense += itemTotal;

    if (o.slipUrl) slipsCount++;
  });

  const elPending = document.getElementById('statPendingOrders');
  const elReady = document.getElementById('statReadyOrders');
  const elOos = document.getElementById('statOosOrders');
  const elExpense = document.getElementById('statTotalExpense');
  const elSlips = document.getElementById('statSlipsCount');
  const elSlipsTotal = document.getElementById('statSlipsTotal');
  const badgeOrder = document.getElementById('badgeOrderCount');

  if (elPending) elPending.innerText = pendingCount;
  if (elReady) elReady.innerText = orderedCount;
  if (elOos) elOos.innerText = oosCount;
  if (elExpense) elExpense.innerText = '฿' + totalExpense.toLocaleString();
  if (elSlips) elSlips.innerText = slipsCount;
  if (elSlipsTotal) elSlipsTotal.innerText = `/ ${totalOrders} รายการ`;
  if (badgeOrder) badgeOrder.innerText = totalOrders;
}

// ==========================================
// ORDERS RENDERING (MOBILE CARDS & DESKTOP TABLE)
// ==========================================
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
          <!-- Top Row: Status & Platform & Compare Suppliers -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs font-bold rounded-lg border px-2.5 py-1 focus:outline-none ${statusBorderClass}">
                <option value="รอสั่ง" ${order.status === 'รอสั่ง' ? 'selected' : ''}>⏳ รอสั่ง</option>
                <option value="สั่งแล้ว (ส่งได้)" ${order.status === 'สั่งแล้ว (ส่งได้)' || order.status === 'สั่งแล้ว' || order.status === 'ส่งได้' ? 'selected' : ''}>✅ พร้อมส่ง</option>
                <option value="สินค้าขาดตลาด (ส่งไม่ได้)" ${order.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || order.status === 'ขาดตลาด' ? 'selected' : ''}>❌ ขาดตลาด</option>
              </select>
              ${platformBadge}
            </div>

            <div class="flex items-center gap-1.5">
              <button onclick="openSupplierCompare('${order.id}')" class="text-[11px] text-indigo-700 font-bold inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded-lg transition" title="เปรียบเทียบสต็อกและราคาจาก SaveTyre และ TopForm">
                <i data-lucide="scale" class="w-3 h-3"></i>
                <span>เปรียบเทียบซับ</span>
              </button>
              <a href="${checkPriceLink}" target="_blank" class="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition" title="ตรวจราคาในระบบ Shopee/Lazada">
                <span>ตรวจราคา</span>
                <i data-lucide="external-link" class="w-3 h-3"></i>
              </a>
            </div>
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
            <div>
              <p class="font-bold text-slate-900 text-xs sm:text-sm leading-snug">${order.productName}</p>
              ${order.extraNote ? `<p class="text-[11px] text-amber-700 mt-1 font-medium">${order.extraNote}</p>` : ''}
            </div>
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
                placeholder="แตะเพื่อเลือกร้านซับ หรือกดเปรียบเทียบซับ..." 
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
        ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Lazada</span>`
        : `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Shopee</span>`;

      const checkPriceLink = order.platform === 'Lazada'
        ? `https://sellercenter.lazada.co.th/order/detail/${order.orderNumber}`
        : `https://seller.shopee.co.th/portal/sale/order`;

      const slipButton = order.slipUrl
        ? `
          <div class="flex items-center gap-1.5">
            <img src="${order.slipUrl}" class="w-8 h-8 rounded border border-slate-200 object-cover cursor-pointer hover:scale-110 transition" onclick="viewSlip('${order.slipUrl}')" title="คลิกเพื่อดูสลิปเต็มจอ">
            <button onclick="openSlipUpload('${order.id}')" class="text-xs text-blue-600 hover:text-blue-800 p-1" title="เปลี่ยนรูปสลิป">
              <i data-lucide="refresh-cw" class="w-3 h-3"></i>
            </button>
          </div>
        `
        : `
          <button onclick="openSlipUpload('${order.id}')" class="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition" title="อัปโหลดสลิปโอนเงิน">
            <i data-lucide="upload" class="w-3 h-3"></i>
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
              <button onclick="copyToClipboard('${order.orderNumber}')" class="text-slate-400 hover:text-slate-600 p-0.5" title="คัดลอก">
                <i data-lucide="copy" class="w-3 h-3"></i>
              </button>
            </div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-medium text-slate-900 leading-snug">${order.productName}</div>
            <div class="flex items-center gap-1.5 mt-1">
              <button onclick="openSupplierCompare('${order.id}')" class="text-[11px] text-indigo-700 font-bold inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition" title="เปรียบเทียบซับ SaveTyre & TopForm">
                <i data-lucide="scale" class="w-3 h-3"></i>
                <span>เปรียบเทียบซับ</span>
              </button>
              ${order.extraNote ? `<span class="text-[11px] text-amber-700 font-medium">${order.extraNote}</span>` : ''}
            </div>
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
              onchange="saveRowPricing('${order.id}')" 
              id="input-supplier-${order.id}" 
              class="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none">
          </td>
          <td class="py-2.5 px-3 text-right">
            <input 
              type="number" 
              value="${order.pricePerUnit || ''}" 
              placeholder="0" 
              min="0"
              oninput="recalcRow('${order.id}', ${order.quantity || 1})" 
              onchange="saveRowPricing('${order.id}')" 
              id="input-price-${order.id}" 
              class="w-20 text-xs px-2 py-1.5 border border-slate-200 rounded-lg text-right font-bold text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none">
          </td>
          <td class="py-2.5 px-3 text-right">
            <input 
              type="number" 
              value="${order.shippingFee || 0}" 
              placeholder="0" 
              min="0"
              oninput="recalcRow('${order.id}', ${order.quantity || 1})" 
              onchange="saveRowPricing('${order.id}')" 
              id="input-shipping-${order.id}" 
              class="w-16 text-xs px-2 py-1.5 border border-slate-200 rounded-lg text-right text-slate-700 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none">
          </td>
          <td class="py-2.5 px-3 text-right font-bold text-emerald-600 text-xs" id="total-${order.id}">
            ฿${total.toLocaleString()}
          </td>
          <td class="py-2.5 px-3 text-center">
            ${slipButton}
          </td>
          <td class="py-2.5 px-2 text-center">
            <button onclick="deleteOrder('${order.id}')" class="text-slate-400 hover:text-red-500 p-1 transition" title="ลบรายการ">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  initLucide();
}

// Live recalculation helpers
function recalcRow(orderId, qty) {
  const price = Number(document.getElementById(`input-price-${orderId}`)?.value) || 0;
  const shipping = Number(document.getElementById(`input-shipping-${orderId}`)?.value) || 0;
  const total = (qty * price) + shipping;
  const elem = document.getElementById(`total-${orderId}`);
  if (elem) elem.innerText = '฿' + total.toLocaleString();
}

function recalcMobileRow(orderId, qty) {
  const price = Number(document.getElementById(`mobile-price-${orderId}`)?.value) || 0;
  const shipping = Number(document.getElementById(`mobile-shipping-${orderId}`)?.value) || 0;
  const total = (qty * price) + shipping;
  const elem = document.getElementById(`mobile-total-${orderId}`);
  if (elem) elem.innerText = '฿' + total.toLocaleString();
}

async function saveRowPricing(orderId) {
  const supplier = document.getElementById(`input-supplier-${orderId}`)?.value || '';
  const pricePerUnit = Number(document.getElementById(`input-price-${orderId}`)?.value) || 0;
  const shippingFee = Number(document.getElementById(`input-shipping-${orderId}`)?.value) || 0;

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
        <div class="flex items-center gap-1.5">
          <h4 class="font-bold text-slate-800 text-xs sm:text-sm">${sup.name}</h4>
          ${sup.name.includes('Save') || sup.name.includes('TopForm') || sup.name.includes('KPS') || sup.name.includes('BestTire') ? `<span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">ต่อระบบสดแล้ว</span>` : ''}
        </div>
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

  const outList = document.getElementById('outOfStockList');
  if (outList) {
    if (state.analytics.frequentlyOutOfStock.length === 0) {
      outList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">ไม่มีสินค้าขาดตลาดในรอบนี้</p>`;
    } else {
      outList.innerHTML = state.analytics.frequentlyOutOfStock.map(item => `
        <div class="flex items-center justify-between p-2.5 bg-rose-50/50 rounded-xl border border-rose-100">
          <div class="min-w-0">
            <p class="font-medium text-slate-900 text-xs truncate">${item.name}</p>
            <p class="text-[11px] text-rose-600">ขาดตลาด ${item.count} ครั้ง</p>
          </div>
          <span class="text-xs font-bold text-rose-700">${item.totalQty} เส้น</span>
        </div>
      `).join('');
    }
  }

  const supExpense = document.getElementById('supplierExpenseList');
  if (supExpense) {
    const suppliers = Object.keys(state.analytics.bySupplier);
    if (suppliers.length === 0) {
      supExpense.innerHTML = `<p class="text-xs text-slate-400 col-span-3 text-center py-4">ยังไม่มีข้อมูลรายจ่าย</p>`;
    } else {
      supExpense.innerHTML = suppliers.map(s => {
        const item = state.analytics.bySupplier[s];
        return `
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p class="font-bold text-slate-800 text-xs truncate">${s || 'ยังไม่ระบุซับ'}</p>
            <div class="mt-2 flex justify-between items-baseline">
              <span class="text-sm sm:text-base font-bold text-blue-700">฿${(item.totalSpent || 0).toLocaleString()}</span>
              <span class="text-[11px] text-slate-500">${item.totalQty} เส้น (${item.count} รายการ)</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  const slipGrid = document.getElementById('slipGalleryGrid');
  if (slipGrid) {
    const slips = state.orders.filter(o => o.slipUrl);
    if (slips.length === 0) {
      slipGrid.innerHTML = `<p class="text-xs text-slate-400 col-span-6 text-center py-4">ยังไม่มีสลิปที่แนบในวันนี้</p>`;
    } else {
      slipGrid.innerHTML = slips.map(o => `
        <div class="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square cursor-pointer" onclick="viewSlip('${o.slipUrl}')">
          <img src="${o.slipUrl}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold p-1 text-center">
            #${o.orderNumber}
          </div>
        </div>
      `).join('');
    }
  }
}

// ==========================================
// SAVETYRE & TOPFORM INTEGRATION
// ==========================================

// --- SaveTyre ---
async function fetchSaveTyreRedemption(force = false) {
  try {
    const res = await fetch(`/api/savetyre/redemption?force=${force}`);
    const json = await res.json();
    if (json.success) {
      state.saveTyreRedemption = json;
      renderSaveTyreRedemption();
    }
  } catch (err) {
    console.warn('SaveTyre redemption fetch failed:', err.message);
  }
}

function renderSaveTyreRedemption() {
  const badge = document.getElementById('saveTyreRightsBadge');
  const tbody = document.getElementById('redemptionTableBody');
  if (!state.saveTyreRedemption) return;

  if (badge) {
    badge.innerText = `สิทธิ์แลกซื้อ: ${state.saveTyreRedemption.userRights || 0} สิทธิ์`;
  }

  if (tbody && state.saveTyreRedemption.items) {
    if (state.saveTyreRedemption.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">กำลังเชื่อมต่อฐานข้อมูลแลกซื้อ...</td></tr>`;
      return;
    }

    tbody.innerHTML = state.saveTyreRedemption.items.map(item => `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-2.5 px-3 font-medium text-slate-800">${item.title}</td>
        <td class="py-2.5 px-2 text-slate-500">${item.brand}</td>
        <td class="py-2.5 px-2 text-center font-semibold text-slate-700">${item.stock}</td>
        <td class="py-2.5 px-3 text-right text-slate-400 line-through">฿${item.priceRetail ? item.priceRetail.toLocaleString() : '-'}</td>
        <td class="py-2.5 px-3 text-right font-bold text-emerald-600">฿${item.priceRedemption ? item.priceRedemption.toLocaleString() : '-'}</td>
        <td class="py-2.5 px-2 text-center font-bold text-purple-700">${item.rightsRequired} สิทธิ์</td>
        <td class="py-2.5 px-3 text-right font-bold text-amber-600">
          ${item.savingsAmount ? `ประหยัด ฿${item.savingsAmount.toLocaleString()} (-${item.savingsPercent}%)` : '-'}
        </td>
      </tr>
    `).join('');
  }
}

async function searchSaveTyreLive() {
  const input = document.getElementById('inputSaveTyreSearch');
  const container = document.getElementById('saveTyreSearchResults');
  if (!input || !container) return;

  const keyword = input.value.trim();
  if (!keyword) return;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="p-6 text-center text-slate-400">
      <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600"></i>
      กำลังค้นหาสต็อกใน order.savetyre.net...
    </div>
  `;
  initLucide();

  try {
    const res = await fetch(`/api/savetyre/stock?keyword=${encodeURIComponent(keyword)}`);
    const json = await res.json();
    if (json.success && json.items) {
      if (json.items.length === 0) {
        container.innerHTML = `<p class="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">ไม่พบสินค้าในสต็อก SaveTyre สำหรับ "${keyword}"</p>`;
        return;
      }

      container.innerHTML = `
        <div class="space-y-2">
          <p class="font-semibold text-xs text-slate-700 mb-2">พบ ${json.items.length} รายการในสต็อก SaveTyre:</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${json.items.map(item => `
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col justify-between">
                <div>
                  <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-slate-800">${item.brand} ${item.model}</span>
                    <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">สต็อกปี ${item.stockYearCurr} เส้น</span>
                  </div>
                  <p class="text-slate-500 text-[11px]">${item.sku || ''}</p>
                  <p class="text-slate-600 text-[11px]">สต็อกรวม: ${item.stockTotal} เส้น</p>
                  ${item.promo ? `<p class="text-amber-700 font-bold text-[11px] mt-1">🎁 โปรโมชั่น: ${item.promo}</p>` : ''}
                </div>
                <div class="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span class="font-bold text-slate-900">฿${item.priceRetail ? item.priceRetail.toLocaleString() : '-'}</span>
                  <span class="text-[10px] text-slate-400">ส่งฟรี กทม./ศาลายา</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      initLucide();
    }
  } catch (err) {
    container.innerHTML = `<p class="p-4 bg-rose-50 text-rose-700 rounded-xl text-xs text-center">ค้นหาไม่สำเร็จ: ${err.message}</p>`;
  }
}

// --- TopForm ---
async function fetchTopFormRewards() {
  try {
    const res = await fetch('/api/topform/rewards');
    const json = await res.json();
    if (json.success && json.rewards) {
      state.topFormRewards = json.rewards;
      renderTopFormRewards();
    }
  } catch (err) {
    console.warn('TopForm rewards fetch failed:', err.message);
  }
}

function renderTopFormRewards() {
  const container = document.getElementById('topFormRewardsGrid');
  if (!container || !state.topFormRewards) return;

  if (state.topFormRewards.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 col-span-3">ไม่พบรายการของรางวัล</p>`;
    return;
  }

  container.innerHTML = state.topFormRewards.map(r => `
    <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
      ${r.imageUrl ? `<img src="${r.imageUrl}" class="w-14 h-14 object-cover rounded-lg border border-slate-200">` : `<div class="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 font-bold text-lg"><i data-lucide="gift" class="w-6 h-6"></i></div>`}
      <div>
        <p class="font-bold text-xs sm:text-sm text-slate-900">${r.name}</p>
        <p class="text-xs text-purple-700 font-semibold mt-0.5">${r.point ? r.point.toLocaleString() : 0} คะแนน</p>
        <span class="text-[10px] text-slate-400">สะสมจากการสั่งซื้อยาง TopForm</span>
      </div>
    </div>
  `).join('');
  initLucide();
}

async function searchTopFormLive() {
  const input = document.getElementById('inputTopFormSearch');
  const container = document.getElementById('topFormSearchResults');
  if (!input || !container) return;

  const keyword = input.value.trim();
  if (!keyword) return;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="p-6 text-center text-slate-400">
      <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600"></i>
      กำลังค้นหาสต็อกสดใน topform.co.th...
    </div>
  `;
  initLucide();

  try {
    const res = await fetch(`/api/topform/stock?keyword=${encodeURIComponent(keyword)}`);
    const json = await res.json();
    if (json.success && json.items) {
      if (json.items.length === 0) {
        container.innerHTML = `<p class="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">ไม่พบสินค้าในสต็อก TopForm สำหรับ "${keyword}"</p>`;
        return;
      }

      container.innerHTML = `
        <div class="space-y-2">
          <p class="font-semibold text-xs text-slate-700 mb-2">พบ ${json.items.length} รายการในสต็อก TopForm (ขนาด ${json.sizeQuery}):</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${json.items.map(item => `
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col justify-between">
                <div>
                  <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-slate-800">${item.name}</span>
                    <span class="px-1.5 py-0.5 rounded ${item.availableStock > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'} font-bold text-[10px]">
                      สต็อก ${item.availableStock} เส้น
                    </span>
                  </div>
                  <p class="text-slate-500 text-[11px]">รหัส: ${item.code} | สัญชาติ: ${item.country || '-'}</p>
                  <p class="text-slate-500 text-[11px]">DOT: ${item.year || '-'}</p>
                  ${item.promoSummary ? `<p class="text-amber-700 font-bold text-[11px] mt-1">🎁 ${item.promoSummary}</p>` : ''}
                </div>
                <div class="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span class="font-bold text-slate-900 text-sm">฿${item.price.toLocaleString()}</span>
                    ${item.netPrice < item.price ? `<span class="text-[11px] text-emerald-600 font-bold ml-1">(NET ฿${item.netPrice.toLocaleString()})</span>` : ''}
                  </div>
                  <span class="text-[10px] text-slate-400">บาท/เส้น</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      initLucide();
    }
  } catch (err) {
    container.innerHTML = `<p class="p-4 bg-rose-50 text-rose-700 rounded-xl text-xs text-center">ค้นหาไม่สำเร็จ: ${err.message}</p>`;
  }
}

// --- Smart Supplier Comparison Modal ---
async function openSupplierCompare(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  state.activeCompareOrder = order;

  const modal = document.getElementById('supplierCompareModal');
  const loading = document.getElementById('compareLoading');
  const content = document.getElementById('compareContent');
  const prodTitle = document.getElementById('compareOrderProduct');
  const qtyElem = document.getElementById('compareOrderQty');
  const platformBadge = document.getElementById('compareOrderPlatformBadge');

  prodTitle.innerText = order.productName;
  qtyElem.innerText = order.quantity || 1;
  platformBadge.innerText = order.platform || 'Shopee';

  loading.classList.remove('hidden');
  content.classList.add('hidden');
  modal.classList.remove('hidden');
  initLucide();

  try {
    const res = await fetch(`/api/suppliers/compare?productName=${encodeURIComponent(order.productName)}&quantity=${order.quantity || 1}`);
    const json = await res.json();

    loading.classList.add('hidden');
    content.classList.remove('hidden');

    // 1. Recommendation Banner
    const banner = document.getElementById('compareBestBanner');
    const bestTitle = document.getElementById('compareBestTitle');
    const bestReason = document.getElementById('compareBestReason');
    const btnBest = document.getElementById('btnApplyBest');

    if (json.bestOption) {
      banner.classList.remove('hidden');
      bestTitle.innerText = `แนะนำ: ${json.bestOption.supplier}`;
      bestReason.innerText = `${json.bestOption.reason} • ต้นทุน ฿${json.bestOption.pricePerUnit.toLocaleString()}/เส้น (ยอดรวม ฿${json.bestOption.totalCost.toLocaleString()})`;
      btnBest.onclick = () => applySupplierDeal(order.id, json.bestOption.supplier, json.bestOption.pricePerUnit, 0);
    } else {
      banner.classList.add('hidden');
    }

    // 2. Save Tyre Card
    const stBadge = document.getElementById('badgeSaveTyreStock');
    const stBody = document.getElementById('bodySaveTyreCompare');
    const stBtn = document.getElementById('btnApplySaveTyre');

    if (json.savetyre && json.savetyre.matched) {
      const st = json.savetyre;
      stBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
      stBadge.innerText = `มีสต็อก ${st.totalStockAvailable} เส้น`;
      
      let promoHtml = '';
      if (st.bestVolumePromo) {
        promoHtml = `<p class="text-amber-700 font-bold">🎁 โปรโมชั่น: ${st.bestVolumePromo.promoName} (เฉลี่ย ฿${Math.round(st.bestVolumePromo.effectivePricePerUnit).toLocaleString()}/เส้น)</p>`;
      }
      if (st.redemptionMatch) {
        promoHtml += `<p class="text-purple-700 font-bold">🪙 ใช้สิทธิ์แลกซื้อได้: ฿${st.redemptionMatch.priceRedemption.toLocaleString()}/เส้น</p>`;
      }

      stBody.innerHTML = `
        <p class="font-bold text-slate-800">${st.selectedItem?.brand || ''} ${st.selectedItem?.model || ''}</p>
        <p>ราคาต่อเส้น: <strong class="text-emerald-700 text-sm">฿${st.unitPrice.toLocaleString()}</strong></p>
        <p>ยอดรวมสั่ง ${order.quantity || 1} เส้น: <strong>฿${st.totalCost.toLocaleString()}</strong> (ส่งฟรี)</p>
        ${promoHtml}
      `;
      stBtn.disabled = false;
      stBtn.className = 'w-full text-xs py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition shadow-sm';
      stBtn.onclick = () => applySupplierDeal(order.id, 'Save Tyre (ไทร์ทูยู)', st.unitPrice, 0);
    } else {
      stBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600';
      stBadge.innerText = 'ไม่พบสต็อก';
      stBody.innerHTML = `<p class="text-slate-400 py-3">${json.savetyre?.reason || 'ไม่พบสินค้ารุ่นนี้ในระบบ Save Tyre'}</p>`;
      stBtn.disabled = true;
      stBtn.className = 'w-full text-xs py-2 bg-slate-200 text-slate-400 font-semibold rounded-lg cursor-not-allowed';
    }

    // 3. TopForm Card
    const tfBadge = document.getElementById('badgeTopFormStock');
    const tfBody = document.getElementById('bodyTopFormCompare');
    const tfBtn = document.getElementById('btnApplyTopForm');

    if (json.topform && json.topform.matched) {
      const tf = json.topform;
      tfBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800';
      tfBadge.innerText = `มีสต็อก ${tf.totalStockAvailable} เส้น`;

      let promoHtml = '';
      if (tf.promoSummary) {
        promoHtml = `<p class="text-amber-700 font-bold">🎁 โปรโมชั่น: ${tf.promoSummary}</p>`;
      }

      tfBody.innerHTML = `
        <p class="font-bold text-slate-800">${tf.selectedItem?.name || ''}</p>
        <p>ราคาต่อเส้น: <strong class="text-blue-700 text-sm">฿${tf.unitPrice.toLocaleString()}</strong></p>
        <p>ยอดรวมสั่ง ${order.quantity || 1} เส้น: <strong>฿${tf.totalCost.toLocaleString()}</strong></p>
        <p class="text-slate-400 text-[11px]">DOT: ${tf.selectedItem?.year || '-'} | ผลิต: ${tf.selectedItem?.country || '-'}</p>
        ${promoHtml}
      `;
      tfBtn.disabled = false;
      tfBtn.className = 'w-full text-xs py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition shadow-sm';
      tfBtn.onclick = () => applySupplierDeal(order.id, 'TopForm (ท็อปฟอร์ม)', tf.unitPrice, 0);
    } else {
      tfBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600';
      tfBadge.innerText = 'ไม่พบสต็อก';
      tfBody.innerHTML = `<p class="text-slate-400 py-3">${json.topform?.reason || 'ไม่พบสินค้ารุ่นนี้ในระบบ TopForm'}</p>`;
      tfBtn.disabled = true;
      tfBtn.className = 'w-full text-xs py-2 bg-slate-200 text-slate-400 font-semibold rounded-lg cursor-not-allowed';
    }

    // 3. KPS Stock Card
    const kpsBadge = document.getElementById('badgeKpsStock');
    const kpsBody = document.getElementById('bodyKpsCompare');
    const kpsBtn = document.getElementById('btnApplyKps');

    if (json.kps && json.kps.matched) {
      const kps = json.kps;
      kpsBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800';
      kpsBadge.innerText = `มีสต็อก ${kps.totalStockAvailable} เส้น`;

      let promoHtml = '';
      if (kps.promoSummary) {
        promoHtml = `<p class="text-purple-700 font-bold">🎁 หมายเหตุ: ${kps.promoSummary}</p>`;
      }

      kpsBody.innerHTML = `
        <p class="font-bold text-slate-800">${kps.selectedItem?.name || ''}</p>
        <p>ราคาต่อเส้น: <strong class="text-purple-700 text-sm">฿${kps.unitPrice.toLocaleString()}</strong></p>
        <p>ยอดรวมสั่ง ${order.quantity || 1} เส้น: <strong>฿${kps.totalCost.toLocaleString()}</strong></p>
        <p class="text-slate-400 text-[11px]">DOT: ${kps.selectedItem?.dot || '-'} | สาขา: ${kps.selectedItem?.branch || '-'}</p>
        ${promoHtml}
      `;
      kpsBtn.disabled = false;
      kpsBtn.className = 'w-full text-xs py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition shadow-sm';
      kpsBtn.onclick = () => applySupplierDeal(order.id, 'KPS Stock', kps.unitPrice, 0);
    } else {
      kpsBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600';
      kpsBadge.innerText = 'ไม่พบสต็อก';
      kpsBody.innerHTML = `<p class="text-slate-400 py-3">${json.kps?.reason || 'ไม่พบสินค้ารุ่นนี้ในระบบ KPS'}</p>`;
      kpsBtn.disabled = true;
      kpsBtn.className = 'w-full text-xs py-2 bg-slate-200 text-slate-400 font-semibold rounded-lg cursor-not-allowed';
    }

    // 4. BestTire Card
    const btBadge = document.getElementById('badgeBestTireStock');
    const btBody = document.getElementById('bodyBestTireCompare');
    const btBtn = document.getElementById('btnApplyBestTire');

    if (json.besttire && json.besttire.matched) {
      const bt = json.besttire;
      btBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800';
      btBadge.innerText = `มีสต็อก ${bt.totalStockAvailable}+ เส้น`;

      let promoHtml = '';
      if (bt.promoSummary) {
        promoHtml = `<p class="text-orange-700 font-bold">🎁 โปรโมชั่น: ${bt.promoSummary}</p>`;
      }

      btBody.innerHTML = `
        <p class="font-bold text-slate-800">${bt.selectedItem?.name || ''}</p>
        <p>ราคาต่อเส้น: <strong class="text-orange-700 text-sm">฿${bt.unitPrice.toLocaleString()}</strong></p>
        <p>ยอดรวมสั่ง ${order.quantity || 1} เส้น: <strong>฿${bt.totalCost.toLocaleString()}</strong></p>
        <p class="text-slate-400 text-[11px]">สัปดาห์: ${bt.selectedItem?.weekYear || '-'} | แต้ม: ${bt.selectedItem?.points || '0'}</p>
        ${promoHtml}
      `;
      btBtn.disabled = false;
      btBtn.className = 'w-full text-xs py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition shadow-sm';
      btBtn.onclick = () => applySupplierDeal(order.id, 'BestTire', bt.unitPrice, 0);
    } else {
      btBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600';
      btBadge.innerText = 'ไม่พบสต็อก';
      btBody.innerHTML = `<p class="text-slate-400 py-3">${json.besttire?.reason || 'ไม่พบสินค้ารุ่นนี้ในระบบ BestTire'}</p>`;
      btBtn.disabled = true;
      btBtn.className = 'w-full text-xs py-2 bg-slate-200 text-slate-400 font-semibold rounded-lg cursor-not-allowed';
    }

    // 4. Alternatives from TopForm
    const altContainer = document.getElementById('alternativesList');
    if (json.topform?.allAlternatives && json.topform.allAlternatives.length > 0) {
      altContainer.innerHTML = json.topform.allAlternatives.map(alt => `
        <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
          <div class="truncate flex-1">
            <span class="font-bold text-slate-800">${alt.name}</span>
            <span class="text-slate-500 ml-1.5">(สต็อก: ${alt.availableStock} | DOT: ${alt.year || '-'})</span>
            ${alt.promoSummary ? `<span class="text-amber-600 font-semibold ml-1">🎁 ${alt.promoSummary}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="font-bold text-slate-900">฿${alt.price.toLocaleString()}</span>
            <button onclick="applySupplierDeal('${order.id}', 'TopForm (ท็อปฟอร์ม)', ${alt.price}, 0)" class="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-semibold px-2 py-1 rounded transition">
              เลือกรุ่นนี้
            </button>
          </div>
        </div>
      `).join('');
    } else {
      altContainer.innerHTML = `<p class="text-slate-400 text-xs">ไม่มีรุ่นทางเลือกเพิ่มเติม</p>`;
    }

    initLucide();
  } catch (err) {
    loading.innerHTML = `<p class="text-rose-600 text-xs py-6">เกิดข้อผิดพลาดในการดึงข้อมูลเปรียบเทียบ: ${err.message}</p>`;
  }
}

async function applySupplierDeal(orderId, supplierName, pricePerUnit, shippingFee = 0) {
  try {
    const res = await fetch(`/api/orders/${orderId}/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier: supplierName, pricePerUnit, shippingFee })
    });
    const json = await res.json();
    if (json.success) {
      const idx = state.orders.findIndex(o => o.id === orderId);
      if (idx >= 0) state.orders[idx] = json.data;
      renderOrders();
      updateKpis();
      fetchAnalytics();
      document.getElementById('supplierCompareModal').classList.add('hidden');
      showToast(`อัปเดตราคาเป็น ฿${pricePerUnit.toLocaleString()} (${supplierName}) แล้ว!`);
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
}

// ==========================================
// SLIP UPLOAD & VIEWING
// ==========================================
function openSlipUpload(orderId) {
  state.activeOrderIdForSlip = orderId;
  state.selectedSlipFile = null;

  const order = state.orders.find(o => o.id === orderId);
  const info = document.getElementById('slipOrderInfo');
  if (info && order) {
    info.innerText = `#${order.orderNumber} - ${order.productName}`;
  }

  document.getElementById('slipPreviewContainer').classList.add('hidden');
  document.getElementById('dropZone').classList.remove('hidden');
  document.getElementById('btnConfirmUploadSlip').disabled = true;
  document.getElementById('btnConfirmUploadSlip').innerText = 'ยืนยันการแนบสลิป';

  document.getElementById('slipUploadModal').classList.remove('hidden');
}

function viewSlip(url) {
  document.getElementById('slipFullImage').src = url;
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
      if (targetTab === 'tab-savetyre') renderSaveTyreRedemption();
      if (targetTab === 'tab-topform') fetchTopFormRewards();
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

  // BigSeller CSV Import Handlers
  const bigSellerFileInput = document.getElementById('bigSellerFileInput');
  document.getElementById('btnImportBigSeller')?.addEventListener('click', () => {
    bigSellerFileInput?.click();
  });
  document.getElementById('btnSettingsImportCsv')?.addEventListener('click', () => {
    bigSellerFileInput?.click();
  });

  bigSellerFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast(`กำลังนำเข้าไฟล์ ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/orders/import-csv', {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.success) {
        showToast(`นำเข้าคำสั่งซื้อสำเร็จ ${json.count} รายการ!`);
        await fetchOrders();
        await fetchAnalytics();
      } else {
        showToast(json.error || 'นำเข้าไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการนำเข้าไฟล์: ' + err.message, 'error');
    } finally {
      bigSellerFileInput.value = '';
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
        showToast(json.error || 'อัปโหลดไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการอัปโหลด: ' + err.message, 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerText = 'ยืนยันการแนบสลิป';
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

  // New Supplier Modal
  document.getElementById('btnAddSupplier')?.addEventListener('click', () => {
    document.getElementById('supplierForm')?.reset();
    document.getElementById('supplierModal')?.classList.remove('hidden');
  });

  // Submit Supplier Form
  document.getElementById('supplierForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('supplierName').value.trim();
    const phone = document.getElementById('supplierPhone').value.trim();
    const website = document.getElementById('supplierWebsite').value.trim();
    const note = document.getElementById('supplierNote').value.trim();

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, website, note })
      });
      const json = await res.json();
      if (json.success) {
        state.suppliers.push(json.data);
        renderSuppliers();
        updateSuppliersDatalist();
        document.getElementById('supplierModal')?.classList.add('hidden');
        showToast(`เพิ่มร้านซับ "${name}" สำเร็จแล้ว`);
      } else {
        showToast(json.error || 'เพิ่มร้านซับไม่สำเร็จ', 'error');
      }
    } catch (err) {
      showToast('เพิ่มร้านซับไม่สำเร็จ: ' + err.message, 'error');
    }
  });

  // SaveTyre Live Search Button & Enter
  document.getElementById('btnSearchSaveTyre')?.addEventListener('click', searchSaveTyreLive);
  document.getElementById('inputSaveTyreSearch')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchSaveTyreLive();
  });
  document.getElementById('btnRefreshRedemption')?.addEventListener('click', () => fetchSaveTyreRedemption(true));

  // TopForm Live Search Button & Enter
  document.getElementById('btnSearchTopForm')?.addEventListener('click', searchTopFormLive);
  document.getElementById('inputTopFormSearch')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchTopFormLive();
  });
  document.getElementById('btnRefreshTopFormRewards')?.addEventListener('click', fetchTopFormRewards);
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
