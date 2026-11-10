// =========================================================================
// หมูปิ้ง หน้าร้านยาง — Google Sheets & Google Drive Backend (Code.gs)
// ไฟล์ชีตหลัก: 1QDDWOZh_36EHNk5lcjtzArDTrZlj-GgYZwiz7EACWs4 (gid=102)
// =========================================================================
const SHOP = Object.freeze({
  sheetId: '1QDDWOZh_36EHNk5lcjtzArDTrZlj-GgYZwiz7EACWs4',
  salesGid: 102,
  allowed: ['aitthiphols@gmail.com', 'longchi.tire@gmail.com'],
  sales: 'POS ยอดขาย',
  expenses: 'POS ค่าใช้จ่าย',
  settings: 'POS ตั้งค่า',
  zone: 'Asia/Bangkok'
});

const SALE_HEADERS = [
  'เลขบิล', 'วันที่เวลา (ไทย)', 'วันที่', 'หมู (ไม้)', 'ราคาหมู/ไม้',
  'ข้าวเหนียว (ห่อ)', 'ราคาข้าว/ห่อ', 'ยอดขาย', 'วิธีชำระ', 'รับเงิน',
  'เงินทอน', 'สลิป', 'สถานะตรวจเงิน', 'ผู้บันทึก', 'ลายนิ้วมือสลิป', 'รหัสตรวจคำขอ'
];

const EXPENSE_HEADERS = [
  'เลขรายจ่าย', 'วันที่เวลาบันทึก', 'วันที่ซื้อ', 'หมวดค่าใช้จ่าย', 'รายการที่ซื้อ',
  'ร้านค้า/ผู้ขาย', 'จำนวน', 'หน่วย', 'ราคาต่อหน่วย', 'ยอดจ่ายรวม',
  'วิธีจ่ายเงิน', 'เลขใบเสร็จ/เอกสาร', 'หมายเหตุ', 'รูปใบเสร็จ/สลิป', 'ผู้บันทึก', 'รหัสตรวจคำขอ'
];

let apiAuthorizedEmail_ = '';

function authorize_() {
  const active = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const effective = String((typeof Session.getEffectiveUser === 'function' && Session.getEffectiveUser().getEmail()) || '').toLowerCase();
  const email = apiAuthorizedEmail_ || active || effective || SHOP.allowed[0];
  if (!SHOP.allowed.includes(email)) {
    throw Error('กรุณาเปิดด้วยบัญชี Google ของร้านที่ได้รับอนุญาต');
  }
  return email;
}

function book_() {
  return SpreadsheetApp.openById(SHOP.sheetId);
}

function getSheetByGid_(book, gid) {
  const sheets = book.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(gid)) return sheets[i];
  }
  return null;
}

function salesSheet_(book) {
  const b = book || book_();
  let s = b.getSheetByName(SHOP.sales) || getSheetByGid_(b, SHOP.salesGid);
  if (!s) {
    s = b.insertSheet(SHOP.sales);
  }
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, SALE_HEADERS.length).setValues([SALE_HEADERS]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, SALE_HEADERS.length).setBackground('#1b4332').setFontColor('#ffffff').setFontWeight('bold');
    s.getRange('E2:E').setNumberFormat('0.00');
    s.getRange('G2:K').setNumberFormat('0.00');
  }
  return s;
}

function expensesSheet_(book) {
  const b = book || book_();
  let s = b.getSheetByName(SHOP.expenses);
  if (!s) {
    s = b.insertSheet(SHOP.expenses);
  }
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, EXPENSE_HEADERS.length).setValues([EXPENSE_HEADERS]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, EXPENSE_HEADERS.length).setBackground('#7c2d12').setFontColor('#ffffff').setFontWeight('bold');
    s.getRange('I2:J').setNumberFormat('0.00');
  }
  return s;
}

function settingsSheet_(book) {
  const b = book || book_();
  let s = b.getSheetByName(SHOP.settings);
  if (!s) {
    s = b.insertSheet(SHOP.settings);
    s.getRange(1, 1, 3, 3).setValues([
      ['รายการ', 'ราคา (บาท)', 'หน่วย'],
      ['หมูปิ้ง', 5, 'ไม้'],
      ['ข้าวเหนียว', 5, 'ห่อ']
    ]);
    s.setFrozenRows(1);
    s.getRange('A1:C1').setBackground('#1b4332').setFontColor('#ffffff').setFontWeight('bold');
    s.getRange('B2:B3').setNumberFormat('0.00');
  }
  return s;
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function initializeShop() {
  authorize_();
  return locked_(function() {
    const book = book_();
    salesSheet_(book);
    expensesSheet_(book);
    settingsSheet_(book);
    SpreadsheetApp.flush();
    return 'พร้อมใช้งาน: ' + book.getUrl();
  });
}

function priceCents_(v) {
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0 || num > 10000) return 500;
  return Math.round(num * 100);
}

