// ========== 数字衣柜 · 录入 + 衣柜浏览 ==========

// ---------- 数据层：IndexedDB ----------
let db;
// 版本升到 2：新增 clothes 表（存衣服照片+分类）
// 旧的 notes 表会原样保留，不用管
const dbReq = indexedDB.open('closet-db', 2);
dbReq.onupgradeneeded = e => {
  const d = e.target.result;
  if (!d.objectStoreNames.contains('clothes')) {
    d.createObjectStore('clothes', { keyPath: 'id', autoIncrement: true });
  }
};
dbReq.onsuccess = e => { db = e.target.result; };
dbReq.onerror = () => alert('数据库打开失败，请换 Chrome 浏览器');

// ---------- 视图切换 ----------
function switchView(name) {
  document.getElementById('homeView').classList.toggle('hidden', name !== 'home');
  document.getElementById('wardrobeView').classList.toggle('hidden', name !== 'wardrobe');
  document.getElementById('navHome').classList.toggle('active', name === 'home');
  document.getElementById('navWardrobe').classList.toggle('active', name === 'wardrobe');
  if (name === 'wardrobe') renderWardrobe(currentTab);  // 每次进衣柜都刷新
}

// ---------- 录入流程 ----------
const CATEGORIES = ['上装', '裤装', '裙装', '外套', '鞋', '配饰', '其他'];
let currentCategory = '';
let currentPhoto = null;

window.onload = () => {
  renderCategories();
  renderWardrobeTabs();
};

function renderCategories() {
  const grid = document.getElementById('catGrid');
  grid.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.textContent = cat;
    btn.onclick = () => askSource(cat);
    grid.appendChild(btn);
  });
}

function askSource(cat) {
  currentCategory = cat;
  document.getElementById('catGrid').innerHTML = `
    <p class="tip">${cat}：拍照，或从相册选择</p>
    <div class="src-row">
      <button onclick="openCamera()">拍照</button>
      <button onclick="openAlbum()">相册选</button>
    </div>
    <div class="src-row" style="margin-top:10px">
      <button onclick="renderCategories()" style="background:#666">返回</button>
    </div>`;
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

function backHome() {
  document.getElementById('preview').classList.add('hidden');
  renderCategories();
}

// 确认：真正存进数据库
function confirmPhoto() {
  if (!currentPhoto) return;
  const tx = db.transaction('clothes', 'readwrite');
  tx.objectStore('clothes').add({
    image: currentPhoto,     // Blob 直接存，不用转换格式
    category: currentCategory,
    time: Date.now()
  });
  tx.oncomplete = () => {
    currentPhoto = null;
    backHome();              // 回到录入页，可以继续拍下一件
  };
}

// ---------- 衣柜浏览 ----------
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
  // 高亮当前 Tab
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
        img.src = URL.createObjectURL(item.image);  // Blob → 临时网址直接显示
        div.appendChild(img);
        bindLongPress(div, () => deleteCloth(cur.key));
        grid.appendChild(div);
      }
      cur.continue();
    } else {
      emptyTip.classList.toggle('hidden', count > 0);  // 没衣服时显示提示
    }
  };
}

function deleteCloth(id) {
  if (!confirm('确定删除这件衣服吗？')) return;   // 二次确认，防误删
  const tx = db.transaction('clothes', 'readwrite');
  tx.objectStore('clothes').delete(id);
  tx.oncomplete = () => renderWardrobe(currentTab);
}

// 长按识别：按住 600 毫秒触发（手机上）
// 电脑上调试时用鼠标右键代替长按
function bindLongPress(el, fn) {
  let timer = null;
  el.addEventListener('touchstart', () => { timer = setTimeout(fn, 600); });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('touchmove', () => clearTimeout(timer));  // 滑动取消，防误触
  el.addEventListener('contextmenu', e => { e.preventDefault(); fn(); });
}
