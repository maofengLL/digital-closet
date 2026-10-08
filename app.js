// ========== 数字衣柜 · 两页结构 ==========
// 首页（品类入口） / 衣柜页（浏览+过滤+录入入口）
// 品类页 = 衣柜页 + currentTab 过滤参数，不单独存在

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
let currentPage = 'home';
let currentTab = '全部';     // 衣柜页当前的过滤品类
let addCategory = '';        // 本次录入的品类（从当前过滤继承）

window.onload = () => {
  renderCategories();
  renderWardrobeTabs();
  showPage('home');
};

// ---------- 页面切换 ----------
function showPage(name) {
  currentPage = name;
  document.getElementById('homeView').classList.toggle('hidden', name !== 'home');
  document.getElementById('wardrobeView').classList.toggle('hidden', name !== 'wardrobe');
  document.getElementById('backBtn').classList.toggle('hidden', name !== 'wardrobe');
  document.getElementById('fab').classList.toggle('hidden', name !== 'wardrobe');
  document.getElementById('navHome').classList.toggle('active', name === 'home');
  document.getElementById('navWardrobe').classList.toggle('active', name === 'wardrobe');
}

function goHome() { showPage('home'); }

// 底部导航进衣柜 = 全部
function goWardrobeAll() {
  currentTab = '全部';
  showPage('wardrobe');
  renderWardrobe();
}

// 首页点品类 = 衣柜页 + 该品类过滤
function openCategory(cat) {
  currentTab = cat;
  showPage('wardrobe');
  renderWardrobe();
}

// 左上角返回：衣柜 → 首页
function onBack() {
  if (currentPage === 'wardrobe') showPage('home');
}

// ---------- 首页品类入口 ----------
function renderCategories() {
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

// ---------- 衣柜浏览 ----------
const TABS = ['全部', ...CATEGORIES];

function renderWardrobeTabs() {
  const box = document.getElementById('wardrobeTabs');
  box.innerHTML = '';
  TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => { currentTab = t; renderWardrobe(); };
    box.appendChild(b);
  });
}

function renderWardrobe() {
  // 高亮当前 Tab
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.name === currentTab);
  });

  const grid = document.getElementById('wardrobeGrid');
  grid.innerHTML = '';
  const emptyTip = document.getElementById('emptyTip');
  let count = 0;

  const store = db.transaction('clothes', 'readonly').objectStore('clothes');
  store.openCursor().onsuccess = e => {
    const cur = e.target.result;
    if (cur) {
      const item = cur.value;
      if (currentTab === '全部' || item.category === currentTab) {
        count++;
        const div = document.createElement('div');
        div.className = 'thumb';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(item.image);
        div.appendChild(img);
        div.addEventListener('click', () => openDetail(cur.key, item.image));
        bindLongPress(div, () => deleteCloth(cur.key));
        grid.appendChild(div);
      }
      cur.continue();
    } else {
      // 空状态：空而有说法
      if (count === 0) {
        emptyTip.textContent = currentTab === '全部'
          ? '这里还空着，点右下角加号，把第一件衣服拍进来'
          : `这里还空着，点右下角加号，把第一件${currentTab}拍进来`;
        emptyTip.classList.remove('hidden');
      } else {
        emptyTip.classList.add('hidden');
      }
    }
  };
}

// ---------- 悬浮加号 → 动作面板 ----------
function openSheet() {
  const catsBox = document.getElementById('sheetCats');
  if (currentTab === '全部') {
    // 过滤条件是"全部"时品类未知：给一排小标签让用户点选，预选第一个
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
    // 品类继承：从"上衣"页点加号，默认就是上衣，用户无需再选
    addCategory = currentTab;
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
// 放弃：回衣柜页
function exitPreview() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
  showPage('wardrobe');
  renderWardrobe();
}

// 重新录入：回动作面板重选
function reenter() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
  openSheet();
}

// 保存核心
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

// 确认：保存 → 自动跳到该品类页，当场看到新衣服（录完即所见）
function saveAndExit() {
  const savedCat = addCategory;
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    currentTab = savedCat;
    showPage('wardrobe');
    renderWardrobe();
  });
}

// 下一张：保存 → 立刻打开面板接着录（批量，品类沿用）
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
  tx.oncomplete = () => renderWardrobe();
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
