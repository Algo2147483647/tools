import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, readTheme } from './theme';
import './themes.css';
import './styles.css';
import './floating.css';
import './workspaceTools.css';
import './toolbar.css';

applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
