import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { AuthProvider } from './context/AuthContext';
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute';

import Home from './pages/Home';
import ManagerForm from './pages/ManagerForm';
import NewRequests from './pages/NewRequests';
import Directory from './pages/Directory';
import TemplateManagement from './pages/TemplateLibrary';
import EmailAccounts from './pages/EmailAccounts';
import EmailQueue from './pages/EmailQueue';

import AdminLogin from './pages/AdminLogin';
import Login from './pages/Login';
import Signup from './pages/Signup';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Admin Dashboard Routes (Guarded by AdminRoute) */}
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

          {/* Manager Form (Guarded by ProtectedRoute) */}
          <Route element={<ProtectedRoute allowedRoles={['manager']} />}>
            <Route path="/submit" element={<ManagerForm />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
