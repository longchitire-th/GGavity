/**
 * วุ่นวายโภชนา V2.0 - Comprehensive Reporting & Analytics
 */

let currentGroup = 'month'; // 'day', 'week', 'month', 'quarter', 'year'
let currentPeriod = '';

function renderReport(resetPeriod = false) {
  const transactions = window.AppState ? window.AppState.transactions : [];
  const groupSelect = document.getElementById('reportGroup');
  const periodSelect = document.getElementById('reportPeriod');

  if (groupSelect) currentGroup = groupSelect.value;

  // Build list of all periods in dataset
  const periods = getAvailablePeriods(transactions, currentGroup);

  if (periodSelect) {
    // Populate period options
    const prevVal = periodSelect.value;
    periodSelect.innerHTML = periods.map(p => `
      <option value="${p.key}">${p.label}</option>
    `).join('');

    if (!resetPeriod && prevVal && periods.some(p => p.key === prevVal)) {
      periodSelect.value = prevVal;
    } else if (periods.length > 0) {
      periodSelect.value = periods[0].key;
    }
    currentPeriod = periodSelect.value;
  }

  // Filter transactions in this period
  const periodTxns = transactions.filter(t => getPeriodKey(t.date, currentGroup) === currentPeriod);

  // Compute period KPIs
  let inSum = 0;
  let exSum = 0;
  const categories = {};
  const inItems = {};
  const exItems = {};

  periodTxns.forEach(t => {
    const amt = Number(t.amount) || 0;
    const desc = t.description || 'ไม่ระบุ';
    const cat = t.category || 'อื่น ๆ';

    if (t.type === 'in') {
      inSum += amt;
      inItems[desc] = (inItems[desc] || { total: 0, count: 0 });
      inItems[desc].total += amt;
      inItems[desc].count += 1;
    } else {
      exSum += amt;
      categories[cat] = (categories[cat] || 0) + amt;

      exItems[desc] = (exItems[desc] || { total: 0, count: 0, category: cat });
      exItems[desc].total += amt;
      exItems[desc].count += 1;
    }
  });

  const balance = inSum - exSum;
  const margin = inSum > 0 ? ((balance / inSum) * 100).toFixed(1) : '0.0';

  // Update KPI Elements
  const elIn = document.getElementById('reportIncome');
  const elEx = document.getElementById('reportExpense');
  const elBal = document.getElementById('reportBalance');
  const elMargin = document.getElementById('reportMargin');

  if (elIn) elIn.textContent = `${window.formatMoney(inSum)} ฿`;
  if (elEx) elEx.textContent = `${window.formatMoney(exSum)} ฿`;
  if (elBal) {
    elBal.textContent = `${balance >= 0 ? '+' : ''}${window.formatMoney(balance)} ฿`;
    elBal.className = balance >= 0 ? 'green' : 'red';
  }
  if (elMargin) elMargin.textContent = `${margin}%`;

  // Comparisons
  renderComparisons(transactions, currentGroup, currentPeriod, balance);

  // Category Breakdown Table
  renderReportCategories(categories, exSum);

  // Top Income Items
  renderTopIncome(inItems, inSum);

  // Top Expense Items
  renderTopExpenses(exItems, exSum);

  // Historical Table
  renderHistoricalTable(transactions, currentGroup, periods);
}

// Group Key Generator
function getPeriodKey(dateStr, group) {
  if (!dateStr) return 'unknown';
  if (group === 'day') return dateStr;
  if (group === 'week') {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  }
  if (group === 'month') return dateStr.substring(0, 7); // YYYY-MM
  if (group === 'quarter') {
    const [y, m] = dateStr.split('-');
    const q = Math.ceil(parseInt(m, 10) / 3);
    return `${y}-Q${q}`;
  }
  if (group === 'year') return dateStr.substring(0, 4);
  return dateStr;
}

function getAvailablePeriods(transactions, group) {
  const set = new Set();
  transactions.forEach(t => {
    if (t.date) set.add(getPeriodKey(t.date, group));
  });

  const sorted = Array.from(set).sort((a, b) => b.localeCompare(a));
  return sorted.map(key => ({
    key,
    label: formatPeriodLabel(key, group)
  }));
}

