// ========== 数字衣柜 · 单页结构 ==========
// 只有一个页面：衣柜。Tab=过滤，加号=录入，没有页面跳转。

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
let currentTab = '全部';     // 当前过滤品类
let addCategory = '';        // 本次录入品类（从当前过滤继承）

window.onload = () => {
  renderWardrobeTabs();
  renderWardrobe();
};

// ---------- 衣柜浏览（唯一的页面内容） ----------
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
    addCategory = currentTab;   // 品类继承
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
// 放弃：关掉预览回衣柜
function exitPreview() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
}

// 重新录入：回动作面板重选
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

// 确认：保存 → 跳到该品类 Tab，当场看到（录完即所见）
function saveAndExit() {
  const savedCat = addCategory;
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    currentTab = savedCat;
    renderWardrobe();
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
