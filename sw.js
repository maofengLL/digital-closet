// 开发阶段专用：关闭缓存，改完代码刷新就能看到新版
// 阶段一收尾时会换回缓存版（恢复离线功能）

// 安装后立刻激活，不等旧版本
self.addEventListener('install', () => self.skipWaiting());

// 激活时：删掉所有旧缓存（v1、v2 一锅端），并立即接管所有页面
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 所有请求直接走网络，不做任何缓存
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
