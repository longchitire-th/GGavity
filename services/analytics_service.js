const db = require('./db');

class AnalyticsService {
  getSummary(date = null) {
    const allOrders = db.getOrders();
    const today = date || new Date().toISOString().split('T')[0];

    // Filter today's orders based on cutoffDate or created date
    const todayOrders = allOrders.filter(o => o.cutoffDate === today || (o.createdAt && o.createdAt.startsWith(today)));

    // 1. Expense Breakdown
    let totalExpenseToday = 0;
    let totalTireCostToday = 0;
    let totalShippingToday = 0;
    let totalTiresCountToday = 0;

    // Status counts
    let readyCount = 0;
    let outOfStockCount = 0;
    let pendingCount = 0;
    let slipsUploadedCount = 0;

    todayOrders.forEach(o => {
      totalExpenseToday += (o.totalCost || 0);
      totalTireCostToday += ((o.quantity || 0) * (o.pricePerUnit || 0));
      totalShippingToday += (o.shippingFee || 0);
      totalTiresCountToday += (o.quantity || 0);

      if (o.status === 'สั่งแล้ว (ส่งได้)' || o.status === 'ส่งได้' || o.status === 'สั่งแล้ว') readyCount++;
      else if (o.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || o.status === 'ขาดตลาด' || o.status === 'ยกเลิก') outOfStockCount++;
      else pendingCount++;

      if (o.slipUrl) slipsUploadedCount++;
    });

    // 2. Best Sellers (สินค้าขายดี - Total history & Today)
    const productStats = {};
    allOrders.forEach(o => {
      const name = o.productName.trim();
      if (!name) return;
      if (!productStats[name]) {
        productStats[name] = {
          name,
          totalQty: 0,
          orderCount: 0,
          outOfStockCount: 0,
          totalSpent: 0
        };
      }
      productStats[name].totalQty += (o.quantity || 0);
      productStats[name].orderCount += 1;
      productStats[name].totalSpent += (o.totalCost || 0);
      if (o.status === 'สินค้าขาดตลาด (ส่งไม่ได้)' || o.status === 'ขาดตลาด') {
        productStats[name].outOfStockCount += 1;
      }
    });

    const statList = Object.values(productStats);

    // Top Best Sellers (sort by total quantity)
    const bestSellers = [...statList]
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);

    // Most Frequent Out-of-Stock (sort by outOfStockCount)
    const outOfStockFrequent = [...statList]
      .filter(p => p.outOfStockCount > 0)
      .sort((a, b) => b.outOfStockCount - a.outOfStockCount)
      .slice(0, 10);

    // 3. Supplier Breakdown (ยอดซื้อแยกตามซับ)
    const supplierStats = {};
    todayOrders.forEach(o => {
      const sup = o.supplier || 'ยังไม่ได้ระบุซับ';
      if (!supplierStats[sup]) {
        supplierStats[sup] = {
          supplier: sup,
          tireQty: 0,
          totalCost: 0,
          ordersCount: 0
        };
      }
      supplierStats[sup].tireQty += (o.quantity || 0);
      supplierStats[sup].totalCost += (o.totalCost || 0);
      supplierStats[sup].ordersCount += 1;
    });

    return {
      date: today,
      today: {
        totalOrders: todayOrders.length,
        totalTiresCount: totalTiresCountToday,
        totalExpense: totalExpenseToday,
        totalTireCost: totalTireCostToday,
        totalShipping: totalShippingToday,
        readyCount,
        outOfStockCount,
        pendingCount,
        slipsUploadedCount,
        missingSlipsCount: todayOrders.length - slipsUploadedCount
      },
      supplierBreakdown: Object.values(supplierStats),
      bestSellers,
      outOfStockFrequent
    };
  }
}

module.exports = new AnalyticsService();
