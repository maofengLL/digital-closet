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
dbReq.onsuccess = e => { db = e.target.result; migrateThenStart(); };
dbReq.onerror = () => alert('数据库打开失败，请换 Chrome 浏览器');

const CATEGORIES = ['上装', '裤装', '裙装', '外套', '鞋', '配饰', '其他'];
let currentPhoto = null;
let currentChip = '全部';
let addCategory = '';
let allItems = [];


// 应用启动入口（由数据库开门成功后调用，见 dbReq.onsuccess）
function startApp() {
  // 全局禁掉长按弹出的浏览器菜单（保存图片/复制/分享）
  document.addEventListener('contextmenu', e => e.preventDefault());
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
// ---------- 数据层 v3：衣物档案（阶段②） ----------
const SCHEMA_VERSION = 3;                 // 数据结构版本号
const SCHEMA_KEY = 'closetSchemaVersion'; // localStorage 里记录版本，避免每次启动重跑

// 新记录的档案默认值（所有空串 = 未知/未填，不用 null）
function newArchive() {
  return {
    care: { materials: [], wash: '', bleach: '', dry: '', iron: '', waterTemp: '' },
    careVerified: false,                 // 只有用户亲手核对过问卷才置 true
    meta: { purchaseDate: '', status: '在穿' },
    notes: [],
    photos: { standard: '' }             // 占位：blob 存储无路径，步骤6产出标准图后填入
  };
}

// 给单条记录补档案字段（幂等：只补缺失，绝不覆盖已有值）
function migrateItem(item) {
  if (!item.care) item.care = { materials: [], wash: '', bleach: '', dry: '', iron: '', waterTemp: '' };
  else {
    if (!Array.isArray(item.care.materials)) item.care.materials = [];
    ['wash', 'bleach', 'dry', 'iron', 'waterTemp'].forEach(k => {
      if (item.care[k] === undefined || item.care[k] === null) item.care[k] = '';
    });
  }
  if (item.careVerified === undefined || item.careVerified === null) item.careVerified = false;
  if (!item.meta) item.meta = { purchaseDate: '', status: '在穿' };
  else {
    if (item.meta.purchaseDate === undefined || item.meta.purchaseDate === null) item.meta.purchaseDate = '';
    if (!item.meta.status) item.meta.status = '在穿';
  }
  if (!Array.isArray(item.notes)) item.notes = [];
  if (!item.photos) item.photos = { standard: '' };
  return item;
}

// 启动时：版本检查 + 一次性迁移（幂等，重复执行无副作用）
function migrateThenStart() {
  if (parseInt(localStorage.getItem(SCHEMA_KEY) || '0', 10) >= SCHEMA_VERSION) { startApp(); return; }
  const tx = db.transaction('clothes', 'readwrite');
  const store = tx.objectStore('clothes');
  store.openCursor().onsuccess = e => {
    const cur = e.target.result;
    if (cur) { store.put(migrateItem(cur.value)); cur.continue(); }
    else localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
  };
  tx.oncomplete = () => startApp();   // 迁移完才启动界面
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
  // "全部"固定首位：不可拖、视觉突出
  const all = document.createElement('button');
  all.className = 'tab all-chip';
  all.textContent = '全部';
  all.dataset.name = '全部';
  all.onclick = () => onChipClick('全部');
  box.appendChild(all);
  catOrder.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => { if (justDragged()) return; onChipClick(t); };
    bindSortable(b, {
      onDragMove: (x) => {
        const others = Array.from(box.children).filter(e => e !== b && e.dataset.name !== '全部');
        let idx = others.length;
        for (let i = 0; i < others.length; i++) {
          const r = others[i].getBoundingClientRect();
          if (x < r.left + r.width / 2) { idx = i; break; }
        }
        flipTo(box, [box.children[0]].concat(others.slice(0, idx), [b], others.slice(idx)));
      },
      onDrop: () => {
        catOrder = Array.from(box.children).slice(1).map(c => c.dataset.name);
        saveCatOrder();
      }
    });
    box.appendChild(b);
  });
}

