import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './session.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Setup from './pages/Setup.jsx';
import Home from './pages/Home.jsx';
import Record from './pages/Record.jsx';
import Records from './pages/Records.jsx';

export default function App() {
  const { loading, user, business, connectError, retry } = useSession();

  if (loading) {
    return <div className="center-screen" role="status">Loading…</div>;
  }
  if (connectError && !user) {
    return (
      <div className="center-screen">
        <p>{connectError}</p>
        <button className="btn btn-primary" onClick={retry}>Try again</button>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!business) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/record/:kind" element={<Record />} />
      <Route path="/records" element={<Records />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
