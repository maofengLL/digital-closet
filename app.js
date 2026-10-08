// ========== 数字衣柜 · 抽屉柜（单页） ==========
// 品类 = 抽屉。全部 = 整柜拉开堆叠；筛选 = 只拉出一个抽屉（大图网格）。
// 点抽屉头 = 点 chip，效果一样。

let db;
const dbReq = indexedDB.open('closet-db', 2);
dbReq.onupgradeneeded = e => {
  const d = e.target.result;
  if (!d.objectStoreNames.contains('clothes')) {
    d.createObjectStore('clothes', { keyPath: 'id', autoIncrement: true });
  }
};
// 数据库开门成功，才启动界面（IndexedDB 是异步的，页面加载等不了它）
dbReq.onsuccess = e => { db = e.target.result; startApp(); };
dbReq.onerror = () => alert('数据库打开失败，请换 Chrome 浏览器');

const CATEGORIES = ['上装', '裤装', '裙装', '外套', '鞋', '配饰', '其他'];
let currentPhoto = null;
let currentChip = '全部';
let addCategory = '';
let allItems = [];
// ---------- 轮廓剪影：每个品类一张半透明 SVG，叠加在拍照预览上 ----------
const SILHOUETTES = {
  '上装': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M30 30 L40 23 Q50 29 60 23 L70 30 L82 46 L73 52 L71 46 L71 82 L29 82 L29 46 L27 52 L18 46 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  '裤装': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M32 18 L68 18 L73 82 L56 82 L50 42 L44 82 L27 82 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  '裙装': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M34 22 L66 22 L80 80 L20 80 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-linejoin="round"/><line x1="34" y1="30" x2="66" y2="30" stroke="#fff" stroke-opacity=".85" stroke-width="2.5"/></svg>',
  '外套': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M30 30 L40 22 L50 29 L60 22 L70 30 L83 48 L74 54 L72 47 L72 83 L28 83 L28 47 L26 54 L17 48 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-linejoin="round"/><line x1="50" y1="31" x2="50" y2="83" stroke="#fff" stroke-opacity=".85" stroke-width="2.5"/></svg>',
  '鞋':   '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M16 66 L16 62 Q16 54 26 54 L44 54 Q53 54 58 47 L66 54 Q82 57 84 66 L84 70 L16 70 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  '配饰': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M26 56 Q26 30 50 30 Q74 30 74 56 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5"/><path d="M18 58 L82 58 Q86 58 86 62 L86 64 L14 64 L14 62 Q14 58 18 58 Z" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5"/></svg>',
  '其他': '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="26" width="48" height="48" rx="10" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-dasharray="6 5"/></svg>'
};

// 应用启动入口（由数据库开门成功后调用，见 dbReq.onsuccess）
function startApp() {
  renderChips();
  renderApp();
}

// ---------- 轻提示 toast：一闪而过的小字 ----------
let toastTimer = null;
function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1500);
}
// ---------- 全量加载 ----------
function loadAll(cb) {
  allItems = [];
  const store = db.transaction('clothes', 'readonly').objectStore('clothes');
  store.openCursor().onsuccess = e => {
    const cur = e.target.result;
    if (cur) { allItems.push(cur.value); cur.continue(); }
    else cb();
  };
}

// ---------- 渲染入口 ----------
function renderApp() {
  loadAll(() => {
    document.getElementById('totalCount').textContent = allItems.length;

    // 筛选提示行
    const hint = document.getElementById('filterHint');
    if (currentChip === '全部') {
      hint.classList.add('hidden');
    } else {
      hint.textContent = `只显示「${currentChip}」抽屉 · 点「全部」恢复整柜`;
      hint.classList.remove('hidden');
    }

    if (currentChip === '全部') renderBlocks();
    else renderGrid(currentChip);
  });
}

// ---------- 筛选 chips ----------
function renderChips() {
  const box = document.getElementById('chipRow');
  box.innerHTML = '';
  ['全部', ...CATEGORIES].forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => { currentChip = t; refreshChips(); renderApp(); };
    box.appendChild(b);
  });
}

function refreshChips() {
  document.querySelectorAll('#chipRow .tab').forEach(b => {
    b.classList.toggle('active', b.dataset.name === currentChip);
  });
}

// ---------- 全部：抽屉堆叠 ----------
function renderBlocks() {
  const blocksBox = document.getElementById('blocksBox');
  const gridBox = document.getElementById('gridBox');
  const emptyTip = document.getElementById('emptyTip');
  blocksBox.classList.remove('hidden');
  gridBox.classList.add('hidden');
  emptyTip.classList.add('hidden');
  blocksBox.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const items = allItems.filter(i => i.category === cat);
    const sec = document.createElement('div');
    sec.className = 'section';

    // 抽屉头：可点（= 点 chip），箭头提示可进入
    const head = document.createElement('div');
    head.className = 'section-head tap';
    head.innerHTML = `<span class="name">${cat}</span><span class="count">${items.length} 件 ›</span>`;
    head.onclick = () => { currentChip = cat; refreshChips(); renderApp(); };
    sec.appendChild(head);

    if (items.length === 0) {
      const p = document.createElement('p');
      p.className = 'block-empty';
      p.textContent = '抽屉空着，右下角加号放进第一件';
      sec.appendChild(p);
    } else {
      const row = document.createElement('div');
      row.className = 'hrow';
      items.forEach(item => {
        const d = document.createElement('div');
        d.className = 'hthumb';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(item.image);
        d.appendChild(img);
        d.addEventListener('click', () => openDetail(item.id, item.image));
        bindLongPress(d, () => deleteCloth(item.id));
        row.appendChild(d);
      });
      sec.appendChild(row);
    }
    blocksBox.appendChild(sec);
  });
}

