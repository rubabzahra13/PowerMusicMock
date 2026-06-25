import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';

import Home from './pages/Home';
import ManagerForm from './pages/ManagerForm';
import NewRequests from './pages/NewRequests';
import UserLedger from './pages/UserLedger';
import TemplateManagement from './pages/TemplateLibrary';
import GmailAccounts from './pages/GmailAccounts';
import EmailQueue from './pages/EmailQueue';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin Dashboard Routes (Wrapped in AppLayout) */}
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
          path="/user-ledger"
          element={
            <AppLayout>
              <UserLedger />
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
          path="/gmail-accounts"
          element={
            <AppLayout>
              <GmailAccounts />
            </AppLayout>
          }
        />

        {/* Public Routes (No Layout Wrapper) */}
        <Route path="/submit" element={<ManagerForm />} />
      </Routes>
    </BrowserRouter>
  );
}
