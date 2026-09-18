const { chromium } = require('playwright');
const path = require('path');
const express = require('express');

(async () => {
  // Start ephemeral static server for testing
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/calculator.html`);

  console.log('Testing public/calculator.html...');

  // Test Case 1: Qty 4, Cost 1500, Labor 50, Profit 300, Shipping 100, VAT off
  await page.fill('#inputTireCostPerUnit', '1500');
  await page.fill('#inputLaborPerUnit', '50');
  await page.fill('#inputProfitValue', '300');
  await page.fill('#inputShippingValue', '100');

  const grandTotal = await page.innerText('#displayGrandTotal');
  const pricePerUnit = await page.innerText('#displayPricePerUnit');
  const totalTireCost = await page.innerText('#displayTotalTireCost');
  const totalLaborCost = await page.innerText('#displayTotalLaborCost');
  const totalProfit = await page.innerText('#displayTotalProfit');
  const totalShipping = await page.innerText('#displayTotalShipping');

  console.log('--- TEST CASE 1 (VAT OFF) ---');
  console.log('Grand Total:', grandTotal);
  console.log('Price Per Unit:', pricePerUnit);
  console.log('Tire Cost:', totalTireCost);
  console.log('Labor Cost:', totalLaborCost);
  console.log('Profit:', totalProfit);
  console.log('Shipping:', totalShipping);

  if (grandTotal === '7,500' && pricePerUnit === '฿1,875') {
    console.log('✓ TEST 1 PASSED: 7,500 total, 1,875 per tire!');
  } else {
    console.error('✗ TEST 1 FAILED! Expected 7,500, got', grandTotal);
    process.exit(1);
  }

  // Test Case 2: Turn on VAT 7%
  await page.click('#toggleVat', { force: true });
  const grandTotalVat = await page.innerText('#displayGrandTotal');
  const vatAmount = await page.innerText('#displayVatAmount');
  console.log('--- TEST CASE 2 (VAT ON) ---');
  console.log('VAT Amount:', vatAmount);
  console.log('Grand Total with VAT:', grandTotalVat);
  // Base = 6000 + 200 + 1200 = 7400, VAT 7% = 518, Shipping = 100 => 7400 + 518 + 100 = 8,018
  if (grandTotalVat === '8,018' && vatAmount === '฿518') {
    console.log('✓ TEST 2 PASSED: VAT 518, Total 8,018!');
  } else {
    console.error('✗ TEST 2 FAILED! Expected 8,018, got', grandTotalVat);
    process.exit(1);
  }

  // Test Case 3: Shipping per unit (30 THB * 4 = 120)
  await page.click('button[data-mode="per_unit"].shipping-mode-btn');
  await page.fill('#inputShippingValue', '30');
  const grandTotalShipUnit = await page.innerText('#displayGrandTotal');
  const totalShippingUnit = await page.innerText('#displayTotalShipping');
  console.log('--- TEST CASE 3 (SHIPPING PER UNIT) ---');
  console.log('Shipping Cost:', totalShippingUnit);
  console.log('Grand Total with Shipping per Unit:', grandTotalShipUnit);
  // 7400 + 518 + 120 = 8038
  if (grandTotalShipUnit === '8,038' && totalShippingUnit === '฿120') {
    console.log('✓ TEST 3 PASSED: Shipping 120, Total 8,038!');
  } else {
    console.error('✗ TEST 3 FAILED! Expected 8,038, got', grandTotalShipUnit);
    process.exit(1);
  }

  // Test Case 4: Dual Mode - Online Marketplace GP% Mode
  console.log('--- TEST CASE 4 (ONLINE PLATFORM GP%) ---');
  await page.click('#btnModeOnline');
  // Turn off VAT for pure GP calculation check
  await page.click('#toggleVat', { force: true });
  await page.fill('#inputTireCostPerUnit', '1500');
  await page.fill('#inputProfitValue', '300');
  await page.fill('#inputOnlineShipPerUnit', '0');
  await page.fill('#inputGpPercent', '15.0');

  // Base = 1500*4 (cost) + 0 (ship) + 300*4 (profit) = 7200
  // Target Required = 7200
  // Listing Price = 7200 / (1 - 0.15) = 8470.58 -> 8,471 THB
  // GP Deduction = 8471 * 0.15 = 1270.65 -> 1,271 THB
  // Net Payout = 8471 - 1271 = 7,200 THB
  const onlineListingPrice = await page.innerText('#displayGrandTotal');
  const onlineNetPayout = await page.innerText('#bdNetPayout');
  const onlineProfit = await page.innerText('#bdProfitCost');
  const onlineGpAmount = await page.innerText('#bdGpAmount');

  console.log('Online Listing Price:', onlineListingPrice);
  console.log('Online Net Payout to Shop:', onlineNetPayout);
  console.log('Online Profit:', onlineProfit);
  console.log('Online GP Deduction:', onlineGpAmount);

  if (onlineListingPrice === '8,471' && onlineNetPayout === '฿7,200' && onlineProfit === '+฿1,200') {
    console.log('✓ TEST 4 PASSED: Online Listing 8,471 with Net Payout 7,200 perfectly covers cost and profit without loss!');
  } else {
    console.error('✗ TEST 4 FAILED! Listing:', onlineListingPrice, 'Payout:', onlineNetPayout);
    process.exit(1);
  }

  // Test Case 5: Test in index.html (Tab calculator)
  await page.goto(`${baseUrl}/`);
  await page.waitForLoadState('networkidle');
  await page.click('button[data-tab="tab-calculator"]');

  await page.fill('#tabInputTireCostPerUnit', '2000');
  await page.fill('#tabInputLaborPerUnit', '50');
  await page.fill('#tabInputProfitValue', '400');
  await page.fill('#tabInputShippingValue', '150');

  const tabGrandTotal = await page.innerText('#tabDisplayGrandTotal');
  const tabPricePerUnit = await page.innerText('#tabDisplayPricePerUnit');
  console.log('--- TEST CASE 4 (INDEX.HTML TAB CALCULATOR) ---');
  console.log('Tab Grand Total:', tabGrandTotal);
  console.log('Tab Price Per Unit:', tabPricePerUnit);
  // 4 * 2000 = 8000 tire cost, 4 * 50 = 200 labor, 4 * 400 = 1600 profit, ship = 150 => 9,950 total, 2,488 per tire
  if (tabGrandTotal === '9,950') {
    console.log('✓ TEST 4 PASSED: Tab Grand Total 9,950!');
  } else {
    console.error('✗ TEST 4 FAILED! Expected 9,950, got', tabGrandTotal);
    process.exit(1);
  }

  await browser.close();
  server.close();
  console.log('🎉 ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY!');
})();
