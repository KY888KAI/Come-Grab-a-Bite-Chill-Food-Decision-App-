import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css' // 這裡引用了上面的 css

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
