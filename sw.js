// ========== Service Worker：离线功能的核心 ==========
// 它是个"后台代理"：网页发请求时先问它，它说"我这儿有缓存"就直接给缓存
// 效果：断网也能打开页面（骨架阶段先缓存文件本身，以后衣服图片也走这条路）

const CACHE = 'closet-v1';  // 缓存的名字，以后更新版本就改 v2、v3

// 安装时要缓存的文件清单（都是本项目的文件）
const FILES = ['.', 'index.html', 'app.js', 'style.css', 'manifest.json', 'icon.png'];

// install 事件：SW 安装时触发，把文件全部下载进缓存
self.addEventListener('install', e => {
  // waitUntil()：告诉浏览器"等我缓存完再算安装成功"
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
});

// fetch 事件：网页每次请求资源都会触发
self.addEventListener('fetch', e => {
  // 策略：缓存优先。先查缓存，命中就返回缓存；没有才走网络
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
