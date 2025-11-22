/**
 * Main Entry Point for React Application
 * This file initializes and renders the React app into the DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

/**
 * Create root element and render the application
 * React 18+ uses createRoot API for better concurrent features
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
