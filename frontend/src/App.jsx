import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { AuthProvider } from './context/AuthContext';
import { AdminRoute, ManagerRoute, ManagerGuestRoute } from './components/ProtectedRoute';

import Home from './pages/Home';
import ManagerForm from './pages/ManagerForm';
import NewRequests from './pages/NewRequests';
import Directory from './pages/Directory';
import TemplateManagement from './pages/TemplateLibrary';
import EmailAccounts from './pages/EmailAccounts';
import EmailQueue from './pages/EmailQueue';
import AdminLogin from './pages/AdminLogin';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<ManagerGuestRoute />}>
            <Route path="/submit/signup" element={<Signup />} />
          </Route>

          {/* Legacy paths → canonical manager auth URL */}
          <Route path="/submit/login" element={<Navigate to="/submit/signup" replace />} />
          <Route path="/login" element={<Navigate to="/submit/signup" replace />} />
          <Route path="/signup" element={<Navigate to="/submit/signup" replace />} />

          <Route element={<ManagerRoute />}>
            <Route path="/submit" element={<ManagerForm />} />
          </Route>

          <Route element={<AdminRoute />}>
            <Route
              path="/"
              element={
                <AppLayout>
                  <Home />
                </AppLayout>
              }
            />
            <Route
              path="/new-requests"
              element={
                <AppLayout>
                  <NewRequests />
                </AppLayout>
              }
            />
            <Route
              path="/directory"
              element={
                <AppLayout>
                  <Directory />
                </AppLayout>
              }
            />
            <Route
              path="/templates"
              element={
                <AppLayout>
                  <TemplateManagement />
                </AppLayout>
              }
            />
            <Route
              path="/email-responses"
              element={
                <AppLayout>
                  <EmailQueue />
                </AppLayout>
              }
            />
            <Route
              path="/email-accounts"
              element={
                <AppLayout>
                  <EmailAccounts />
                </AppLayout>
              }
            />
          </Route>

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
