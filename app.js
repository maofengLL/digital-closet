// ========== IndexedDB：浏览器自带的"本地数据库" ==========
// 特点：数据存在手机/电脑本地，关网页、断网都不会丢
// 结构：数据库(closet-db) -> 表(notes) -> 记录(每条有 id 和 text)

let db;  // 全局变量：装打开后的数据库

// open(名字, 版本号)：请求打开数据库
const req = indexedDB.open('closet-db', 1);

// 第一次打开（或版本升级）时触发：在这里建表
req.onupgradeneeded = e => {
  db = e.target.result;  // e.target 就是这个数据库
  // 建表 notes：keyPath 是主键，autoIncrement 表示 id 自动递增（1,2,3...）
  db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
};

// 打开成功：存好数据库，然后加载历史记录
req.onsuccess = e => { db = e.target.result; loadNotes(); };

// 打开失败：给提示
req.onerror = () => alert('数据库打开失败，请换 Chrome 浏览器');

// ========== 存记录 ==========
function saveNote() {
  const input = document.getElementById('note');
  const text = input.value.trim();   // trim()：去掉首尾空格
  if (!text) return;                 // 空内容不存

  // transaction(表名, 'readwrite')：开一次"读写事务"
  const tx = db.transaction('notes', 'readwrite');
  // add()：插入一条新记录，内容是文字+时间戳
  tx.objectStore('notes').add({ text: text, time: Date.now() });

  // 事务完成：清空输入框，刷新列表
  tx.oncomplete = () => { input.value = ''; loadNotes(); };
}

// ========== 读记录（每次新增后刷新界面） ==========
function loadNotes() {
  const out = document.getElementById('list');
  out.innerHTML = '';  // 清空列表，准备重画

  // 开"只读事务"，拿到表
  const store = db.transaction('notes', 'readonly').objectStore('notes');

  // openCursor()：游标，一条一条遍历记录（IndexedDB 的标准姿势）
  store.openCursor().onsuccess = e => {
    const cur = e.target.result;   // 当前这条
    if (cur) {
      // 造一个 <li>，塞进文字，挂到列表里
      const li = document.createElement('li');
      li.textContent = cur.value.text;
      out.appendChild(li);
      cur.continue();  // 游标移到下一条，直到没有（if 不成立）为止
    }
  };
}
