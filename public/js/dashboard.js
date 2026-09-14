/**
 * วุ่นวายโภชนา V2.0 - Dashboard Logic & Drill-down
 */

function renderDashboard() {
  const transactions = window.AppState ? window.AppState.transactions : [];
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  let todayIn = 0;
  let todayEx = 0;
  let todayBoxes = 0;

  let monthIn = 0;
  let monthEx = 0;
  const monthCategories = {};
  const activeDays = new Set();

  transactions.forEach(t => {
    const amt = Number(t.amount) || 0;
    const d = t.date || '';

    // Today
    if (d === today) {
      if (t.type === 'in') {
        todayIn += amt;
        todayBoxes += (Number(t.boxes) || 0);
      } else {
        todayEx += amt;
      }
    }

    // Current Month
    if (d.startsWith(currentMonth)) {
      if (t.type === 'in') {
        monthIn += amt;
        activeDays.add(d);
      } else {
        monthEx += amt;
        const cat = t.category || 'อื่น ๆ';
        if (!monthCategories[cat]) {
          monthCategories[cat] = { total: 0, count: 0, items: {} };
        }
        monthCategories[cat].total += amt;
        monthCategories[cat].count += 1;

        const desc = t.description || 'ไม่ระบุ';
        monthCategories[cat].items[desc] = (monthCategories[cat].items[desc] || 0) + amt;
      }
    }
  });

  // KPIs
  const elTodayIn = document.getElementById('dashTodayIncome');
  const elTodayEx = document.getElementById('dashTodayExpense');
  const elTodayBal = document.getElementById('dashTodayBalance');
  const elSaleDays = document.getElementById('dashSaleDays');
  const elAvgIncome = document.getElementById('dashAvgIncome');
  const elTodayBoxes = document.getElementById('dashTodayBoxes');

  if (elTodayIn) elTodayIn.textContent = `${window.formatMoney(todayIn)} ฿`;
  if (elTodayEx) elTodayEx.textContent = `${window.formatMoney(todayEx)} ฿`;
  if (elTodayBal) {
    const bal = todayIn - todayEx;
    elTodayBal.textContent = `${bal >= 0 ? '+' : ''}${window.formatMoney(bal)} ฿`;
    elTodayBal.className = bal >= 0 ? 'green' : 'red';
  }
  if (elSaleDays) elSaleDays.textContent = `${activeDays.size} วัน`;
  if (elAvgIncome) {
    const avg = activeDays.size > 0 ? (monthIn / activeDays.size) : 0;
    elAvgIncome.textContent = `${window.formatMoney(avg.toFixed(0))} ฿`;
  }
  if (elTodayBoxes) elTodayBoxes.textContent = `${todayBoxes} กล่อง`;

  // Render Category Bars
  renderCategoryBars(monthCategories, monthEx);

  // Render Smart Tip
  renderDailyTip(monthIn, monthEx, monthCategories);
}

function renderCategoryBars(categories, totalExpense) {
  const container = document.getElementById('dashCategoryBars');
  if (!container) return;

  const entries = Object.entries(categories).sort((a, b) => b[1].total - a[1].total);

  if (entries.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-dim);">ยังไม่มีข้อมูลรายจ่ายเดือนนี้</div>';
    return;
  }

  container.innerHTML = entries.map(([cat, data]) => {
    const pct = totalExpense > 0 ? ((data.total / totalExpense) * 100).toFixed(1) : 0;
    return `
      <div class="bar-item" onclick="showCategoryDrilldown('${escapeHtml(cat)}')">
        <div class="bar-header">
          <span>${escapeHtml(cat)}</span>
          <span>${window.formatMoney(data.total)} ฿ (${pct}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${Math.min(100, Math.max(5, pct))}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function showCategoryDrilldown(categoryName) {
  const transactions = window.AppState ? window.AppState.transactions : [];
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  const box = document.getElementById('dashDrilldownBox');
  const title = document.getElementById('drilldownTitle');
  const list = document.getElementById('drilldownList');
  if (!box || !title || !list) return;

  const itemSums = {};
  let catTotal = 0;

  transactions.forEach(t => {
    if (t.type === 'ex' && t.category === categoryName && t.date && t.date.startsWith(currentMonth)) {
      const amt = Number(t.amount) || 0;
      const desc = t.description || 'ไม่ระบุ';
      itemSums[desc] = (itemSums[desc] || 0) + amt;
      catTotal += amt;
    }
  });

  const sortedItems = Object.entries(itemSums).sort((a, b) => b[1] - a[1]);

  title.textContent = `🛒 รายการในหมวด "${categoryName}" (รวม ${window.formatMoney(catTotal)} ฿)`;
  list.innerHTML = sortedItems.map(([name, sum]) => {
    const pct = catTotal > 0 ? ((sum / catTotal) * 100).toFixed(1) : 0;
    return `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;">
        <span>${escapeHtml(name)}</span>
        <strong style="color:var(--text);">${window.formatMoney(sum)} ฿ <small style="color:var(--text-dim);">(${pct}%)</small></strong>
      </div>
    `;
  }).join('');

  box.classList.add('active');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeCategoryDrilldown() {
  const box = document.getElementById('dashDrilldownBox');
  if (box) box.classList.remove('active');
}

function renderDailyTip(monthIn, monthEx, categories) {
  const tipEl = document.getElementById('dashDailyTip');
  if (!tipEl) return;

  const balance = monthIn - monthEx;
  const margin = monthIn > 0 ? (balance / monthIn) * 100 : 0;

  let tipText = '💡 เริ่มต้นบันทึกรายรับและรายจ่ายทุกวัน เพื่อเห็นกำไรและต้นทุนแท้จริงของร้าน';

  if (monthIn > 0 && margin > 20) {
    tipText = `🌟 ยอดเยี่ยมมาก! อัตรากำไรเดือนนี้อยู่ที่ ${margin.toFixed(1)}% ร้านกำลังไปได้สวย รักษาระดับต้นทุนวัตถุดิบไว้เช่นนี้`;
  } else if (monthEx > monthIn && monthIn > 0) {
    // Check highest expense
    const topCat = Object.entries(categories).sort((a, b) => b[1].total - a[1].total)[0];
    if (topCat) {
      tipText = `⚠️ รายจ่ายเดือนนี้สูงกว่ารายรับ หมวดที่ใช้จ่ายสูงสุดคือ "${topCat[0]}" (${window.formatMoney(topCat[1].total)} ฿) ลองตรวจสอบรายการที่ไม่จำเป็น`;
    } else {
      tipText = '⚠️ รายจ่ายเดือนนี้สูงกว่ารายรับ ควรควบคุมค่าใช้จ่ายและเร่งยอดขายอาหาร';
    }
  } else if (monthIn > 0) {
    tipText = `📊 เดือนนี้มีรายรับรวม ${window.formatMoney(monthIn)} ฿ คงเหลือ ${window.formatMoney(balance)} ฿ ควบคุมต้นทุนวัตถุดิบให้อยู่ในสัดส่วนไม่เกิน 40% จะได้กำไรดีที่สุด`;
  }

  tipEl.textContent = tipText;
}

window.renderDashboard = renderDashboard;
window.showCategoryDrilldown = showCategoryDrilldown;
window.closeCategoryDrilldown = closeCategoryDrilldown;
