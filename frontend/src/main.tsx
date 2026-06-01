import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProjectLanding } from './components/ProjectLanding';
import { TeacherPortal } from './components/TeacherPortal';
import './freddie-theme.css';
import './freddie-overrides.css';
import './vercel-mesh.css';

function RootRouter() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const route = useMemo(() => hash.replace(/^#/, '') || '/', [hash]);

  if (route.startsWith('/student')) return <App />;
  if (route.startsWith('/teacher')) return <TeacherPortal />;
  return <ProjectLanding />;
}

const container = document.getElementById('root');
if (!container) throw new Error('#root 未找到，检查 index.html');

createRoot(container).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
);
