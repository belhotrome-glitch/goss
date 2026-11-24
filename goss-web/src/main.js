import React from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from './pages/LandingPage.js';

createRoot(document.getElementById('root')).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(LandingPage),
  ),
);
