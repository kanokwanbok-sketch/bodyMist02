/* =========================================================
   script.js — ใช้ร่วมกันทุกหน้า (product / order / admin)
   ตรวจจับหน้าจาก id ของ element ที่มีอยู่ในหน้านั้น
   ========================================================= */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxHnwrxollCMmCku3XdMK5Nmlw7NYc-J-kltQvkf3ylduoKZykluUDSgm7691_p7H0/exec';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjsff-W9KjZmJOXnlR7thveaO5T_bK4QaLs49kQNJ2thEB7jLwVFOJjN54F_kDg7Tevyk-452QNWxb/pub?gid=0&single=true&output=csv';

const MOODS = ['ทั้งหมด', 'Fresh', 'Sweet', 'Confident', 'Romance'];

/* ---------- Utilities ---------- */

function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(value) {
  const n = Number(String(value).replace(/,/g, ''));
  return isNaN(n) ? String(value) : n.toLocaleString('th-TH');
}

/* =========================================================
   1) หน้า product.html
   ========================================================= */

let allProducts = [];

function initProductPage() {
  const filterBar = document.getElementById('filter-bar');
  const productList = document.getElementById('product-list');
  if (!filterBar || !productList) return;

  const initialMood = (new URLSearchParams(window.location.search).get('mood') || '').trim();

  renderFilterButtons(filterBar);

  fetch('products.json')
    .then(res => {
      if (!res.ok) throw new Error('โหลด products.json ไม่สำเร็จ');
      return res.json();
    })
    .then(data => {
      allProducts = Array.isArray(data) ? data : (data.products || []);
      // กรองอัตโนมัติจาก ?mood=xxx (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
      const matched = MOODS.find(m => m.toLowerCase() === initialMood.toLowerCase());
      applyFilter(matched && matched !== 'ทั้งหมด' ? matched : 'ทั้งหมด');
    })
    .catch(err => {
      console.error(err);
      productList.innerHTML = '<p>ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง</p>';
    });
}

function renderFilterButtons(filterBar) {
  filterBar.innerHTML = '';
  MOODS.forEach(mood => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-btn';
    btn.dataset.mood = mood;
    btn.textContent = mood;
    btn.addEventListener('click', () => applyFilter(mood));
    filterBar.appendChild(btn);
  });
}

function applyFilter(mood) {
  document.querySelectorAll('#filter-bar .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mood === mood);
  });

  const list = mood === 'ทั้งหมด'
    ? allProducts
    : allProducts.filter(p => String(p.mood || '').toLowerCase() === mood.toLowerCase());

  renderProducts(list);
}

function renderProducts(list) {
  const productList = document.getElementById('product-list');
  if (!productList) return;

  if (!list.length) {
    productList.innerHTML = '<p>ไม่พบสินค้าในหมวดนี้</p>';
    return;
  }

  productList.innerHTML = list.map(p => {
    const name = p.name || p.title || '';
    const size = p.size || '';
    const price = p.price != null ? p.price : '';
    const image = p.image || p.img || p.image_url || '';

    // ชื่อที่ส่งไปหน้า order เช่น "Body Mist Fresh เล็ก 30ml"
    const itemName = size && !String(name).includes(size) ? `${name} ${size}` : name;
    const orderUrl =
      'order.html?item=' + encodeURIComponent(itemName) +
      '&price=' + encodeURIComponent(price);

    return `
      <div class="product-card" data-mood="${escapeHTML(p.mood || '')}">
        <img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" loading="lazy">
        <h3 class="product-name">${escapeHTML(name)}</h3>
        <p class="product-size">${escapeHTML(size)}</p>
        <p class="product-price">${escapeHTML(formatPrice(price))} บาท</p>
        <a class="order-btn" href="${orderUrl}">สั่งซื้อ</a>
      </div>
    `;
  }).join('');
}

/* =========================================================
   2) หน้า order.html
   ========================================================= */

function initOrderPage() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  // เติมค่าจาก URL parameter ทันทีที่โหลดหน้า
  const params = new URLSearchParams(window.location.search);
  const item = params.get('item') || '';
  const price = params.get('price') || '';

  const itemsEl = document.getElementById('items');
  const totalEl = document.getElementById('total');

  if (itemsEl) itemsEl.value = item;
  if (totalEl) totalEl.value = price;   // ช่อง total ต้องถูกเติมเสมอ

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const payload = {
      customerName: document.getElementById('customerName').value.trim(),
      contact: document.getElementById('contact').value.trim(),
      items: document.getElementById('items').value.trim(),
      total: document.getElementById('total').value.trim(),
      note: document.getElementById('note').value.trim()
    };

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      });
  });
}

/* =========================================================
   3) หน้า admin.html
   ========================================================= */

// parse CSV เอง รองรับ "..." , "" (escape quote), comma และขึ้นบรรทัดใหม่ในช่อง
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
  }
  // แถวสุดท้าย (กรณีไม่มี newline ปิดท้าย)
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  // ตัดแถวว่างทิ้ง
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function initAdminPage() {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6">กำลังโหลดข้อมูล...</td></tr>';

  // ใส่ timestamp กัน cache
  const url = SHEET_CSV_URL + '&t=' + Date.now();

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return res.text();
    })
    .then(text => {
      const rows = parseCSV(text);
      rows.shift(); // ตัดแถวหัวตาราง

      // ชีตเพิ่มแถวใหม่ต่อท้าย → กลับด้านให้รายการล่าสุดขึ้นก่อน
      rows.reverse();

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">ยังไม่มีรายการสั่งซื้อ</td></tr>';
        return;
      }

      // คอลัมน์: วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${escapeHTML(r[0] || '')}</td>
          <td>${escapeHTML(r[1] || '')}</td>
          <td>${escapeHTML(r[2] || '')}</td>
          <td>${escapeHTML(r[3] || '')}</td>
          <td>${escapeHTML(r[4] || '')}</td>
          <td>${escapeHTML(r[5] || '')}</td>
        </tr>
      `).join('');
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="6">ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง</td></tr>';
    });
}

/* =========================================================
   เริ่มทำงาน
   ========================================================= */

document.addEventListener('DOMContentLoaded', function () {
  initProductPage();
  initOrderPage();
  initAdminPage();
});
