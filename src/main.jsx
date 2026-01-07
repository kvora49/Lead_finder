/**
 * Main Entry Point for React Application
 * This file initializes and renders the React app into the DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.jsx';
import Login from './components/Login.jsx';
import Register from './components/Register.jsx';
import ForgotPassword from './components/ForgotPassword.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/admin/AdminRoute.jsx';
import AdminLayout from './components/admin/AdminLayout.jsx';
import AdminDashboard from './components/admin/Dashboard.jsx';
import UserManagement from './components/admin/UserManagement.jsx';
import CreditAnalytics from './components/admin/CreditAnalytics.jsx';
import SearchAnalytics from './components/admin/SearchAnalytics.jsx';
import AccessControl from './components/admin/AccessControl.jsx';
import SystemLogs from './components/admin/SystemLogs.jsx';
import Settings from './components/admin/Settings.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { AdminAuthProvider } from './contexts/AdminAuthContext.jsx';
import './index.css';

/**
 * Create root element and render the application
 * React 18+ uses createRoot API for better concurrent features
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminAuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            
            {/* Protected user routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <App />
                </ProtectedRoute>
              } 
            />
            
            {/* Admin routes */}
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="credits" element={<CreditAnalytics />} />
              <Route path="access" element={<AccessControl />} />
              <Route path="analytics" element={<SearchAnalytics />} />
              <Route path="logs" element={<SystemLogs />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </AdminAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
