import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProjectLanding, RoleEntryPage, type EntryRole } from './components/ProjectLanding';
import { TeacherPortal } from './components/TeacherPortal';
import './freddie-theme.css';
import './freddie-overrides.css';
import './vercel-mesh.css';

const ROLE_STORAGE_KEY = 'eduresource-role';

function RootRouter() {
  const [route, setRoute] = useState(() => readRoute());
  const [role, setRole] = useState<EntryRole | null>(() => readRole());

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  useEffect(() => {
    const handleRouteClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[data-app-route]') : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      event.preventDefault();
      navigateTo(href, setRoute);
    };
    window.addEventListener('click', handleRouteClick);
    return () => window.removeEventListener('click', handleRouteClick);
  }, []);
  const registerRole = useMemo<EntryRole | null>(() => {
    if (route === '/register/teacher') return 'teacher';
    if (route === '/register/student') return 'student';
    return null;
  }, [route]);

  const handleSelectRole = (nextRole: EntryRole) => {
    writeRole(nextRole);
    setRole(nextRole);
    navigateTo(nextRole === 'teacher' ? '/teacher' : '/student/exploration', setRoute);
  };

  useEffect(() => {
    if (registerRole) {
      handleSelectRole(registerRole);
    }
  }, [registerRole]);

  if (route.startsWith('/student')) {
    return <App />;
  }
  if (route.startsWith('/teacher')) {
    return <TeacherPortal />;
  }
  if (route === '/register') return <RoleEntryPage currentRole={role} onSelect={handleSelectRole} />;
  if (route.startsWith('/register/')) return <RoleEntryPage currentRole={role} presetRole={registerRole} onSelect={handleSelectRole} />;
  if (route === '/' && role === 'teacher') return <TeacherPortal />;
  if (route === '/' && role === 'student') return <App />;
  if (route === '/') return <RoleEntryPage currentRole={role} onSelect={handleSelectRole} />;
  if (route.startsWith('/landing')) return <ProjectLanding />;
  return <ProjectLanding />;
}

function readRole(): EntryRole | null {
  try {
    const value = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return value === 'teacher' || value === 'student' ? value : null;
  } catch {
    return null;
  }
}

function readRoute(): string {
  const hashRoute = window.location.hash.replace(/^#/, '');
  if (hashRoute) return normalizeRoute(hashRoute);
  return normalizeRoute(window.location.pathname);
}

function normalizeRoute(value: string): string {
  const route = value.trim() || '/';
  return route.startsWith('/') ? route : `/${route}`;
}

function navigateTo(nextRoute: string, setRoute: (route: string) => void) {
  const route = normalizeRoute(nextRoute);
  window.history.pushState(null, '', `/#${route}`);
  setRoute(route);
}

function writeRole(role: EntryRole) {
  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, role);
  } catch {
    // Ignore storage failures and keep routing usable.
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('#root 未找到，检查 index.html');

createRoot(container).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
);