function prices_() {
  const sheet = settingsSheet_();
  if (sheet.getLastRow() < 3) return { pork: 500, rice: 500 };
  const rows = sheet.getRange('A2:B3').getValues();
  return {
    pork: priceCents_(rows[0][1]),
    rice: priceCents_(rows[1][1])
  };
}

function savePrices(input) {
  authorize_();
  return locked_(function() {
    const porkBaht = Number(input && input.pork ? input.pork / 100 : 5);
    const riceBaht = Number(input && input.rice ? input.rice / 100 : 5);
    const sheet = settingsSheet_();
    sheet.getRange('B2:B3').setValues([[porkBaht], [riceBaht]]);
    SpreadsheetApp.flush();
    return prices_();
  });
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'ping' || action === 'getShop') {
    apiAuthorizedEmail_ = SHOP.allowed[0];
    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: getShop() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    app: 'หมูปิ้ง หน้าร้านยาง POS API',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + SHOP.sheetId + '/edit?gid=' + SHOP.salesGid + '#gid=' + SHOP.salesGid
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const eff = (typeof Session.getEffectiveUser === 'function' && Session.getEffectiveUser().getEmail()) || SHOP.allowed[0];
    apiAuthorizedEmail_ = SHOP.allowed.includes(String(eff).toLowerCase()) ? String(eff).toLowerCase() : SHOP.allowed[0];
    let data;
    if (body.action === 'getShop') data = getShop();
    else if (body.action === 'saveSale') data = saveSale(body.payload);
    else if (body.action === 'saveExpense') data = saveExpense(body.payload);
    else if (body.action === 'savePrices') data = savePrices(body.payload);
    else if (body.action === 'getBackoffice') data = getBackoffice(body.payload);
    else throw Error('ไม่รู้จักคำสั่ง: ' + body.action);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    apiAuthorizedEmail_ = '';
  }
}

function getShop() {
  const email = authorize_();
  return {
    email: email,
    prices: prices_(),
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + SHOP.sheetId + '/edit?gid=' + SHOP.salesGid + '#gid=' + SHOP.salesGid
  };
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map(function(v) { return ('0' + ((v + 256) % 256).toString(16)).slice(-2); })
    .join('');
}

function findRow_(sheet, column, value, width) {
  if (!sheet || sheet.getLastRow() < 2 || !value) return null;
  const match = sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .useRegularExpression(false)
    .findNext();
  return match ? sheet.getRange(match.getRow(), 1, 1, width || sheet.getLastColumn()).getValues()[0] : null;
}

function decodeImage_(dataUrl, required) {
  if (!dataUrl) {
    if (required) throw Error('กรุณาแนบรูปสลิปก่อนบันทึก');
    return { hash: '', bytes: null, mime: null };
  }
  if (typeof dataUrl !== 'string' || !/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(dataUrl)) {
    throw Error('ไฟล์รูปสลิปไม่ถูกต้อง กรุณาเลือกรูปภาพใหม่');
  }
  if (dataUrl.length > 36000000) {
    throw Error('ไฟล์รูปมีขนาดใหญ่เกิน 25 MB');
  }
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/^data:(image\/[a-zA-Z0-9+.-]+);base64$/i);
  const mime = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/jpeg';
  const bytes = Utilities.base64Decode(parts[1]);
  if (!bytes.length) {
    throw Error('ไม่พบข้อมูลรูปภาพสลิป');
  }
  return { hash: digest_(bytes), bytes: bytes, mime: mime };
}

function childFolder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function storeImageToDrive_(img, id, dateStr, subRootName) {
  if (!img || !img.bytes) return '';
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty('MOO_PING_SLIPS_ROOT');
  let rootFolder;
  if (rootId) {
    try { rootFolder = DriveApp.getFolderById(rootId); } catch (e) { rootFolder = null; }
  }
  if (!rootFolder) {
    rootFolder = DriveApp.createFolder('หมูปิ้ง หน้าร้านยาง - สลิปและใบเสร็จ POS');
    props.setProperty('MOO_PING_SLIPS_ROOT', rootFolder.getId());
  }
  let folder = childFolder_(rootFolder, subRootName || 'สลิปยอดขาย');
  const d = String(dateStr || Utilities.formatDate(new Date(), SHOP.zone, 'yyyy-MM-dd'));
  [d.slice(0, 4), d.slice(0, 7), d].forEach(function(part) {
    if (part) folder = childFolder_(folder, part);
  });
  const ext = img.mime === 'image/png' ? '.png' : '.jpg';
  const fileName = id + '-' + img.hash.slice(0, 12) + ext;
  const existing = folder.getFilesByName(fileName);
  if (existing.hasNext()) return existing.next().getUrl();
  const file = folder.createFile(Utilities.newBlob(img.bytes, img.mime, fileName));
  return file.getUrl();
}

