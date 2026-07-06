import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// 注册 Service Worker
// 注意：路径必须使用相对路径 `./sw.js`，不能用绝对路径 `/sw.js`。
// 原因：本项目常被部署到 GitHub Pages 子路径下（例如
//   https://<user>.github.io/<repo>/ ），绝对路径会解析为根域名下的
//   https://<user>.github.io/sw.js → 404，导致 SW 注册失败且持续在
//   console 报错。相对路径 `./sw.js` 会以当前 document URL 所在目录
//   为基准解析，在子路径部署时能正确指向
//   https://<user>.github.io/<repo>/sw.js。
// 同理 SW 的 scope 也是相对路径，仅控制当前目录及子路径下的页面缓存。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure index.html contains <div id="root"></div>.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
