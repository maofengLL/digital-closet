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
const SCHEMA_VERSION = 4;                 // 数据结构版本号
const SCHEMA_KEY = 'closetSchemaVersion'; // localStorage 里记录版本，避免每次启动重跑

// 新记录的档案默认值（所有空串 = 未知/未填，不用 null）
function newArchive() {
  return {
    care: { materials: [], wash: '', bleach: '', dry: '', iron: '', waterTemp: '' },
    careVerified: false,                 // 只有用户亲手核对过问卷才置 true
    meta: { purchaseDate: '', status: '在穿' },
    notes: [],
    photos: { standard: '' },            // 占位：blob 存储无路径，步骤6产出标准图后填入
    careCompletedAt: ''                  // 问卷确认时间戳（跳过不写入；空串=未确认过）
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
  if (item.careCompletedAt === undefined || item.careCompletedAt === null) item.careCompletedAt = '';
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
      makeGeo: () => makeGeo(box, b, { isRow: true, fixedFirst: box.children[0] }),
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
        if (item.careVerified && item.careCompletedAt) {
          const st = document.createElement('span');
          st.className = 'card-stamp';
          const dd = new Date(item.careCompletedAt);
          st.textContent = (dd.getMonth() + 1) + '.' + dd.getDate();
          if (item.id === pendingStampId) { st.classList.add('stamping'); pendingStampId = null; }
          d.appendChild(st);
        }
        d.appendChild(badge);
        d.addEventListener('click', () => { if (justDragged()) return; if (selectMode) { toggleSelect(item.id); return; } openDetail(item.id, item.image); });
        bindSortable(d, {
          onHoldStill: () => enterSelectMode(item.id),
          makeGeo: () => makeGeo(row, d, { isRow: true }),
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
    if (item.careVerified && item.careCompletedAt) {
      const st = document.createElement('span');
      st.className = 'card-stamp';
      const dd = new Date(item.careCompletedAt);
      st.textContent = (dd.getMonth() + 1) + '.' + dd.getDate();
      if (item.id === pendingStampId) { st.classList.add('stamping'); pendingStampId = null; }
      div.appendChild(st);
    }
    div.appendChild(badge);
    div.addEventListener('click', () => { if (justDragged()) return; if (selectMode) { toggleSelect(item.id); return; } openDetail(item.id, item.image); });
    bindSortable(div, {
      onHoldStill: () => enterSelectMode(item.id),
      makeGeo: () => makeGeo(gridBox, div, { isRow: false }),
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

// ---------- 录入闭环：确认页 → 问卷 → 保存 → 盖章 → 落柜 ----------
let pendingEntry = null;   // 确认页与问卷之间的暂存：{ photo, category, after: 'exit'|'next' }
let pendingStampId = null;   // 待盖戳的衣服id（本次启动首件录入）
let entryCount = 0;        // 本次启动已录入件数：首件完整邮戳，其余轻量

// 确认页"确认/下一张"：不直接保存，暂存后进问卷（默认精简形态）
function prepareEntry(after) {
  if (!currentPhoto) { alert('请先选择照片'); return; }
  if (!db) { alert('数据库还没准备好，请等一秒再点'); return; }
  pendingEntry = { photo: currentPhoto, category: addCategory, after: after };
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
  openCareEntry('lite');
}

function saveAndExit() { prepareEntry('exit'); }
function saveAndNext() { prepareEntry('next'); }

// 问卷页（录入模式）：预选=历史继承/品类默认
function openCareEntry(mode) {
  if (!pendingEntry) return;
  const pre = carePrefill({ category: pendingEntry.category });
  careQuiz = { itemId: null, mode: mode, answers: pre, entry: true, after: pendingEntry.after };
  renderCareQuiz();
  document.getElementById('careMask').classList.remove('hidden');
}

// 精简→全量切换（顶部小字入口）
function careSwitchFull() {
  if (!careQuiz) return;
  careQuiz.mode = 'full';
  renderCareQuiz();
}

// 问卷页返回键：回确认页，不保存问卷数据
// 返回键：全量形态→退回精简问卷（答案保留）；精简形态→退回照片确认页（不保存问卷数据）
function careBack() {
  if (careQuiz && careQuiz.mode === 'full') {
    careQuiz.mode = 'lite';
    renderCareQuiz();      // 退层，answers 原样保留（包括隐藏的水温题）
    return;
  }
  const photo = pendingEntry ? pendingEntry.photo : null;
  closeCareQuiz();
  if (photo) {
    currentPhoto = photo;
    document.getElementById('previewImg').src = URL.createObjectURL(photo);
    document.getElementById('preview').classList.remove('hidden');
  }
}

// 问卷确认后的真正入库
function saveEntryItem(care, verified, after) {
  showToast('保存中…');
  const item = {
    image: pendingEntry.photo,
    category: pendingEntry.category,
    time: Date.now(),
    ...newArchive(),
    care: care,
    careVerified: verified
  };
  if (verified) item.careCompletedAt = Date.now();
  try {
    const tx = db.transaction('clothes', 'readwrite');
    const req = tx.objectStore('clothes').add(item);
    let newId = null;
    req.onsuccess = e => { newId = e.target.result; };   // 拿到新衣服的id
    tx.oncomplete = () => finishEntry(after, newId);
    tx.onerror = () => alert('保存失败：' + tx.error.message);
  } catch (err) {
    alert('出错了：' + err.message);
  }
}

// 保存完成：盖章 → 刷新落到单品类网格（首格可见）→ "下一张"则继续录
function finishEntry(after, newId) {
  const savedCat = pendingEntry.category;
  currentChip = savedCat;
  pendingEntry = null;
  const isFirst = entryCount === 0;      // 盖戳动画只给本次启动的第一件
  loadAll(() => {
    playStamp();
    pendingStampId = isFirst ? newId : null;
    renderApp();                           // 渲染时给新卡的戳加 stamping 动画
    if (after === 'next') openSheet();
  });
}

// 盖章动画：首件完整邮戳（约1秒），其后轻量对勾（约300ms），不挡操作
function playStamp() {
  entryCount++;
  showToast(entryCount === 1 ? '档案建好咯' : '档案建好');
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

// 绑定长按拖拽。ctx: { onHoldStill, makeGeo(dragged)→geo, onDrop }
// 性能规范：位置只走 transform；rAF 驱动；几何预算；让位去重
function bindSortable(el, ctx) {
  let startX = 0, startY = 0, timer = null, holding = false, moved = false;
  let floaty = null, offX = 0, offY = 0;
  let origX = 0, origY = 0;                 // floaty 的定位基准（transform 相对它）
  let lastX = 0, lastY = 0, rafId = null;
  let geo = null, lastIdx = -1;

  function down(x, y) {
    if (dragState.active || selectMode) return;
    startX = x; startY = y; moved = false; holding = false;
    timer = setTimeout(() => { holding = true; }, 600);
  }
  function move(x, y, ev) {
    if (!timer && !holding) return;
    const dist = Math.hypot(x - startX, y - startY);
    if (!holding) {
      if (dist > 10) { clearTimeout(timer); timer = null; }
      return;
    }
    if (!moved && dist > 10) { moved = true; startDrag(); }
    if (moved) {
      if (ev && ev.cancelable) ev.preventDefault();
      lastX = x; lastY = y;
      if (!rafId) rafId = requestAnimationFrame(updateFloat);   // rAF驱动：同帧多次move只更新一次
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
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    el.style.transform = 'scale(1)';          // 抵消全局按压缩放，量真实尺寸
    const r = el.getBoundingClientRect();
    offX = startX - r.left; offY = startY - r.top;
    origX = r.left; origY = r.top;
    geo = ctx.makeGeo ? ctx.makeGeo(el) : null;   // 一次性缓存几何
    lastIdx = geo ? geo.indexFromPoint(startX, startY) : -1;

    floaty = el.cloneNode(true);
    floaty.className = el.className.replace('drag-src', '') + ' drag-float';
    floaty.style.left = r.left + 'px';        // 只在此刻写一次
    floaty.style.top = r.top + 'px';
    floaty.style.width = r.width + 'px';
    floaty.style.height = r.height + 'px';
    floaty.style.willChange = 'transform';    // 提前声明，合成层待命
    document.body.appendChild(floaty);
    el.classList.add('drag-src');
  }

  function updateFloat() {
    rafId = null;
    // 只走 translate3d（顺带 translateZ(0) 提合成层），绝不碰 left/top
    const px = lastX - offX, py = lastY - offY;
    floaty.style.transform = `translate3d(${px - origX}px, ${py - origY}px, 0) scale(1.08)`;
    if (geo) {
      const idx = geo.indexFromPoint(lastX, lastY);   // 纯数学推算，零布局读取
      if (idx !== lastIdx) {                          // 去重：只有目标格变化才让位
        lastIdx = idx;
        geo.apply(idx);
      }
    }
  }

  function finishDrag() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    const slot = el.getBoundingClientRect();      // 收尾允许读一次终态
    floaty.classList.add('dropping');
    floaty.style.willChange = '';                 // 释放合成层
    floaty.style.transform = `translate3d(${slot.left - origX}px, ${slot.top - origY}px, 0) scale(1)`;
    setTimeout(() => {
      floaty.remove(); floaty = null;
      el.classList.remove('drag-src');
      el.style.transform = '';
      dragState.active = false;
      suppressClickUntil = Date.now() + 300;
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      ctx.onDrop && ctx.onDrop();
    }, 100);
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
// 几何缓存工厂：拖动开始时一次性读布局，之后每帧纯数学推算
// opt: { isRow: 仅左右换位, fixedFirst: 钉死首位的元素（如"全部"chip） }
function makeGeo(container, dragged, opt) {
  const isRow = opt && opt.isRow;
  const fixedFirst = opt && opt.fixedFirst;
  let units = snapshot();

  function snapshot() {
    return Array.from(container.children)
      .filter(e => e !== dragged && e !== fixedFirst)
      .map(e => {
        const r = e.getBoundingClientRect();
        return { el: e, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
  }

  return {
    indexFromPoint(x, y) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (isRow) { if (x < u.cx) return i; }
        else if (u.cy > y + 4 || (Math.abs(u.cy - y) <= 4 && u.cx > x)) return i;
      }
      return units.length;
    },
    apply(idx) {
      const els = units.map(u => u.el);
      els.splice(idx, 0, dragged);
      if (fixedFirst) els.unshift(fixedFirst);
      flipTo(container, els);
      units = snapshot();   // 让位后重建缓存（仅目标格变化时发生，不是每帧）
    }
  };
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
// ---------- 洗护问卷（阶段②步骤2，独立组件，测试入口在大图层） ----------
const CARE_QUESTIONS = {
  materials: { title: '材质（可多选）', multi: true, options: ['棉', '麻', '丝', '羊毛', '涤纶', '锦纶', '粘胶/莫代尔', '其他'] },
  wash:      { title: '洗涤方式', options: ['机洗', '手洗', '只干洗', '不可水洗'] },
  waterTemp: { title: '水温', options: ['30°C以下', '40°C', '60°C', '高温可'] },
  bleach:    { title: '漂白', options: ['可漂白', '不可漂白'] },
  dry:       { title: '干燥', options: ['可烘干', '不可烘干', '阴干'] },
  iron:      { title: '熨烫', options: ['不可熨', '低温熨', '中高温熨'] }
};
const CARE_FULL_ORDER = ['materials', 'wash', 'waterTemp', 'bleach', 'dry', 'iron'];
const CARE_LITE_ORDER = ['materials', 'wash'];
const CARE_FIELDS = ['materials', 'wash', 'waterTemp', 'bleach', 'dry', 'iron'];

// 品类默认（仅这四类有默认，其余不预选）
const CARE_CAT_DEFAULTS = {
  '上装': { materials: ['棉'], wash: '机洗', waterTemp: '30°C以下', bleach: '不可漂白', dry: '可烘干', iron: '中高温熨' },
  '裤装': { materials: ['棉'], wash: '机洗', waterTemp: '30°C以下', bleach: '', dry: '', iron: '' },
  '外套': { materials: ['涤纶'], wash: '机洗', waterTemp: '30°C以下', bleach: '', dry: '', iron: '' },
  '裙装': { materials: [], wash: '手洗', waterTemp: '', bleach: '', dry: '', iron: '' }
};

let careQuiz = null;   // { itemId, mode, answers: {...} }

// 预选：自己已核对的值 > 同品类最近已核对档案（逐字段回落） > 品类默认
function carePrefill(item) {
  const def = CARE_CAT_DEFAULTS[item.category] || {};
  if (item.careVerified && item.care) return normalizeCare(item.care, def);
  let hist = null;
  allItems.forEach(it => {
    if (it.id !== item.id && it.category === item.category && it.careVerified && it.care) {
      if (!hist || it.time > hist.time) hist = it.care;
    }
  });
  return normalizeCare(hist || {}, def);
}

function normalizeCare(src, def) {
  const pre = {};
  CARE_FIELDS.forEach(k => {
    if (k === 'materials') {
      pre[k] = (Array.isArray(src.materials) && src.materials.length) ? src.materials.slice() : (def.materials || []).slice();
    } else {
      pre[k] = (src[k] !== undefined && src[k] !== '') ? src[k] : (def[k] || '');
    }
  });
  return pre;
}

// 打开问卷。mode: 'full' 全量（标签在手） / 'lite' 精简（标签不在手）
function openCareQuiz(itemId, mode) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) { alert('先等衣柜加载完'); return; }
  const pre = carePrefill(item);
  careQuiz = { itemId: itemId, mode: mode, answers: pre };
  renderCareQuiz();
  document.getElementById('careMask').classList.remove('hidden');
}

function renderCareQuiz() {
  const order = careQuiz.mode === 'full' ? CARE_FULL_ORDER : CARE_LITE_ORDER;
  const body = document.getElementById('careBody');
  body.innerHTML = '';
  order.forEach(key => {
    // 水温题：仅洗涤方式为机洗/手洗时显示
    if (key === 'waterTemp' && careQuiz.answers.wash !== '机洗' && careQuiz.answers.wash !== '手洗') return;
    const q = CARE_QUESTIONS[key];
    const div = document.createElement('div');
    div.className = 'care-q';
    const t = document.createElement('p');
    t.className = 'care-q-title';
    t.textContent = q.title;
    div.appendChild(t);
    const opts = document.createElement('div');
    opts.className = 'care-opts';
    q.options.forEach(op => {
      const b = document.createElement('button');
      const sel = (key === 'materials') ? careQuiz.answers.materials.includes(op) : careQuiz.answers[key] === op;
      b.className = 'care-opt' + (sel ? ' sel' : '');
      b.textContent = op;
      b.onclick = () => pickCare(key, op);
      opts.appendChild(b);
    });
    div.appendChild(opts);
    body.appendChild(div);
  });
  // 跳过按钮仅精简形态有
  document.getElementById('careSkipBtn').classList.toggle('hidden', careQuiz.mode !== 'lite');
  document.getElementById('careToFull').classList.toggle('hidden', careQuiz.mode !== 'lite');   // 仅精简可切全量
  document.getElementById('careBackBtn').classList.toggle('hidden', !careQuiz.entry);           // 仅录入流程有返回键
}

function pickCare(key, op) {
  if (key === 'materials') {
    const a = careQuiz.answers.materials;
    const i = a.indexOf(op);
    if (i >= 0) a.splice(i, 1); else a.push(op);
  } else {
    careQuiz.answers[key] = op;
  }
  renderCareQuiz();   // 重绘（水温题显隐跟着洗涤方式走）
}

// 写入档案：verified=true 用户核对 / false 跳过（写品类默认）
function writeCare(itemId, care, verified) {
  const tx = db.transaction('clothes', 'readwrite');
  const store = tx.objectStore('clothes');
  const req = store.get(itemId);
  req.onsuccess = () => {
    const item = req.result;
    if (!item) return;
    item.care = care;
    item.careVerified = verified;
    if (verified) item.careCompletedAt = Date.now();   // 跳过不写
    store.put(item);
  };
  tx.oncomplete = () => {
    showToast(verified ? '已记录洗护档案' : '已跳过，按品类默认');
    loadAll(() => {});   // 刷新内存，历史继承立刻可用
  };
}

function careConfirm() {
  const a = careQuiz.answers;
  const care = {
    materials: a.materials.slice(), wash: a.wash, waterTemp: a.waterTemp,
    bleach: a.bleach, dry: a.dry, iron: a.iron
  };
  if (careQuiz.entry) {
    const after = careQuiz.after;
    closeCareQuiz();
    saveEntryItem(care, true, after);      // 录入模式：确认后直接入库
  } else {
    writeCare(careQuiz.itemId, care, true); // 大图模式（步骤4纸张页用）
    closeCareQuiz();
  }
}

function careSkip() {
  if (!careQuiz || !careQuiz.entry) return;   // 跳过仅录入流程提供
  const def = CARE_CAT_DEFAULTS[pendingEntry.category] || {};
  const care = {
    materials: (def.materials || []).slice(), wash: def.wash || '', waterTemp: def.waterTemp || '',
    bleach: def.bleach || '', dry: def.dry || '', iron: def.iron || ''
  };
  const after = careQuiz.after;
  closeCareQuiz();
  saveEntryItem(care, false, after);          // 跳过：careVerified=false，不写时间戳
}

function closeCareQuiz() {
  careQuiz = null;
  document.getElementById('careMask').classList.add('hidden');
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