// ---------- 单品类：抽屉拉满 ----------
function renderGrid(cat) {
  const blocksBox = document.getElementById('blocksBox');
  const gridBox = document.getElementById('gridBox');
  const emptyTip = document.getElementById('emptyTip');
  blocksBox.classList.add('hidden');
  gridBox.classList.remove('hidden');
  gridBox.innerHTML = '';

  const items = allItems.filter(i => i.category === cat);
  if (items.length === 0) {
    gridBox.classList.add('hidden');
    emptyTip.textContent = `抽屉空着，右下角加号放进第一件${cat}`;
    emptyTip.classList.remove('hidden');
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(item.image);
    div.appendChild(img);
    div.addEventListener('click', () => openDetail(item.id, item.image));
    bindLongPress(div, () => deleteCloth(item.id));
    gridBox.appendChild(div);
  });
}

// 面板从此总是先选品类（剪影需要它），预选当前抽屉或上次用过的
function openSheet() {
  const catsBox = document.getElementById('sheetCats');
  catsBox.classList.remove('hidden');
  catsBox.innerHTML = '<p class="tip">这件放进哪个抽屉？</p>';
  if (!addCategory) addCategory = currentTab !== '全部' ? currentTab : CATEGORIES[0];
  CATEGORIES.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (c === addCategory ? ' active' : '');
    chip.textContent = c;
    chip.onclick = () => {
      addCategory = c;
      catsBox.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x.textContent === c));
    };
    catsBox.appendChild(chip);
  });
  document.getElementById('sheet').classList.remove('hidden');
}
function closeSheet() {
  document.getElementById('sheet').classList.add('hidden');
}

function pickFrom(src) {
  if (!addCategory) { alert('先选一个品类'); return; }
  closeSheet();
  showToast(src === 'camera' ? '正在打开相机…' : '正在打开相册…');
  if (src === 'camera') document.getElementById('cameraInput').click();
  else document.getElementById('albumInput').click();
}

function onFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  showToast('正在读取照片…');
  currentPhoto = file;
  document.getElementById('previewImg').src = URL.createObjectURL(file);
  // 叠上该品类的轮廓剪影（引导用户对齐，不拦截）
  document.getElementById('outline').innerHTML = SILHOUETTES[addCategory] || '';
  document.getElementById('preview').classList.remove('hidden');
  event.target.value = '';
}

// ---------- 预览层 ----------
function exitPreview() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
}

function reenter() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
  openSheet();
}

function saveCurrent(done) {
  if (!currentPhoto) { alert('请先选择照片'); return; }
  if (!db) { alert('数据库还没准备好，请等一秒再点'); return; }
  const btn = document.getElementById('confirmBtn');
  btn.textContent = '保存中…';
  btn.disabled = true;
  try {
    const tx = db.transaction('clothes', 'readwrite');
    tx.objectStore('clothes').add({
      image: currentPhoto,
      category: addCategory,
      time: Date.now()
    });
    tx.oncomplete = () => {
      currentPhoto = null;
      btn.textContent = '确认';
      btn.disabled = false;
      showToast('已保存');
      done();
    };
    tx.onerror = () => {
      btn.textContent = '确认';
      btn.disabled = false;
      alert('保存失败：' + tx.error.message);
    };
  } catch (err) {
    btn.textContent = '确认';
    btn.disabled = false;
    alert('出错了：' + err.message);
  }
}

// 确认：保存 → 直接拉到刚录入的那个抽屉，当场看到
function saveAndExit() {
  const savedCat = addCategory;
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    currentChip = savedCat;
    refreshChips();
    renderApp();
  });
}

// 下一张：保存 → 打开面板接着录（批量，品类沿用）
function saveAndNext() {
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    openSheet();
  });
}

// ---------- 删除 ----------
function deleteCloth(id) {
  if (!confirm('确定删除这件衣服吗？')) return;
  const tx = db.transaction('clothes', 'readwrite');
  tx.objectStore('clothes').delete(id);
  tx.oncomplete = () => { showToast('已删除'); renderApp(); };
  tx.onerror = () => alert('删除失败：' + tx.error.message);
}

// ---------- 大图查看层 ----------
let currentViewId = null;

function openDetail(id, image) {
  currentViewId = id;
  document.getElementById('detailImg').src = URL.createObjectURL(image);
  document.getElementById('detail').classList.remove('hidden');
}

function closeDetail() {
  currentViewId = null;
  document.getElementById('detail').classList.add('hidden');
}

function deleteCurrent() {
  if (currentViewId === null) return;
  const id = currentViewId;
  closeDetail();
  deleteCloth(id);
}

// 长按 600ms 快捷删除；电脑右键代替
function bindLongPress(el, fn) {
  let timer = null;
  let longPressed = false;
  el.addEventListener('touchstart', () => {
    longPressed = false;
    timer = setTimeout(() => { longPressed = true; fn(); }, 600);
  });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('touchmove', () => clearTimeout(timer));
  el.addEventListener('click', e => { if (longPressed) { e.stopImmediatePropagation(); longPressed = false; } });
  el.addEventListener('contextmenu', e => { e.preventDefault(); fn(); });
}
