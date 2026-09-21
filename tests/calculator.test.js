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

  // ================= TEST CASE 8: BACK-OFFICE SETTINGS & FORMAL A4 QUOTATION =================
  console.log('--- TEST CASE 8 (BACK-OFFICE & FORMAL A4 QUOTATION) ---');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/calculator.html`);
  await page.waitForLoadState('networkidle');

  // 1. Open Back-Office Modal
  await page.click('#btnOpenBackOffice');
  const isBoVisible = await page.isVisible('#modalBackOfficeSettings');
  const defaultShopName = await page.inputValue('#boInputShopName');
  const defaultTaxId = await page.inputValue('#boInputShopTaxId');

  if (isBoVisible && defaultShopName.includes('หลงจื่อ กรุ๊ป') && defaultTaxId.includes('0105568120110')) {
    console.log('✓ TEST 8A PASSED: Back-Office opened with default Long Ci Group profile & Tax ID!');
  } else {
    console.error('✗ TEST 8A FAILED! Shop Name:', defaultShopName, 'Tax ID:', defaultTaxId);
    process.exit(1);
  }

  // 2. Add Bank Account row & edit phone in Back-Office
  await page.fill('#boInputShopTel', '099-888-7766');
  await page.click('#btnAddBankRow');
  const bankRowsCount = await page.locator('#boBankRowsContainer .bank-row').count();
  if (bankRowsCount >= 3) {
    console.log('✓ TEST 8B PASSED: Successfully added dynamic bank account row (Total: ' + bankRowsCount + ')!');
  } else {
    console.error('✗ TEST 8B FAILED! Expected >= 3 bank rows, got', bankRowsCount);
    process.exit(1);
  }

  // Fill in the new bank
  const lastBankNameInput = page.locator('#boBankRowsContainer .bank-row .bo-bank-name').last();
  const lastBankAccInput = page.locator('#boBankRowsContainer .bank-row .bo-bank-acc').last();
  const lastBankAccNameInput = page.locator('#boBankRowsContainer .bank-row .bo-bank-accname').last();
  await lastBankNameInput.fill('ธ.กสิกรไทย (KBANK)');
  await lastBankAccInput.fill('012-3-45678-9');
  await lastBankAccNameInput.fill('บจก. หหลงจื่อ กรุ๊ป');

  // Save Shop Profile
  await page.click('#btnSaveShopProfile');

  // 3. Switch to Tab 2: Customer Reply Templates
  await page.click('#btnTabBoTemplates');
  const isTabTplsActive = await page.isVisible('#boTabPaneTemplates');
  const tplBody = await page.inputValue('#boInputTemplateBody');
  const livePreview = await page.innerText('#boTemplateLivePreview');

  if (isTabTplsActive && tplBody.includes('{tire_name}') && livePreview.includes('ข้อเสนอราคาพิเศษ')) {
    console.log('✓ TEST 8C PASSED: Template editor active with dynamic chips and real-time live preview!');
  } else {
    console.error('✗ TEST 8C FAILED! Template pane active:', isTabTplsActive);
    process.exit(1);
  }

  // Test inserting chip
  await page.click('.bo-var-chip[data-var="{note}"]');
  const updatedTplBody = await page.inputValue('#boInputTemplateBody');
  if (updatedTplBody.includes('{note}')) {
    console.log('✓ TEST 8D PASSED: Variable chip {note} inserted into template body!');
  } else {
    console.error('✗ TEST 8D FAILED! Note chip not found in template');
    process.exit(1);
  }

  // Close Back-Office Modal
  await page.click('#btnCloseBackOffice');

  // 4. Test Formal Quotation Document (7,900 THB total matching user request)
  await page.fill('#inputTireName', 'ยาง 225/50R18 MICHELIN รุ่น E PRIMACY');
  await page.fill('#inputTireCostPerUnit', '1600');
  await page.fill('#inputLaborPerUnit', '50');
  await page.fill('#inputProfitValue', '300');
  await page.fill('#inputShippingValue', '100');
  // With 4 qty: cost=6400, labor=200, profit=1200, ship=100 => 7,900 THB
  const currentTotal = await page.innerText('#displayGrandTotal');
  if (currentTotal !== '7,900') {
    console.log('Adjusting to match 7,900 for quotation check (Current:', currentTotal, ')');
  }

  // Click Formal Quotation Button
  await page.click('#btnPrintQuote');
  const isQuoModalVisible = await page.isVisible('#modalQuotationPreview');
  const qoShopName = await page.innerText('#qoDisplayShopName');
  const qoShopTel = await page.innerText('#qoDisplayShopTel');
  const qoBahtText = await page.innerText('#qoDisplayBahtText');
  const qoGrandTotalRight = await page.innerText('#qoDisplayGrandTotalRight');

  console.log('Quotation Shop Name:', qoShopName);
  console.log('Quotation Shop Phone:', qoShopTel);
  console.log('Quotation Grand Total:', qoGrandTotalRight);
  console.log('Quotation Thai Baht Text:', qoBahtText);

  if (isQuoModalVisible && qoShopTel === '099-888-7766' && qoBahtText === 'เจ็ดพันเก้าร้อยบาทถ้วน') {
    console.log('✓ TEST 8E PASSED: Formal Quotation rendered with custom shop phone and exact Thai Baht text "เจ็ดพันเก้าร้อยบาทถ้วน"!');
  } else {
    console.error('✗ TEST 8E FAILED! Modal visible:', isQuoModalVisible, 'Baht Text:', qoBahtText, 'Tel:', qoShopTel);
    process.exit(1);
  }

  // 5. Test Quick Customer Input Live Sync
  await page.click('#modalQuotationPreview details summary');
  await page.fill('#qoInputCustomerName', 'บริษัท ทดสอบการค้า จำกัด');
  const syncedCustomerName = await page.innerText('#qoDisplayCustomerName');
  if (syncedCustomerName === 'บริษัท ทดสอบการค้า จำกัด') {
    console.log('✓ TEST 8F PASSED: Customer name input live-synced to quotation document view!');
  } else {
    console.error('✗ TEST 8F FAILED! Expected synced customer name, got', syncedCustomerName);
    process.exit(1);
  }

  // Close Quotation Preview Modal
  await page.click('#btnCloseQuotationPreview');
  const isQuoModalClosed = !(await page.isVisible('#modalQuotationPreview'));
  if (isQuoModalClosed) {
    console.log('✓ TEST 8G PASSED: Formal quotation modal closed cleanly!');
  } else {
    console.error('✗ TEST 8G FAILED! Quotation modal not hidden.');
    process.exit(1);
  }

  // --- TEST CASE 9: PEAK ACCOUNT API OWN-USE INTEGRATION ---
  console.log('--- TEST CASE 9 (PEAK ACCOUNT API OWN-USE INTEGRATION) ---');

  // 1. Open Back-Office and switch to PEAK Account tab
  await page.click('#btnOpenBackOffice');
  await page.click('#btnTabBoPeak');
  const isPeakPaneVisible = await page.isVisible('#boTabPanePeak');
  if (isPeakPaneVisible) {
    console.log('✓ TEST 9A PASSED: Back-Office switched to Tab 3 (PEAK Account API Own-Use)!');
  } else {
    console.error('✗ TEST 9A FAILED: boTabPanePeak is not visible.');
    process.exit(1);
  }

  // 2. Test toggle password visibility for Connect ID
  const connectIdTypeBefore = await page.getAttribute('#boInputPeakConnectId', 'type');
  await page.click('#btnTogglePeakConnectId');
  const connectIdTypeAfter = await page.getAttribute('#boInputPeakConnectId', 'type');
  if (connectIdTypeBefore === 'password' && connectIdTypeAfter === 'text') {
    console.log('✓ TEST 9B PASSED: Connect ID password show/hide toggle works!');
  } else {
    console.error('✗ TEST 9B FAILED: Password toggle failed. Before:', connectIdTypeBefore, 'After:', connectIdTypeAfter);
    process.exit(1);
  }

  // 3. Fill in PEAK Credentials and Save
  await page.fill('#boInputPeakConnectId', 'conn_test_mock_secret_9988');
  await page.fill('#boInputPeakUserToken', 'usr_test_mock_company_token_7766');
  await page.click('#btnSavePeakConfig');

  // Verify status indicator changed to active
  const peakStatusTitle = await page.innerText('#boPeakStatusTitle');
  console.log('PEAK Status Title:', peakStatusTitle);
  if (peakStatusTitle.includes('พร้อมเชื่อมต่อ PEAK Account')) {
    console.log('✓ TEST 9C PASSED: PEAK settings saved & status updated to "พร้อมเชื่อมต่อ PEAK Account"!');
  } else {
    console.error('✗ TEST 9C FAILED: Expected ready status, got', peakStatusTitle);
    process.exit(1);
  }

  // Close Back-Office
  await page.click('#btnCloseBackOffice');

  // 4. Open Quotation modal and verify PEAK Sync button
  await page.click('#btnPrintQuote');
  const isSyncBtnVisible = await page.isVisible('#btnSyncToPeakQuotation');
  if (isSyncBtnVisible) {
    console.log('✓ TEST 9D PASSED: "ส่งเข้าบัญชี PEAK" button present in Quotation modal!');
  } else {
    console.error('✗ TEST 9D FAILED: btnSyncToPeakQuotation is missing.');
    process.exit(1);
  }

  // 5. Test PEAK Payload generation schema and date formatting (Matching PDF Page 42-51)
  const payload = await page.evaluate(() => buildPeakQuotationPayload());
  console.log('Generated PEAK Quotation Payload:', JSON.stringify(payload, null, 2));

  const validDateRegex = /^\d{8}$/;
  const rootQuote = payload.PeakQuotations?.quotations?.[0];
  if (
    validDateRegex.test(payload.issuedDate) &&
    validDateRegex.test(payload.dueDate) &&
    rootQuote &&
    rootQuote.contact?.name &&
    rootQuote.products?.[0]?.vatType === 1 && // 1 = ไม่มี VAT (PDF Page 44)
    payload.products &&
    payload.products[0].quantity === 4
  ) {
    console.log(`✓ TEST 9E PASSED: PEAK Quotation Payload validated! PeakQuotations root, vatType=${rootQuote.products[0].vatType} (1=No VAT), IssueDate=${payload.issuedDate}, DueDate=${payload.dueDate}`);
  } else {
    console.error('✗ TEST 9E FAILED: Invalid PEAK payload structure:', payload);
    process.exit(1);
  }

  // 6. Test Apps Script Template enhancement includes PEAK actions
  const peakAppsScriptCode = await page.evaluate(() => APPS_SCRIPT_TEMPLATE);
  if (
    peakAppsScriptCode.includes('createPeakQuotation') &&
    peakAppsScriptCode.includes('testPeakConnection') &&
    peakAppsScriptCode.includes('Utilities.computeHmacSha1Signature') &&
    peakAppsScriptCode.includes('CacheService.getScriptCache()')
  ) {
    console.log('✓ TEST 9F PASSED: Google Apps Script template includes HMAC-SHA1 signature, ClientToken caching, and PEAK Quotation actions!');
  } else {
    console.error('✗ TEST 9F FAILED: APPS_SCRIPT_TEMPLATE missing PEAK actions.');
    process.exit(1);
  }

  // Close Quotation Preview
  await page.click('#btnCloseQuotationPreview');

  await browser.close();
  server.close();
  console.log('🎉 ALL AUTOMATED TESTS (1-9) COMPLETED SUCCESSFULLY!');
})();
