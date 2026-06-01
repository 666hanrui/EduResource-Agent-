import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CoachWorkbenchPanel } from './components/CoachWorkbenchPanel';
import './freddie-theme.css';
import './freddie-overrides.css';

function RootApp() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <App />
      <button
        onClick={() => setOpen((value) => !value)}
        className="freddie-coach-launcher"
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 50,
          padding: '12px 18px',
          border: '3px solid #241C15',
          borderRadius: 999,
          background: '#FFE01B',
          color: '#241C15',
          boxShadow: '5px 5px 0 #241C15',
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        {open ? '收起 AI 工作台' : '打开 AI 工作台'}
      </button>
      {open && (
        <div
          className="freddie-coach-panel"
          style={{
            position: 'fixed',
            inset: '56px 420px 56px 56px',
            zIndex: 45,
            padding: 18,
            overflow: 'auto',
            border: '4px solid #241C15',
            borderRadius: 28,
            background: '#FFFDF6',
            boxShadow: '10px 10px 0 #241C15',
          }}
        >
          <CoachWorkbenchPanel
            sourcePage="floating-workbench"
            activeTaskId={null}
            knowledgeName="链表"
          />
        </div>
      )}
    </>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root 未找到，检查 index.html');

createRoot(container).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
