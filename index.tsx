// Chế độ demo phải chạy TRƯỚC mọi module khác (chuyển hướng lưu trữ + Firebase giả)
import { prepareDemo } from './services/demoBoot';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

import { initAppStorage } from './services/appStorage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Khởi tạo và nạp dữ liệu IndexedDB vào bộ nhớ trước khi mount ứng dụng
prepareDemo().catch(() => {}).then(() => initAppStorage()).finally(() => {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
});