function reject_(message) {
  const error = Error(message);
  error.safeToEdit = true;
  throw error;
}

function saveSale(input) {
  try {
    return saveSale_(input);
  } catch (error) {
    if (error && error.safeToEdit) return { rejected: true, error: error.message };
    throw error;
  }
}

function saveSale_(input) {
  const email = authorize_();
  if (!input || !input.id) reject_('เลขบิลไม่ถูกต้อง');
  const pork = Number(input.pork || 0);
  const rice = Number(input.rice || 0);
  const extraBaht = Number(input.extraBaht || 0);
  if (pork < 0 || rice < 0 || (pork === 0 && rice === 0 && extraBaht <= 0)) {
    reject_('กรุณาเลือกจำนวนสินค้าก่อนบันทึก');
  }
  const method = ['cash', 'qr', 'transfer'].includes(input.method) ? input.method : 'cash';
  const currentPrices = prices_();
  const porkPriceCents = (input.prices && Number(input.prices.pork)) || currentPrices.pork;
  const ricePriceCents = (input.prices && Number(input.prices.rice)) || currentPrices.rice;
  const totalCents = Number(input.totalCents) || (pork * porkPriceCents + rice * ricePriceCents + Math.round(extraBaht * 100));
  const receivedCents = method === 'cash' ? (Number(input.received) || totalCents) : totalCents;

  if (method === 'cash' && receivedCents < totalCents) {
    reject_('จำนวนเงินสดที่รับน้อยกว่ายอดขาย');
  }

  const slip = decodeImage_(input.slip, false);
  const canonical = {
    id: input.id,
    pork: pork,
    rice: rice,
    totalCents: totalCents,
    method: method,
    received: receivedCents,
    slip: slip.hash
  };
  const requestHash = digest_(JSON.stringify(canonical));

  return locked_(function() {
    const book = book_();
    const sheet = salesSheet_(book);
    const existing = findRow_(sheet, 1, input.id, SALE_HEADERS.length);
    if (existing) {
      return { id: existing[0], total: Number(existing[7]), duplicate: true, slipUrl: existing[11] || '' };
    }
    if (slip.hash && findRow_(sheet, 15, slip.hash, SALE_HEADERS.length)) {
      reject_('รูปสลิปนี้เคยใช้บันทึกในบิลอื่นแล้ว กรุณาตรวจสอบ');
    }

    const now = new Date();
    const dateStr = input.date || Utilities.formatDate(now, SHOP.zone, 'yyyy-MM-dd');
    const dateTimeStr = input.datetime || Utilities.formatDate(now, SHOP.zone, 'yyyy-MM-dd HH:mm:ss');
    const slipUrl = slip.hash ? storeImageToDrive_(slip, input.id, dateStr, 'สลิปขายหน้าร้าน') : '';

    const noteSuffix = input.note ? ' (' + String(input.note).trim() + ')' : '';
    const statusText = (method === 'cash'
      ? 'รับเงินสดแล้ว'
      : (slipUrl ? 'แนบสลิปแล้ว · ยืนยันเงินเข้า' : 'โอน/QR · ยืนยันเงินเข้า')) + noteSuffix;

    sheet.appendRow([
      input.id,
      dateTimeStr,
      dateStr,
      pork,
      porkPriceCents / 100,
      rice,
      ricePriceCents / 100,
      totalCents / 100,
      { cash: 'เงินสด', qr: 'สแกน QR', transfer: 'เงินโอน' }[method] || 'เงินสด',
      receivedCents / 100,
      (receivedCents - totalCents) / 100,
      slipUrl,
      statusText,
      email,
      slip.hash,
      requestHash
    ]);
    SpreadsheetApp.flush();
    return { id: input.id, total: totalCents / 100, duplicate: false, slipUrl: slipUrl };
  });
}

function saveExpense(input) {
  try {
    return saveExpense_(input);
  } catch (error) {
    if (error && error.safeToEdit) return { rejected: true, error: error.message };
    throw error;
  }
}

