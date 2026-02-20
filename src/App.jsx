// Lead Finder — App (Phase 6: sidebar layout)
import { useAuth } from './contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import SearchPanel from './components/SearchPanel';

const App = () => {
  const { currentUser } = useAuth();

  if (!currentUser) return <Navigate to="/login" replace />;

  return <SearchPanel />;
};

export default App;
