import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import TeacherRegister from './pages/TeacherRegister';
import TeacherLogin from './pages/TeacherLogin';
import ForgotLoginCode from './pages/ForgotLoginCode';
import TeacherDashboard from './pages/TeacherDashboard';
import AttendanceSession from './pages/AttendanceSession';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/teacher/register" element={<TeacherRegister />} />
          <Route path="/teacher/login" element={<TeacherLogin />} />
          <Route path="/teacher/forgot-code" element={<ForgotLoginCode />} />
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/teacher/session/:sessionId" element={<AttendanceSession />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
