import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 注意：不使用 StrictMode —— drawio 编辑器以 iframe 形式挂载，
// StrictMode 的 effect 双调用会导致编辑器重复初始化，因此显式关闭。
createRoot(document.getElementById('root')!).render(<App />)
