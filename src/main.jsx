import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Catch any render-time error so a single bug shows a recoverable screen
// instead of a blank white page for HR users.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[app] render error:', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32, boxShadow: '0 10px 30px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }}>ระบบขัดข้องชั่วคราว</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>เกิดข้อผิดพลาดที่ไม่คาดคิด · ข้อมูลของคุณยังปลอดภัย ลองโหลดหน้าใหม่อีกครั้ง</p>
          <button onClick={() => location.reload()} style={{ background: '#0f172a', color: '#fff', border: 0, padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>โหลดหน้าใหม่</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