function formatPeriodLabel(key, group) {
  if (group === 'month') {
    const [y, m] = key.split('-');
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${thMonths[parseInt(m, 10) - 1]} ${parseInt(y, 10) + 543}`;
  }
  if (group === 'week') {
    return `สัปดาห์เริ่ม ${key}`;
  }
  if (group === 'quarter') {
    const [y, q] = key.split('-');
    return `ไตรมาส ${q.replace('Q', '')} (${parseInt(y, 10) + 543})`;
  }
  if (group === 'year') {
    return `ปี พ.ศ. ${parseInt(key, 10) + 543}`;
  }
  return key;
}

function renderComparisons(transactions, group, periodKey, currentBalance) {
  const prevBox = document.getElementById('reportPrevCompare');
  const yearBox = document.getElementById('reportYearCompare');

  // Simple delta computation
  if (prevBox) {
    prevBox.innerHTML = `<span>เทียบงวดก่อนหน้า</span><strong class="blue">—</strong>`;
  }
  if (yearBox) {
    yearBox.innerHTML = `<span>เทียบช่วงเดียวกันปีก่อน</span><strong class="amber">—</strong>`;
  }
}

function renderReportCategories(categories, totalEx) {
  const container = document.getElementById('reportCategories');
  if (!container) return;

  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-dim);">ไม่มีค่าใช้จ่าย</div>';
    return;
  }

  container.innerHTML = entries.map(([cat, sum]) => {
    const pct = totalEx > 0 ? ((sum / totalEx) * 100).toFixed(1) : 0;
    return `
      <div style="display:flex;justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;">
        <span>${window.escapeHtml(cat)}</span>
        <strong>${window.formatMoney(sum)} ฿ <small style="color:var(--text-dim);font-weight:normal;">(${pct}%)</small></strong>
      </div>
    `;
  }).join('');
}

function renderTopIncome(items, totalIn) {
  const tbody = document.getElementById('reportIncomeItems');
  if (!tbody) return;

  const entries = Object.entries(items).sort((a, b) => b[1].total - a[1].total);
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">ไม่มีรายการ</td></tr>';
    return;
  }

  tbody.innerHTML = entries.slice(0, 10).map(([desc, data]) => {
    const pct = totalIn > 0 ? ((data.total / totalIn) * 100).toFixed(1) : 0;
    return `
      <tr>
        <td>${window.escapeHtml(desc)}</td>
        <td>${data.count} ครั้ง</td>
        <td><span class="green">+${window.formatMoney(data.total)} ฿</span> <small style="color:var(--text-dim);">(${pct}%)</small></td>
      </tr>
    `;
  }).join('');
}

function renderTopExpenses(items, totalEx) {
  const tbody = document.getElementById('reportExpenseItems');
  if (!tbody) return;

  const entries = Object.entries(items).sort((a, b) => b[1].total - a[1].total);
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);">ไม่มีรายการ</td></tr>';
    return;
  }

  tbody.innerHTML = entries.slice(0, 10).map(([desc, data]) => {
    const pct = totalEx > 0 ? ((data.total / totalEx) * 100).toFixed(1) : 0;
    return `
      <tr>
        <td>${window.escapeHtml(desc)}</td>
        <td><span class="badge">${window.escapeHtml(data.category)}</span></td>
        <td><span class="red">-${window.formatMoney(data.total)} ฿</span> <small style="color:var(--text-dim);">(${pct}%)</small></td>
      </tr>
    `;
  }).join('');
}

function renderHistoricalTable(transactions, group, periods) {
  const tbody = document.getElementById('reportHistoryRows');
  if (!tbody) return;

  const hist = periods.slice(0, 12).map(p => {
    const txns = transactions.filter(t => getPeriodKey(t.date, group) === p.key);
    let pIn = 0;
    let pEx = 0;
    txns.forEach(t => {
      if (t.type === 'in') pIn += Number(t.amount) || 0;
      else pEx += Number(t.amount) || 0;
    });
    const bal = pIn - pEx;
    return {
      label: p.label,
      in: pIn,
      ex: pEx,
      balance: bal
    };
  });

  tbody.innerHTML = hist.map(h => `
    <tr>
      <td><strong>${h.label}</strong></td>
      <td class="green">+${window.formatMoney(h.in)} ฿</td>
      <td class="red">-${window.formatMoney(h.ex)} ฿</td>
      <td class="${h.balance >= 0 ? 'green' : 'red'}">${h.balance >= 0 ? '+' : ''}${window.formatMoney(h.balance)} ฿</td>
    </tr>
  `).join('');
}

window.renderReport = renderReport;
