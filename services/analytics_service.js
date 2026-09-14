const dbService = require('./db_service');

function getDashboardSummary(dateStr) {
  const transactions = dbService.getAllTransactions();
  const today = dateStr || new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7); // YYYY-MM

  // Today
  let todayIncome = 0;
  let todayExpense = 0;
  let todayBoxes = 0;

  // Current Month
  let monthIncome = 0;
  let monthExpense = 0;
  const monthCategories = {};
  const monthItems = {};
  const activeDays = new Set();

  transactions.forEach(t => {
    const amt = Number(t.amount) || 0;
    const tDate = t.date || '';

    if (tDate === today) {
      if (t.type === 'in') {
        todayIncome += amt;
        todayBoxes += (Number(t.boxes) || 0);
      } else {
        todayExpense += amt;
      }
    }

    if (tDate.startsWith(currentMonth)) {
      if (t.type === 'in') {
        monthIncome += amt;
        activeDays.add(tDate);
      } else {
        monthExpense += amt;
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

  const monthBalance = monthIncome - monthExpense;
  const marginPct = monthIncome > 0 ? ((monthBalance / monthIncome) * 100).toFixed(1) : '0.0';
  const saleDaysCount = activeDays.size;
  const avgIncomePerDay = saleDaysCount > 0 ? (monthIncome / saleDaysCount).toFixed(0) : '0';

  // Format category list sorted by amount descending
  const categoriesList = Object.keys(monthCategories).map(cat => {
    const info = monthCategories[cat];
    const pct = monthExpense > 0 ? ((info.total / monthExpense) * 100).toFixed(1) : '0.0';
    const topItems = Object.entries(info.items)
      .sort((a, b) => b[1] - a[1])
      .map(([name, sum]) => ({ name, sum }));
    return {
      category: cat,
      total: info.total,
      count: info.count,
      percent: Number(pct),
      items: topItems
    };
  }).sort((a, b) => b.total - a.total);

  return {
    today: {
      date: today,
      income: todayIncome,
      expense: todayExpense,
      balance: todayIncome - todayExpense,
      boxes: todayBoxes
    },
    month: {
      month: currentMonth,
      income: monthIncome,
      expense: monthExpense,
      balance: monthBalance,
      margin: Number(marginPct),
      saleDays: saleDaysCount,
      avgIncome: Number(avgIncomePerDay),
      categories: categoriesList
    }
  };
}

// Generate CSV export
function generateCsv(transactions) {
  const headers = ['รหัสอัตโนมัติ', 'วันที่', 'ประเภท', 'หมวด', 'รายการ', 'จำนวนเงิน (บาท)', 'จำนวนกล่อง', 'ช่องทางรับ/จ่าย', 'ผู้บันทึก', 'หมายเหตุ'];
  const rows = transactions.map(t => [
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

  // Prepend UTF-8 BOM (\uFEFF) for Excel Thai compatibility
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

module.exports = {
  getDashboardSummary,
  generateCsv
};
