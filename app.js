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
  buildDropChips();
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

function renderApp(syncBar = true) {
  loadAll(() => {
    document.getElementById('totalCount').textContent = allItems.length;
    if (syncBar) syncFilterBar();
    if (currentChip === '全部') renderBlocks();
    else renderGrid(currentChip);
  });
}

// ---------- 筛选条：全部态=整排chips；单品类态=药丸+下拉面板 ----------
let animToken = 0;      // 动画令牌：任何新操作使旧动画立即作废（可打断纪律）
let dropOpen = false;

function renderChips() {
  const box = document.getElementById('chipRow');
  box.innerHTML = '';
  ['全部', ...CATEGORIES].forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => onChipClick(t);   // S1：收牌成药丸
    box.appendChild(b);
  });
}

// 面板内的 chips（两排，4列）
function buildDropChips() {
  const box = document.getElementById('dropChips');
  box.innerHTML = '';
  ['全部', ...CATEGORIES].forEach(t => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => onDropPick(t);
    box.appendChild(b);
  });
}

// 渲染后同步筛选条形态（全部=整排；单品类=药丸）
function syncFilterBar() {
  const token = ++animToken;
  killGhosts();
  closeDropInstant();
  document.getElementById('chipRow').classList.toggle('hidden', currentChip !== '全部');
  const pill = document.getElementById('pillBtn');
  pill.classList.toggle('hidden', currentChip === '全部');
  if (currentChip !== '全部') {
    document.getElementById('pillText').textContent = currentChip;
    pill.style.marginLeft = '0px';
  }
}

function killGhosts() {
  document.querySelectorAll('.chip-ghost').forEach(g => g.remove());
}

// S1：全部态点某 chip → 收牌成药丸（collect）
function onChipClick(cat) {
  if (cat === currentChip) return;
  const token = ++animToken;
  killGhosts();
  const row = document.getElementById('chipRow');
  const chips = Array.from(row.children);
  const target = chips.find(c => c.dataset.name === cat);
  if (!target) return;
  const targetRect = target.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2;

  // 造幽灵克隆，记录各自位置，准备收向目标点
  const ghosts = chips.map(ch => {
    const r = ch.getBoundingClientRect();
    const g = ch.cloneNode(true);
    g.className = 'tab chip-ghost';
    g.style.left = r.left + 'px';
    g.style.top = r.top + 'px';
    g.style.width = r.width + 'px';
    document.body.appendChild(g);
    return { el: g, dx: targetX - (r.left + r.width / 2) };
  });

  // 布局切到药丸态（药丸先藏着，收牌完成后才淡入）
  currentChip = cat;
  row.classList.add('hidden');
  const pill = document.getElementById('pillBtn');
  pill.classList.add('hidden');
  const barLeft = document.getElementById('filterBar').getBoundingClientRect().left;
  pill.style.marginLeft = Math.max(0, targetRect.left - barLeft) + 'px';
  document.getElementById('pillText').textContent = cat;
  renderApp(false);   // 网格直接切换（不动筛选条，动画由本函数接管）

  // 下一帧：所有幽灵向目标点收缩+淡出（150-200ms）
  requestAnimationFrame(() => {
    ghosts.forEach(o => {
      o.el.style.transform = `translateX(${o.dx}px) scale(.2)`;
      o.el.style.opacity = '0';
    });
  });

  setTimeout(() => {
    if (token !== animToken) return;   // 可打断：令牌过期就什么也不做
    killGhosts();
    pill.classList.remove('hidden');   // 药丸淡入（fade）
  }, 190);
}

// S2：点药丸 → 打开面板（下滑+淡入，随后 deal 发牌）
function openDrop() {
  const token = ++animToken;
  killGhosts();
  dropOpen = true;
  const mask = document.getElementById('dropMask');
  const panel = document.getElementById('dropPanel');
  panel.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.name === currentChip);
  });
  mask.classList.remove('hidden');
  panel.classList.remove('hidden');
  // deal：chips 从左到右依次翻出，间隔 35ms
  const chips = Array.from(document.getElementById('dropChips').children);
  chips.forEach(c => {
    c.style.transition = 'none';
    c.classList.remove('dealt');
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    chips.forEach((c, i) => {
      c.style.transitionDelay = (i * 35) + 'ms';
      c.classList.add('dealt');
    });
  }));
}

// S3/S5：取消（淡出150ms，药丸与网格不变）
function cancelDrop() {
  const token = ++animToken;
  const mask = document.getElementById('dropMask');
  const panel = document.getElementById('dropPanel');
  mask.style.opacity = '0';
  panel.style.opacity = '0';
  setTimeout(() => {
    if (token !== animToken) return;
    closeDropInstant();
  }, 150);
}

function closeDropInstant() {
  dropOpen = false;
  const mask = document.getElementById('dropMask');
  const panel = document.getElementById('dropPanel');
  mask.classList.add('hidden');
  panel.classList.add('hidden');
  mask.style.opacity = '';
  panel.style.opacity = '';
  panel.querySelectorAll('.chip').forEach(c => { c.style.transitionDelay = ''; });
}

// S4：点另一个品类=无动画直切｜S5：点当前品类=取消｜S6：点全部=铺开发牌
function onDropPick(cat) {
  const token = ++animToken;
  killGhosts();
  if (cat === currentChip) { cancelDrop(); return; }          // S5
  closeDropInstant();
  if (cat === '全部') {
    currentChip = '全部';
    renderApp();
  } else {
    currentChip = cat;                                        // S4：无动画，直接换
    document.getElementById('pillText').textContent = cat;
    renderApp();
  }
}

// S6：chips 从药丸位置向两侧依次铺开（deal 镜像，约200ms）
function spreadChips() {
  const token = ++animToken;
  const pill = document.getElementById('pillBtn');
  const originX = pill.getBoundingClientRect().left + pill.getBoundingClientRect().width / 2;
  pill.classList.add('hidden');
  const row = document.getElementById('chipRow');
  row.classList.remove('hidden');
  const chips = Array.from(row.children);
  // 起点：全部叠在药丸位置（透明）
  chips.forEach(c => {
    const r = c.getBoundingClientRect();
    const dx = originX - (r.left + r.width / 2);
    c.style.transition = 'none';
    c.style.transform = `translateX(${dx}px)`;
    c.style.opacity = '0';
  });
  // 下一帧：各自滑回本位，约35ms间隔
  requestAnimationFrame(() => {
    chips.forEach((c, i) => {
      c.style.transition = 'transform .18s ease, opacity .18s ease';
      c.style.transitionDelay = (i * 30) + 'ms';
      c.style.transform = '';
      c.style.opacity = '';
    });
  });
  setTimeout(() => {
    if (token !== animToken) return;
    chips.forEach(c => { c.style.transition = ''; c.style.transitionDelay = ''; });
  }, 450);
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
    head.onclick = () => { currentChip = cat; renderApp(); };
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

// ---------- FAB → 动作面板 ----------
// 单品类态：跳过品类问题，直接拍照/相册；"全部"态：先问放进哪个抽屉
function openSheet() {
  const catsBox = document.getElementById('sheetCats');
  if (currentChip === '全部') {
    catsBox.classList.remove('hidden');
    catsBox.innerHTML = '<p class="tip">这件放进哪个抽屉？</p>';
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
    // 单品类态：品类=当前抽屉，不再问
    addCategory = currentChip;
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
