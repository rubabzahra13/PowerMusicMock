import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';

import Home from './pages/Home';
import ManagerForm from './pages/ManagerForm';
import NewRequests from './pages/NewRequests';
import UserLedger from './pages/UserLedger';
import TemplateManagement from './pages/TemplateLibrary';
import GmailAccounts from './pages/GmailAccounts';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin Dashboard Routes (Wrapped in AppLayout) */}
        <Route
          path="/"
          element={
            <AppLayout title="Home">
              <Home />
            </AppLayout>
          }
        />
        <Route
          path="/new-requests"
          element={
            <AppLayout title="New Requests">
              <NewRequests />
            </AppLayout>
          }
        />

        <Route
          path="/user-ledger"
          element={
            <AppLayout title="User Ledger">
              <UserLedger />
            </AppLayout>
          }
        />
        <Route
          path="/templates"
          element={
            <AppLayout title="Template Management">
              <TemplateManagement />
            </AppLayout>
          }
        />
        <Route
          path="/gmail-accounts"
          element={
            <AppLayout title="Gmail Accounts">
              <GmailAccounts />
            </AppLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <AppLayout title="Settings">
              <div className="bg-white p-6 rounded-lg border border-[var(--color-border-default)] shadow-sm">
                Settings — coming soon
              </div>
            </AppLayout>
          }
        />
        <Route
          path="/future-pilots"
          element={
            <AppLayout title="Future Pilots">
              <div className="bg-white p-6 rounded-lg border border-[var(--color-border-default)] shadow-sm">
                Future Pilots — coming soon
              </div>
            </AppLayout>
          }
        />

        {/* Public Routes (No Layout Wrapper) */}
        <Route path="/submit" element={<ManagerForm />} />
      </Routes>
    </BrowserRouter>
  );
}
