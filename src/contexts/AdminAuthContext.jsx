import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const AdminAuthContext = createContext();

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
};

export const AdminAuthProvider = ({ children }) => {
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Check if user is admin
        try {
          const adminDocRef = doc(db, 'adminUsers', user.email);
          const adminDoc = await getDoc(adminDocRef);
          
          if (adminDoc.exists()) {
            setAdminUser(user);
            setAdminRole(adminDoc.data().role);
          } else {
            setAdminUser(null);
            setAdminRole(null);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          setAdminUser(null);
          setAdminRole(null);
        }
      } else {
        setAdminUser(null);
        setAdminRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    adminUser,
    adminRole,
    loading,
    isAdmin: !!adminUser,
    isSuperAdmin: adminRole === 'super_admin',
    canManageUsers: adminRole === 'super_admin' || adminRole === 'admin',
    canViewOnly: adminRole === 'viewer'
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};
