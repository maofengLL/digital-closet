// ========== 数字衣柜 · 首页（大按钮）+ 浏览页（分组列表/网格） ==========

let db;
const dbReq = indexedDB.open('closet-db', 2);
dbReq.onupgradeneeded = e => {
  const d = e.target.result;
  if (!d.objectStoreNames.contains('clothes')) {
    d.createObjectStore('clothes', { keyPath: 'id', autoIncrement: true });
  }
};
dbReq.onsuccess = e => { db = e.target.result; };
dbReq.onerror = () => alert('数据库打开失败，请换 Chrome 浏览器');

const CATEGORIES = ['上装', '裤装', '裙装', '外套', '鞋', '配饰', '其他'];
let currentPhoto = null;
let currentChip = '全部';    // 浏览页当前的筛选
let addCategory = '';        // 本次录入品类（继承当前筛选）
let allItems = [];           // 渲染前全量加载的衣服

window.onload = () => {
  renderHome();
  renderChips();
  showPage('home');
};

// ---------- 页面切换 ----------
function showPage(name) {
  document.getElementById('homeView').classList.toggle('hidden', name !== 'home');
  document.getElementById('browseView').classList.toggle('hidden', name !== 'browse');
  document.getElementById('backBtn').classList.toggle('hidden', name !== 'browse');
  document.getElementById('fab').classList.toggle('hidden', name !== 'browse');
}

function goHome() { showPage('home'); }
function onBack() { showPage('home'); }

// ---------- 首页：七个大按钮 ----------
function renderHome() {
  const grid = document.getElementById('catGrid');
  grid.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.textContent = cat;
    btn.onclick = () => openCategory(cat);
    grid.appendChild(btn);
  });
}

// ---------- 浏览页 ----------
function openCategory(cat) {
  currentChip = cat;
  showPage('browse');
  renderBrowse();
}

// 全量加载后渲染
function loadAll(cb) {
  allItems = [];
  const store = db.transaction('clothes', 'readonly').objectStore('clothes');
  store.openCursor().onsuccess = e => {
    const cur = e.target.result;
    if (cur) { allItems.push(cur.value); cur.continue(); }
    else cb();
  };
}

// 顶部筛选 chips
function renderChips() {
  const box = document.getElementById('chipRow');
  box.innerHTML = '';
  ['全部', ...CATEGORIES].forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => { currentChip = t; renderBrowse(); };
    box.appendChild(b);
  });
}

function renderBrowse() {
  // chip 高亮
  document.querySelectorAll('#chipRow .tab').forEach(b => {
    b.classList.toggle('active', b.dataset.name === currentChip);
  });
  loadAll(() => {
    if (currentChip === '全部') renderBlocks();
    else renderGrid(currentChip);
  });
}

// 全部模式：按品类分区块纵向堆叠
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

    // 区块头：品类名（左）+ 件数（右）+ 分隔线
    const head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = `<span class="name">${cat}</span><span class="count">${items.length} 件</span>`;
    sec.appendChild(head);

    if (items.length === 0) {
      // 空区块：头部 + 一行轻提示
      const p = document.createElement('p');
      p.className = 'block-empty';
      p.textContent = `这个格子还空着，点右下角加号，把第一件${cat}拍进来`;
      sec.appendChild(p);
    } else {
      // 区块体：横向缩略图，限一行，超出横滑
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

// 单品类模式：大图网格铺满
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
    emptyTip.textContent = `这里还空着，点右下角加号，把第一件${cat}拍进来`;
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

// ---------- 悬浮加号 → 动作面板 ----------
function openSheet() {
  const catsBox = document.getElementById('sheetCats');
  if (currentChip === '全部') {
    // 筛选是"全部"时品类未知：给一排小标签手选，预选上次用过的
    catsBox.classList.remove('hidden');
    catsBox.innerHTML = '<p class="tip">这件属于哪类？</p>';
    if (!addCategory) addCategory = CATEGORIES[0];
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
  } else {
    addCategory = currentChip;   // 品类继承
    catsBox.classList.add('hidden');
  }
  document.getElementById('sheet').classList.remove('hidden');
}

function closeSheet() {
  document.getElementById('sheet').classList.add('hidden');
}

function pickFrom(src) {
  if (!addCategory) { alert('先选一个品类'); return; }
  closeSheet();
  if (src === 'camera') document.getElementById('cameraInput').click();
  else document.getElementById('albumInput').click();
}

function onFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  currentPhoto = file;
  document.getElementById('previewImg').src = URL.createObjectURL(file);
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
  try {
    const tx = db.transaction('clothes', 'readwrite');
    tx.objectStore('clothes').add({
      image: currentPhoto,
      category: addCategory,
      time: Date.now()
    });
    tx.oncomplete = () => { currentPhoto = null; done(); };
    tx.onerror = () => alert('保存失败：' + tx.error.message);
  } catch (err) {
    alert('出错了：' + err.message);
  }
}

// 确认：保存 → 跳到该品类视图，当场看到
function saveAndExit() {
  const savedCat = addCategory;
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    currentChip = savedCat;   // 录完即所见：直接落到该品类的网格
    renderBrowse();
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
  tx.oncomplete = () => renderBrowse();
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