// 面板内的 chips（两排，4列）
function buildDropChips() {
  const box = document.getElementById('dropChips');
  box.innerHTML = '';
  ['全部', ...catOrder].forEach(t => {
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
  document.getElementById('chipRow').style.visibility = '';   // 防S1中断残留
  document.body.style.overflow = '';
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
  document.querySelectorAll('.chip-ghost, .anim-mask').forEach(g => g.remove());
}

// S1：全部态点某 chip → 收牌成药丸（FLIP：动画层隔离，布局零跳动）
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

  // 1. 动画层隔离：克隆全部 chip 到固定遮罩层；原行 visibility:hidden 但保留占位
  //    （行高不变 → 下方照片纹丝不动；宽度写死 + nowrap → 文字不换行）
  const mask = document.createElement('div');
  mask.className = 'anim-mask';
  const ghosts = chips.map(ch => {
    const r = ch.getBoundingClientRect();
    const g = ch.cloneNode(true);
    g.className = 'tab chip-ghost';
    g.style.left = r.left + 'px';
    g.style.top = r.top + 'px';
    g.style.width = r.width + 'px';
    mask.appendChild(g);
    return { el: g, dx: targetX - (r.left + r.width / 2) };
  });
  document.body.appendChild(mask);
  row.style.visibility = 'hidden';
  document.body.style.overflow = 'hidden';   // 动画期锁滚动，网格冻结

  // 2. 下一帧：收牌（向目标中心收缩+淡出，180ms）
  requestAnimationFrame(() => {
    ghosts.forEach(o => {
      o.el.style.transform = `translateX(${o.dx}px) scale(.2)`;
      o.el.style.opacity = '0';
    });
  });

  // 3. 收尾换帧：一次性完成（撤遮罩→撤占位→药丸淡入→网格才切换）
  //    全部发生在同一帧内 = 用户只感知到一次变化，没有第二次跳动
  setTimeout(() => {
    if (token !== animToken) return;   // 可打断：令牌过期直接退出
    mask.remove();
    row.style.visibility = '';
    row.classList.add('hidden');
    document.body.style.overflow = '';
    currentChip = cat;
    const pill = document.getElementById('pillBtn');
    document.getElementById('pillText').textContent = cat;
    pill.classList.remove('hidden');   // 药丸在左对齐位置淡入
    renderApp(false);                  // 照片此刻才原地变成筛选结果
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
    spreadChips();
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

  catOrder.forEach(cat => {
    const items = sortItems(allItems.filter(i => i.category === cat), cat);
    const sec = document.createElement('div');
    sec.className = 'section';

    const head = document.createElement('div');
    head.className = 'section-head tap';
    head.innerHTML = `<span class="name">${cat}</span><span class="count">${items.length} 件 ›</span>`;
    head.onclick = () => { if (justDragged()) return; currentChip = cat; renderApp(); };
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
        d.className = 'hthumb' + (selectedIds.has(item.id) ? ' selected' : '');
        d.dataset.id = item.id;
        const img = document.createElement('img');
        img.src = URL.createObjectURL(item.image);
        d.appendChild(img);
        const badge = document.createElement('span');
        badge.className = 'check-badge';
        d.appendChild(badge);
        d.addEventListener('click', () => { if (justDragged()) return; if (selectMode) { toggleSelect(item.id); return; } openDetail(item.id, item.image); });
        bindSortable(d, {
          onHoldStill: () => enterSelectMode(item.id),
          onDragMove: (x) => rowReorder(row, d, x),
          onDrop: () => persistItemOrder(cat, row)
        });
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

  const items = sortItems(allItems.filter(i => i.category === cat), cat);
  if (items.length === 0) {
    gridBox.classList.add('hidden');
    emptyTip.textContent = `抽屉空着，右下角加号放进第一件${cat}`;
    emptyTip.classList.remove('hidden');
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'thumb' + (selectedIds.has(item.id) ? ' selected' : '');
    div.dataset.id = item.id;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(item.image);
    div.appendChild(img);
    const badge = document.createElement('span');
    badge.className = 'check-badge';
    div.appendChild(badge);
    div.addEventListener('click', () => { if (justDragged()) return; if (selectMode) { toggleSelect(item.id); return; } openDetail(item.id, item.image); });
    bindSortable(div, {
      onHoldStill: () => enterSelectMode(item.id),
      onDragMove: (x, y) => gridReorder(gridBox, div, x, y),
      onDrop: () => persistItemOrder(cat, gridBox)
    });
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
    if (!addCategory) addCategory = catOrder[0];
    catOrder.forEach(c => {
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
      time: Date.now(),
      ...newArchive()   // 新记录默认带全部档案字段
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

// ---------- 排序系统：长按拖拽 + FLIP让位（纯JS，无库） ----------
// 手势：按住600ms+移动>10px=拖拽；按住不动即松手=多选（既有逻辑）
let catOrder = loadCatOrder();
const dragState = { active: false };
let suppressClickUntil = 0;

function justDragged() { return Date.now() < suppressClickUntil; }

function loadCatOrder() {
  try {
    const o = JSON.parse(localStorage.getItem('catOrder'));
    if (Array.isArray(o) && o.length === CATEGORIES.length && o.every(c => CATEGORIES.includes(c))) return o;
  } catch (e) {}
  return CATEGORIES.slice();
}
function saveCatOrder() { localStorage.setItem('catOrder', JSON.stringify(catOrder)); }

function loadItemOrder(cat) {
  try {
    const o = JSON.parse(localStorage.getItem('itemOrder_' + cat));
    if (Array.isArray(o)) return o;
  } catch (e) {}
  return [];
}
function saveItemOrder(cat, ids) { localStorage.setItem('itemOrder_' + cat, JSON.stringify(ids)); }

// 按持久化顺序排列；未记录的新衣物自动排该类末尾
function sortItems(items, cat) {
  const order = loadItemOrder(cat);
  if (!order.length) return items;
  const map = {};
  items.forEach(i => { map[i.id] = i; });
  const sorted = [], used = new Set();
  order.forEach(id => { if (map[id] && !used.has(id)) { sorted.push(map[id]); used.add(id); } });
  items.forEach(i => { if (!used.has(i.id)) sorted.push(i); });
  return sorted;
}

// 绑定长按拖拽。ctx: { onHoldStill, onDragMove(x,y), onDrop }
function bindSortable(el, ctx) {
  let startX = 0, startY = 0, timer = null, holding = false, moved = false;
  let floaty = null, offX = 0, offY = 0;

  function down(x, y) {
    if (dragState.active || selectMode) return;
    startX = x; startY = y; moved = false; holding = false;
    timer = setTimeout(() => { holding = true; }, 600);
  }
  function move(x, y, ev) {
    if (!timer && !holding) return;
    const dist = Math.hypot(x - startX, y - startY);
    if (!holding) {
      if (dist > 10) { clearTimeout(timer); timer = null; }   // 提前移动=滚动/滑动意图，弃权
      return;
    }
    if (!moved && dist > 10) { moved = true; startDrag(); }
    if (moved) {
      if (ev && ev.cancelable) ev.preventDefault();           // 阻断原生滚动
      floaty.style.left = (x - offX) + 'px';
      floaty.style.top = (y - offY) + 'px';
      ctx.onDragMove && ctx.onDragMove(x, y);
    }
  }
  function up() {
    clearTimeout(timer); timer = null;
    if (holding && !moved) { holding = false; ctx.onHoldStill && ctx.onHoldStill(); return; }
    if (moved) finishDrag();
    holding = false; moved = false;
  }
  function forceEnd() {
    clearTimeout(timer); timer = null;
    if (moved) finishDrag();
    holding = false; moved = false;
  }

  function startDrag() {
    dragState.active = true;
    suppressClickUntil = Date.now() + 400;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }   // iOS静默
    el.style.transform = 'scale(1)';   // 抵消全局按压缩放，量出真实尺寸（否则克隆体偏窄→文字竖排）
    const r = el.getBoundingClientRect();
    offX = startX - r.left; offY = startY - r.top;
    floaty = el.cloneNode(true);
    floaty.className = el.className.replace('drag-src', '') + ' drag-float';
    floaty.style.left = r.left + 'px';
    floaty.style.top = r.top + 'px';
    floaty.style.width = r.width + 'px';
    floaty.style.height = r.height + 'px';
    document.body.appendChild(floaty);
    el.classList.add('drag-src');   // 原位置隐形占位，布局不塌
  }

  function finishDrag() {
    const slot = el.getBoundingClientRect();   // el已被FLIP移到目标位，占位即空位
    floaty.classList.add('dropping');
    floaty.style.left = slot.left + 'px';
    floaty.style.top = slot.top + 'px';
    setTimeout(() => {
      floaty.remove(); floaty = null;
      el.classList.remove('drag-src');
      el.style.transform = '';   // 归还内联样式
      dragState.active = false;
      suppressClickUntil = Date.now() + 300;   // 吃掉松手后的误点击
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      ctx.onDrop && ctx.onDrop();
    }, 100);   // 100ms轻缓动落位，无大回弹
  }

  // 触屏
  el.addEventListener('touchstart', e => { const t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
  el.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
  el.addEventListener('touchend', up);
  el.addEventListener('touchcancel', forceEnd);
  // 鼠标（电脑调试用）
  el.addEventListener('mousedown', e => { if (e.button === 0) down(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { if (timer || holding) move(e.clientX, e.clientY, null); });
  window.addEventListener('mouseup', () => { if (timer || holding) up(); });
}

// FLIP：兄弟元素滑开让位（≤200ms缓动，布局零跳动）
function flipTo(container, orderedEls) {
  const first = new Map();
  Array.from(container.children).forEach(c => first.set(c, c.getBoundingClientRect()));
  orderedEls.forEach(e => container.appendChild(e));
  Array.from(container.children).forEach(c => {
    const f = first.get(c);
    if (!f) return;
    const l = c.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (dx || dy) {
      c.style.transition = 'none';
      c.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        c.style.transition = 'transform .18s ease';
        c.style.transform = '';
        c.addEventListener('transitionend', () => { c.style.transition = ''; }, { once: true });
      });
    }
  });
}

// 网格插入位置：阅读顺序（先行后列）
function gridReorder(container, draggedEl, x, y) {
  const others = Array.from(container.children).filter(e => e !== draggedEl);
  let idx = others.length;
  for (let i = 0; i < others.length; i++) {
    const r = others[i].getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy > y + 4 || (Math.abs(cy - y) <= 4 && cx > x)) { idx = i; break; }
  }
  flipTo(container, others.slice(0, idx).concat([draggedEl], others.slice(idx)));
}

// 抽屉行插入位置：仅左右换位
function rowReorder(container, draggedEl, x) {
  const others = Array.from(container.children).filter(e => e !== draggedEl);
  let idx = others.length;
  for (let i = 0; i < others.length; i++) {
    const r = others[i].getBoundingClientRect();
    if (x < r.left + r.width / 2) { idx = i; break; }
  }
  flipTo(container, others.slice(0, idx).concat([draggedEl], others.slice(idx)));
}

// 落位后持久化某类的衣物顺序
function persistItemOrder(cat, container) {
  const ids = Array.from(container.children)
    .map(c => parseInt(c.dataset.id, 10))
    .filter(n => !isNaN(n));
  saveItemOrder(cat, ids);
}
// ---------- 长按多选管理模式（独立叠加状态，不污染普通模式） ----------
let selectMode = false;
let selectedIds = new Set();
let selectPushed = false;

function enterSelectMode(id) {
  if (selectMode) return;
  selectMode = true;
  selectedIds = new Set([id]);
  if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }  // iOS静默降级
  history.pushState({ sm: 1 }, '');   // 安卓返回键可退出
  selectPushed = true;
  updateSelectUI();
  renderApp();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateSelectUI();
  // 只切换被点那一项的样式，绝不整页重绘（重绘会闪）
  document.querySelectorAll('[data-id="' + id + '"]').forEach(el => {
    el.classList.toggle('selected', selectedIds.has(id));
  });
}

function toggleSelectAll() {
  const viewItems = currentChip === '全部' ? allItems : allItems.filter(i => i.category === currentChip);
  const allSel = viewItems.length > 0 && viewItems.every(i => selectedIds.has(i.id));
  selectedIds.clear();
  if (!allSel) viewItems.forEach(i => selectedIds.add(i.id));
  updateSelectUI();
  renderApp();
}

function exitSelectMode() {
  if (!selectMode) return;
  selectMode = false;
  selectedIds.clear();
  updateSelectUI();
  renderApp();
  if (selectPushed) { selectPushed = false; history.back(); }
}

// 安卓返回键退出（iOS无返回键，用顶栏"取消"）
window.addEventListener('popstate', () => {
  if (selectMode) {
    selectMode = false;
    selectedIds.clear();
    selectPushed = false;
    updateSelectUI();
    renderApp();
  }
});

function updateSelectUI() {
  document.body.classList.toggle('selecting', selectMode);
  document.getElementById('filterBar').classList.toggle('hidden', selectMode);
  document.getElementById('normalHeader').classList.toggle('hidden', selectMode);
  document.getElementById('selectBar').classList.toggle('hidden', !selectMode);
  document.getElementById('manageBar').classList.toggle('hidden', !selectMode);
  document.getElementById('fab').classList.toggle('hidden', selectMode);
  document.getElementById('selectCount').textContent = '已选择' + selectedIds.size + '项';
  document.getElementById('batchDeleteBtn').disabled = selectedIds.size === 0;
}

// 移到抽屉（是移动不是复制）
function openMoveSheet() {
  if (selectedIds.size === 0) return;
  const box = document.getElementById('moveChips');
  box.innerHTML = '';
  catOrder.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = c;
    chip.onclick = () => moveSelectedTo(c);
    box.appendChild(chip);
  });
  document.getElementById('moveSheet').classList.remove('hidden');
}
function closeMoveSheet() { document.getElementById('moveSheet').classList.add('hidden'); }

function moveSelectedTo(cat) {
  closeMoveSheet();
  const ids = [...selectedIds];
  showToast('处理中…');
  let done = 0;
  ids.forEach(id => {
    const tx = db.transaction('clothes', 'readwrite');
    const store = tx.objectStore('clothes');
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (item && item.category !== cat) { item.category = cat; store.put(item); }
    };
    tx.oncomplete = () => {
      done++;
      if (done === ids.length) { showToast('已移动'); exitSelectMode(); }
    };
  });
}

// 批量删除（带确认弹窗）
function askBatchDelete() {
  if (selectedIds.size === 0) return;
  document.getElementById('confirmText').textContent = '删除这' + selectedIds.size + '件衣服？删了就找不回来了';
  document.getElementById('confirmMask').classList.remove('hidden');
}
function closeConfirm() { document.getElementById('confirmMask').classList.add('hidden'); }
function doBatchDelete() {
  closeConfirm();
  const ids = [...selectedIds];
  showToast('处理中…');
  let done = 0;
  ids.forEach(id => {
    const tx = db.transaction('clothes', 'readwrite');
    tx.objectStore('clothes').delete(id);
    tx.oncomplete = () => {
      done++;
      if (done === ids.length) { showToast('已删除'); exitSelectMode(); }
    };
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
