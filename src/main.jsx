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
import AdminLayoutNew from './components/admin/AdminLayoutNew.jsx';
import DashboardNew from './components/admin/DashboardNew.jsx';
import UserManagementNew from './components/admin/UserManagementNew.jsx';
import CreditAnalyticsNew from './components/admin/CreditAnalyticsNew.jsx';
import SearchAnalyticsNew from './components/admin/SearchAnalyticsNew.jsx';
import AccessControlNew from './components/admin/AccessControlNew.jsx';
import SystemLogsNew from './components/admin/SystemLogsNew.jsx';
import SettingsNew from './components/admin/SettingsNew.jsx';
import MyLists from './components/MyLists.jsx';
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
            
            {/* My Lists page */}
            <Route 
              path="/my-lists" 
              element={
                <ProtectedRoute>
                  <MyLists />
                </ProtectedRoute>
              } 
            />
            
            {/* Admin routes */}
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminLayoutNew />
                </AdminRoute>
              }
            >
              <Route index element={<DashboardNew />} />
              <Route path="users" element={<UserManagementNew />} />
              <Route path="credits" element={<CreditAnalyticsNew />} />
              <Route path="access" element={<AccessControlNew />} />
              <Route path="analytics" element={<SearchAnalyticsNew />} />
              <Route path="logs" element={<SystemLogsNew />} />
              <Route path="settings" element={<SettingsNew />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </AdminAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
