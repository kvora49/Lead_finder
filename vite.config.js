import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
          ],
          'vendor-charts': ['recharts'],
          'vendor-csv': ['papaparse'],
          'vendor-motion': ['framer-motion'],
          admin: [
            './src/components/admin/AdminLayoutNew.jsx',
            './src/components/admin/DashboardNew.jsx',
            './src/components/admin/UserManagementNew.jsx',
            './src/components/admin/CreditAnalyticsNew.jsx',
            './src/components/admin/SearchAnalyticsNew.jsx',
            './src/components/admin/SystemLogsNew.jsx',
            './src/components/admin/AccessControlNew.jsx',
            './src/components/admin/SettingsNew.jsx',
          ],
        },
      },
    },
  },
});
