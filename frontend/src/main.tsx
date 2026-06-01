import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './freddie-theme.css';
import './freddie-overrides.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 未找到，检查 index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