function saveExpense_(input) {
  const email = authorize_();
  if (!input || !input.id) reject_('รหัสรายจ่ายไม่ถูกต้อง');
  const desc = String(input.description || '').trim();
  if (!desc) reject_('กรุณาระบุรายการที่ซื้อ / ค่าใช้จ่าย');
  const qty = Number(input.quantity || 1);
  const unitCents = Number(input.unitCents || 0);
  const totalCents = Number(input.totalCents) || Math.round(qty * unitCents);
  if (qty <= 0 || totalCents <= 0) reject_('จำนวนและยอดเงินต้องมากกว่า 0');

  const receipt = decodeImage_(input.receipt, false);
  const requestHash = digest_(JSON.stringify({
    id: input.id,
    date: input.date,
    desc: desc,
    totalCents: totalCents,
    receipt: receipt.hash
  }));

  return locked_(function() {
    const book = book_();
    const sheet = expensesSheet_(book);
    const existing = findRow_(sheet, 1, input.id, EXPENSE_HEADERS.length);
    if (existing) {
      return { id: existing[0], total: Number(existing[9]), duplicate: true, receiptUrl: existing[13] || '' };
    }

    const now = new Date();
    const dateStr = input.date || Utilities.formatDate(now, SHOP.zone, 'yyyy-MM-dd');
    const dateTimeStr = Utilities.formatDate(now, SHOP.zone, 'yyyy-MM-dd HH:mm:ss');
    const receiptUrl = receipt.hash ? storeImageToDrive_(receipt, input.id, dateStr, 'สลิปและใบเสร็จค่าใช้จ่าย') : '';

    sheet.appendRow([
      input.id,
      dateTimeStr,
      dateStr,
      String(input.category || 'วัตถุดิบ'),
      desc,
      String(input.supplier || ''),
      qty,
      String(input.unit || 'รายการ'),
      unitCents / 100,
      totalCents / 100,
      input.method === 'transfer' ? 'เงินโอน / สลิป' : 'เงินสด',
      String(input.document || ''),
      String(input.note || ''),
      receiptUrl,
      email,
      requestHash
    ]);
    SpreadsheetApp.flush();
    return { id: input.id, total: totalCents / 100, duplicate: false, receiptUrl: receiptUrl };
  });
}

function formatCellDate_(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
    return Utilities.formatDate(val, SHOP.zone, 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  return s.slice(0, 10);
}

function getBackoffice(filter) {
  authorize_();
  const from = (filter && filter.from) || '0000-00-00';
  const to = (filter && filter.to) || '9999-12-31';
  const book = book_();
  const sSheet = salesSheet_(book);
  const eSheet = expensesSheet_(book);

  const sales = [];
  if (sSheet.getLastRow() >= 2) {
    const rows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 14).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (!r[0]) continue;
      const d = formatCellDate_(r[2]) || formatCellDate_(r[1]);
      if (d >= from && d <= to) {
        sales.push({
          id: String(r[0]),
          datetime: r[1] instanceof Date ? Utilities.formatDate(r[1], SHOP.zone, 'yyyy-MM-dd HH:mm:ss') : String(r[1]),
          date: d,
          pork: Number(r[3] || 0),
          rice: Number(r[5] || 0),
          totalCents: Math.round(Number(r[7] || 0) * 100),
          method: String(r[8] || 'เงินสด'),
          receivedCents: Math.round(Number(r[9] || 0) * 100),
          changeCents: Math.round(Number(r[10] || 0) * 100),
          slipUrl: String(r[11] || ''),
          status: String(r[12] || '')
        });
      }
    }
  }

  const expenses = [];
  if (eSheet.getLastRow() >= 2) {
    const rows = eSheet.getRange(2, 1, eSheet.getLastRow() - 1, 15).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (!r[0]) continue;
      const d = formatCellDate_(r[2]) || formatCellDate_(r[1]);
      if (d >= from && d <= to) {
        expenses.push({
          id: String(r[0]),
          datetime: r[1] instanceof Date ? Utilities.formatDate(r[1], SHOP.zone, 'yyyy-MM-dd HH:mm:ss') : String(r[1]),
          date: d,
          category: String(r[3] || 'วัตถุดิบ'),
          description: String(r[4] || ''),
          supplier: String(r[5] || ''),
          quantity: Number(r[6] || 1),
          unit: String(r[7] || ''),
          unitCents: Math.round(Number(r[8] || 0) * 100),
          totalCents: Math.round(Number(r[9] || 0) * 100),
          method: String(r[10] || 'เงินสด'),
          document: String(r[11] || ''),
          note: String(r[12] || ''),
          receipt: String(r[13] || '')
        });
      }
    }
  }

  return {
    prices: prices_(),
    sales: sales,
    expenses: expenses,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + SHOP.sheetId + '/edit?gid=' + SHOP.salesGid + '#gid=' + SHOP.salesGid
  };
}
