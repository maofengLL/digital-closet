// ========== 品类与拍摄流程 ==========
// 流程：首页点品类 → 出现"拍照/相册"两个选项 → 选图 → 全屏预览 → 确认或重选

// 7 个大类（细分品类靠轮廓区分，不在这一步问）
const CATEGORIES = ['上装', '裤装', '裙装', '外套', '鞋', '配饰', '其他'];

// 本次选择的记录：选了哪个品类、哪张照片
let currentCategory = '';
let currentPhoto = null;

// 页面加载完，生成品类按钮
window.onload = () => {
  renderCategories();
};

function renderCategories() {
  const grid = document.getElementById('catGrid');
  grid.innerHTML = '';  // 清空重来（后面从预览返回时也要用）
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.textContent = cat;
    // 点品类 → 问"拍照还是相册"
    btn.onclick = () => askSource(cat);
    grid.appendChild(btn);
  });
}

function askSource(cat) {
  currentCategory = cat;  // 记住用户选了什么品类
  const grid = document.getElementById('catGrid');
  // 把按钮区临时换成两个大选项（返回时会重新生成按钮，所以直接覆盖没关系）
  grid.innerHTML = `
    <p class="tip">${cat}：拍照，或从相册选择</p>
    <div class="src-row">
      <button onclick="openCamera()">拍照</button>
      <button onclick="openAlbum()">相册选</button>
    </div>
    <div class="src-row" style="margin-top:10px">
      <button onclick="renderCategories()" style="background:#666">返回</button>
    </div>`;
}

// 调起相机：触发隐藏的 input，浏览器会自动弹出相机
function openCamera() {
  document.getElementById('cameraInput').click();
}

// 调起相册
function openAlbum() {
  document.getElementById('albumInput').click();
}

// ===== 用户选完图后触发（onchange 在 HTML 里绑） =====
function onFileChosen(event) {
  const file = event.target.files[0];   // 拿到选中的图片文件
  if (!file) return;

  currentPhoto = file;
  // 用本地临时 URL 显示预览（不需要上传，浏览器自己能显示本地文件）
  document.getElementById('previewImg').src = URL.createObjectURL(file);
  document.getElementById('preview').classList.remove('hidden');

  event.target.value = '';  // 清空 input，否则连选两次同一张图不触发 onchange
}

// 预览页：返回首页
function backHome() {
  document.getElementById('preview').classList.add('hidden');
  renderCategories();
}

// 预览页：确认（存储功能下一个任务才做，这里先占位）
function confirmPhoto() {
  console.log('已确认：', currentCategory, currentPhoto);
  backHome();
}
