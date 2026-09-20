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
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.stack || err.message));
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

  // Test Case 5: Storefront Reverse Calculation Mode (e.g. Selling price 8,800 THB)
  console.log('--- TEST CASE 5 (STOREFRONT REVERSE CALCULATION) ---');
  await page.click('#btnModeStore');
  await page.click('#btnDirReverse');
  await page.click('button[data-mode="per_order"].shipping-mode-btn');

  // Input costs: Tire Cost 1850 per unit (1850 * 4 = 7400), Labor 50 (50 * 4 = 200), Shipping 100
  await page.fill('#inputTireCostPerUnit', '1850');
  await page.fill('#inputLaborPerUnit', '50');
  await page.fill('#inputShippingValue', '100');
  await page.fill('#inputTargetSellingPrice', '8800');

  // Calculation (VAT OFF):
  // Selling Price = 8800
  // Shipping = 100
  // Base without ship = 8700
  // Tire Cost = 7400
  // Labor Cost = 200
  // Profit = 8700 - 7400 - 200 = 1,100 THB (Profit per unit = 1100 / 4 = 275 THB/tire)
  const reverseProfitTotal = await page.innerText('#displayGrandTotal');
  const reverseProfitPerUnit = await page.innerText('#displayPricePerUnit');
  const reverseBannerText = await page.innerText('#reverseStatusBanner');

  console.log('Reverse Net Profit Total:', reverseProfitTotal);
  console.log('Reverse Net Profit Per Unit:', reverseProfitPerUnit);
  console.log('Reverse Banner Status:', reverseBannerText);

  if (reverseProfitTotal === '1,100' && reverseProfitPerUnit === '฿275') {
    console.log('✓ TEST 5A PASSED: Selling 8,800 gives net profit 1,100 THB (275 THB/tire)!');
  } else {
    console.error('✗ TEST 5A FAILED! Expected profit 1,100, got', reverseProfitTotal);
    process.exit(1);
  }

  // Test 5B: Turn on VAT 7% in Reverse Mode
  // Base without ship = 8800 - 100 = 8700
  // Pre-VAT base = 8700 / 1.07 = 8130.84
  // VAT = 8700 - 8130.84 = 569.16 -> 569 THB
  // Net Profit = 8130.84 - 7400 - 200 = 530.84 -> 531 THB
  // Profit per unit = 531 / 4 = 132.75 -> 133 THB
  await page.click('#toggleVat', { force: true });
  const reverseProfitVat = await page.innerText('#displayGrandTotal');
  const reverseVatAmount = await page.innerText('#displayVatAmount');
  console.log('Reverse Net Profit with VAT:', reverseProfitVat);
  console.log('Reverse VAT Amount:', reverseVatAmount);

  if (reverseProfitVat === '531' && reverseVatAmount === '฿569') {
    console.log('✓ TEST 5B PASSED: Reverse mode with VAT 7% properly extracts VAT 569 and leaves 531 profit!');
  } else {
    console.error('✗ TEST 5B FAILED! Expected profit 531, got', reverseProfitVat, 'VAT:', reverseVatAmount);
    process.exit(1);
  }

  // Test 5C: Loss scenario (Selling price 7000, VAT off)
  await page.click('#toggleVat', { force: true });
  await page.fill('#inputTargetSellingPrice', '7000');
  // 7000 - 100 - 7400 - 200 = -700 THB
  const reverseLossTotal = await page.innerText('#displayGrandTotal');
  const reverseLossBanner = await page.innerText('#reverseStatusBanner');
  console.log('Reverse Loss Total:', reverseLossTotal);
  console.log('Reverse Loss Banner:', reverseLossBanner);

  if (reverseLossTotal === '-700' && reverseLossBanner.includes('ระวัง! ขายราคานี้เข้าเนื้อ/ขาดทุน')) {
    console.log('✓ TEST 5C PASSED: Loss warning displayed correctly for negative profit -700 THB!');
  } else {
    console.error('✗ TEST 5C FAILED! Expected -700, got', reverseLossTotal);
    process.exit(1);
  }

  // Test Case 6: Test in index.html (Tab calculator)
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
    console.log('✓ TEST 6 PASSED: Tab Grand Total 9,950!');
  } else {
    console.error('✗ TEST 6 FAILED! Expected 9,950, got', tabGrandTotal);
    process.exit(1);
  }

  // Test Case 7: Google Sheet Integration, Supplier Tracking & Explicit Save
  console.log('--- TEST CASE 7 (GOOGLE SHEET INTEGRATION & SUPPLIER) ---');
  await page.goto(`${baseUrl}/calculator.html`);
  await page.waitForLoadState('networkidle');

  // 1. Verify preset supplier button
  await page.click('.supplier-preset-btn[data-val="SaveTyre"]');
  const supplierVal = await page.inputValue('#inputSupplierName');
  if (supplierVal === 'SaveTyre') {
    console.log('✓ TEST 7A PASSED: Supplier preset tag populated inputSupplierName with SaveTyre!');
  } else {
    console.error('✗ TEST 7A FAILED! Expected SaveTyre, got', supplierVal);
    process.exit(1);
  }

  // 2. Set details and verify NO automatic saving happens
  await page.fill('#inputTireName', 'Michelin Primacy 4 215/55R17');
  await page.fill('#inputQuoteNote', 'ลูกค้าประจำ รถ Camry ขอลดพิเศษ');
  await page.fill('#inputTireCostPerUnit', '3200');

  const historyBeforeSave = await page.innerText('#recentQuotesList');
  if (historyBeforeSave.includes('ยังไม่มีประวัติที่บันทึก')) {
    console.log('✓ TEST 7B PASSED: Strict rule satisfied: No automatic saving until user clicks save button!');
  } else {
    console.error('✗ TEST 7B FAILED! Expected empty history before clicking save, got', historyBeforeSave);
    process.exit(1);
  }

  // 3. Click explicit Save button
  await page.click('#btnSaveQuote');
  const historyAfterSave = await page.innerText('#recentQuotesList');
  if (historyAfterSave.includes('Michelin Primacy 4') && historyAfterSave.includes('SaveTyre') && historyAfterSave.includes('Camry')) {
    console.log('✓ TEST 7C PASSED: Quote explicitly saved with tire, supplier (SaveTyre), and customer note!');
  } else {
    console.error('✗ TEST 7C FAILED! Expected saved quote details, got', historyAfterSave);
    process.exit(1);
  }

  // 4. Test Google Sheet Settings Modal
  await page.click('#btnOpenSheetSettings');
  const isModalVisible = await page.isVisible('#modalGoogleSheetSettings');
  const sheetUrlValue = await page.inputValue('#inputSheetUrl');
  const appsScriptCode = await page.inputValue('#appsScriptCodeBlock');

  if (isModalVisible && sheetUrlValue.includes('1cccXVrTFSZqI8quqRuIducktcMAIVR7eg_uyZfEbTbs') && appsScriptCode.includes('function doPost(e)')) {
    console.log('✓ TEST 7D PASSED: Google Sheet settings modal opened with default sheet URL and ready-to-use Apps Script code!');
  } else {
    console.error('✗ TEST 7D FAILED! Modal visible:', isModalVisible, 'Sheet URL:', sheetUrlValue);
    process.exit(1);
  }

  // Close modal
  await page.click('#btnCloseSheetSettings');
  const isModalHidden = !(await page.isVisible('#modalGoogleSheetSettings'));
  if (isModalHidden) {
    console.log('✓ TEST 7E PASSED: Google Sheet settings modal closed cleanly!');
  } else {
    console.error('✗ TEST 7E FAILED! Modal was not hidden.');
    process.exit(1);
  }

  // 5. Test Mobile Sticky Bar Save Button
  await page.setViewportSize({ width: 390, height: 844 });
  await page.fill('#inputTireName', 'Bridgestone Turanza T005A');
  await page.click('.supplier-preset-btn[data-val="TopForm"]');
  await page.click('#btnMobileSave');
  const historyAfterMobileSave = await page.innerText('#recentQuotesList');
  if (historyAfterMobileSave.includes('Bridgestone Turanza') && historyAfterMobileSave.includes('TopForm')) {
    console.log('✓ TEST 7F PASSED: Mobile sticky bar save button successfully records inquiry to history on mobile screen!');
  } else {
    console.error('✗ TEST 7F FAILED! Expected TopForm quote saved from mobile button, got', historyAfterMobileSave);
    process.exit(1);
  }

  await browser.close();
  server.close();
  console.log('🎉 ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY!');
})();
