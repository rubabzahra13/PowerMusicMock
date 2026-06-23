import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-[var(--color-surface-bg)] text-[var(--color-text-primary)] antialiased font-sans">
      {/* Persistent Left Sidebar */}
      <Sidebar />

      {/* Main Layout Container (Offset by Sidebar width) */}
      <div className="ml-[240px] flex flex-col min-h-screen">
        {/* Top Header Bar */}
        <TopBar title={title} />

        {/* Main Content Area */}
        <main className="flex-1 p-6 bg-[var(--color-surface-bg)] min-h-[calc(100vh-56px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
