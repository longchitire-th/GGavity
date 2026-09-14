/**
 * วุ่นวายโภชนา V2.0 - Data Management, Google Drive Links & Backup
 */

function renderDataTable() {
  const transactions = window.AppState ? window.AppState.transactions : [];
  const tbody = document.getElementById('allDataRows');
  const countEl = document.getElementById('totalRowCount');
  const searchInput = document.getElementById('dataSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  if (!tbody) return;

  let filtered = transactions;
  if (query) {
    filtered = transactions.filter(t => 
      (t.description && t.description.toLowerCase().includes(query)) ||
      (t.category && t.category.toLowerCase().includes(query)) ||
      (t.date && t.date.includes(query)) ||
      (t.id && t.id.toLowerCase().includes(query)) ||
      (t.channel && t.channel.toLowerCase().includes(query))
    );
  }

  if (countEl) countEl.textContent = `${filtered.length} รายการ (จากทั้งหมด ${transactions.length})`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-dim);">ไม่พบข้อมูล</td></tr>';
    return;
  }

  // Render top 100
  tbody.innerHTML = filtered.slice(0, 100).map(t => {
    const isIn = t.type === 'in';
    return `
      <tr>
        <td><small style="color:var(--text-dim);">${window.escapeHtml(t.id)}</small></td>
        <td>${t.date}</td>
        <td><span class="badge" style="background:${isIn ? 'rgba(16,185,129,0.2);color:var(--green)' : 'rgba(244,63,94,0.2);color:var(--red)'}">${isIn ? 'รายรับ' : 'รายจ่าย'}</span></td>
        <td>${window.escapeHtml(t.category)}</td>
        <td><strong>${window.escapeHtml(t.description)}</strong></td>
        <td class="${isIn ? 'green' : 'red'}" style="text-align:right;">${isIn ? '+' : '-'}${window.formatMoney(t.amount)} ฿</td>
        <td style="text-align:center;">
          <button class="btn-del" onclick="deleteTransaction('${t.id}')" title="ลบ">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function resetToDefaultDriveData() {
  if (!confirm('ต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นข้อมูลตั้งต้นจาก Google Drive (269 รายการ) ใช่หรือไม่?')) return;
  if (window.INITIAL_TRANSACTIONS) {
    window.AppState.transactions = [...window.INITIAL_TRANSACTIONS];
    localStorage.setItem('wanwanwan_db_v2', JSON.stringify(window.AppState.transactions));
    renderDataTable();
    window.updateTopHero();
    if (window.renderDashboard) window.renderDashboard();
    if (window.renderReport) window.renderReport();
    alert('รีเซ็ตข้อมูลกลับเป็นข้อมูลตัวอย่างหลังบ้าน 269 รายการเรียบร้อยแล้ว');
  }
}

function importJsonFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const items = Array.isArray(parsed) ? parsed : (parsed.transactions || []);
      if (items.length > 0) {
        window.AppState.transactions = items;
        localStorage.setItem('wanwanwan_db_v2', JSON.stringify(items));
        renderDataTable();
        window.updateTopHero();
        if (window.renderDashboard) window.renderDashboard();
        if (window.renderReport) window.renderReport();
        alert(`นำเข้าข้อมูลสำเร็จ ${items.length} รายการ`);
      } else {
        alert('ไฟล์ไม่มีรายการข้อมูลที่ถูกต้อง');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์ JSON');
    }
  };
  reader.readAsText(file);
}

// Listeners
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('dataSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderDataTable());
  }
});

window.renderDataTable = renderDataTable;
window.resetToDefaultDriveData = resetToDefaultDriveData;
window.importJsonFile = importJsonFile;
