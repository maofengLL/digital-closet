// ========== 数字衣柜 · 页面状态机 ==========
// 页面只有四种：home / category / wardrobe，preview 是覆盖层
// 返回键的行为由"当前页面"决定

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
let currentCategory = '';
let currentPhoto = null;
let currentPage = 'home';

window.onload = () => {
  renderCategories();
  renderWardrobeTabs();
  showPage('home');
};

// ---------- 页面切换 ----------
function showPage(name) {
  currentPage = name;
  document.getElementById('homeView').classList.toggle('hidden', name !== 'home');
  document.getElementById('categoryView').classList.toggle('hidden', name !== 'category');
  document.getElementById('wardrobeView').classList.toggle('hidden', name !== 'wardrobe');
  // 只有品类页显示左上角返回键
  document.getElementById('backBtn').classList.toggle('hidden', name !== 'category');
  // 底部导航高亮
  document.getElementById('navHome').classList.toggle('active', name !== 'wardrobe');
  document.getElementById('navWardrobe').classList.toggle('active', name === 'wardrobe');
}

// 底部导航
function switchView(name) {
  if (name === 'wardrobe') {
    showPage('wardrobe');
    renderWardrobe(currentTab);
  } else {
    showPage('home');
  }
}

// 左上角返回键：品类页 → 回首页
function onBack() {
  if (currentPage === 'category') showPage('home');
}

// ---------- 首页：品类按钮 ----------
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

// ---------- 品类页 ----------
function openCategory(cat) {
  currentCategory = cat;
  document.getElementById('categoryTip').textContent = '类别：' + cat;
  renderCategoryActions('main');
  showPage('category');
}

// 品类页两种状态：'main' 显示录入按钮；'source' 显示拍照/相册选
function renderCategoryActions(mode) {
  const box = document.getElementById('categoryActions');
  if (mode === 'main') {
    box.innerHTML = `<button class="big-btn" onclick="renderCategoryActions('source')">录入</button>`;
  } else {
    box.innerHTML = `
      <div class="src-row">
        <button onclick="openCamera()">拍照</button>
        <button onclick="openAlbum()">相册选</button>
      </div>`;
  }
}

function openCamera() { document.getElementById('cameraInput').click(); }
function openAlbum() { document.getElementById('albumInput').click(); }

function onFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  currentPhoto = file;
  document.getElementById('previewImg').src = URL.createObjectURL(file);
  document.getElementById('preview').classList.remove('hidden');
  event.target.value = '';
}

// ---------- 预览层 ----------
// 左上角 ←：放弃，回首页
function exitPreview() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
  showPage('home');
}

// 重新录入：放弃这张，回品类页重选来源
function reenter() {
  currentPhoto = null;
  document.getElementById('preview').classList.add('hidden');
  renderCategoryActions('source');
  showPage('category');
}

// 保存核心（三个按钮共用）：成功就执行 done()
function saveCurrent(done) {
  if (!currentPhoto) { alert('请先选择照片'); return; }
  if (!db) { alert('数据库还没准备好，请等一秒再点'); return; }
  try {
    const tx = db.transaction('clothes', 'readwrite');
    tx.objectStore('clothes').add({
      image: currentPhoto,
      category: currentCategory,
      time: Date.now()
    });
    tx.oncomplete = () => { currentPhoto = null; done(); };
    tx.onerror = () => alert('保存失败：' + tx.error.message);
  } catch (err) {
    alert('出错了：' + err.message);
  }
}

// 确认：保存并回首页
function saveAndExit() {
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    showPage('home');
  });
}

// 下一张：保存这件，回到品类页接着录（批量录入）
function saveAndNext() {
  saveCurrent(() => {
    document.getElementById('preview').classList.add('hidden');
    renderCategoryActions('source');
    showPage('category');
  });
}

// ---------- 衣柜 ----------
const TABS = ['全部', ...CATEGORIES];
let currentTab = '全部';

function renderWardrobeTabs() {
  const box = document.getElementById('wardrobeTabs');
  box.innerHTML = '';
  TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t;
    b.dataset.name = t;
    b.onclick = () => renderWardrobe(t);
    box.appendChild(b);
  });
}

function renderWardrobe(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.name === tab);
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
      if (tab === '全部' || item.category === tab) {
        count++;
               const div = document.createElement('div');
        div.className = 'thumb';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(item.image);
        div.appendChild(img);
        // 点一下 = 打开大图；长按 = 快捷删除
        div.addEventListener('click', () => openDetail(cur.key, item.image));
        bindLongPress(div, () => deleteCloth(cur.key));
        grid.appendChild(div);
      }
      cur.continue();
    } else {
      emptyTip.classList.toggle('hidden', count > 0);
    }
  };
}

function deleteCloth(id) {
  if (!confirm('确定删除这件衣服吗？')) return;
  const tx = db.transaction('clothes', 'readwrite');
  tx.objectStore('clothes').delete(id);
  tx.oncomplete = () => renderWardrobe(currentTab);
}
// ========== 大图查看层 ==========
let currentViewId = null;   // 当前正在看哪件衣服

function openDetail(id, image) {
  currentViewId = id;
  document.getElementById('detailImg').src = URL.createObjectURL(image);
  document.getElementById('detail').classList.remove('hidden');
}

function closeDetail() {
  currentViewId = null;
  document.getElementById('detail').classList.add('hidden');
}

// 在大图里删除当前这件
function deleteCurrent() {
  if (currentViewId === null) return;
  deleteCloth(currentViewId);   // 复用已有的删除逻辑（自带确认弹窗）
  closeDetail();
}

// 长按 600 毫秒触发；电脑上用右键代替
function bindLongPress(el, fn) {
  let timer = null;
  el.addEventListener('touchstart', () => { timer = setTimeout(fn, 600); });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('touchmove', () => clearTimeout(timer));
  el.addEventListener('contextmenu', e => { e.preventDefault(); fn(); });
}
