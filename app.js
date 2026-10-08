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


// 应用启动入口（由数据库开门成功后调用，见 dbReq.onsuccess）
function startApp() {
  renderChips();
  renderApp();
}

// ---------- 拍照贴士卡片（双形态） ----------
const TIP_KEY_DISMISSED = 'tipAutoDismissed';   // 勾选过"不再提醒"
const TIP_KEY_COUNT = 'tipAutoCount';           // 自动弹出次数（满3次不再弹）
let tipMode = 'auto';        // 'auto'=拍照前自动弹  'manual'=点"?"打开
let tipChecked = false;      // 小圆圈是否勾选
let pendingPick = null;      // A形态点"知道了"后要继续的拍照动作

function shouldAutoTip() {
  if (localStorage.getItem(TIP_KEY_DISMISSED)) return false;
  const n = parseInt(localStorage.getItem(TIP_KEY_COUNT) || '0', 10);
  return n < 3;
}

function openTip(mode) {
  tipMode = mode;
  tipChecked = false;
  // A形态显示第4句+圆圈；B形态隐藏（卡片相应变矮，不留空）
  document.getElementById('tipDismissRow').classList.toggle('hidden', mode !== 'auto');
  document.getElementById('tipCircle').classList.remove('checked');
  document.getElementById('tipMask').classList.remove('hidden');
}

function toggleTipCircle() {
  tipChecked = !tipChecked;
  document.getElementById('tipCircle').classList.toggle('checked', tipChecked);
}

function closeTip() {
  document.getElementById('tipMask').classList.add('hidden');

  if (tipMode === 'auto') {
    if (tipChecked) {
      localStorage.setItem(TIP_KEY_DISMISSED, '1');
    } else {
      const n = parseInt(localStorage.getItem(TIP_KEY_COUNT) || '0', 10) + 1;
      localStorage.setItem(TIP_KEY_COUNT, String(n));
    }
    // manual 形态：不写任何标记、不计数
  }

  // A形态关闭后继续被拦下的拍照动作
  if (pendingPick) {
    const s = pendingPick;
    pendingPick = null;
    doPick(s);
  }
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
  // 贴士关卡：该自动弹且没弹满3次 → 先弹A形态，点"知道了"后再真正打开相机
  if (shouldAutoTip()) {
    pendingPick = src;
    openTip('auto');
    return;
  }
  doPick(src);
}

// 真正调起相机/相册
function doPick(src) {
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
