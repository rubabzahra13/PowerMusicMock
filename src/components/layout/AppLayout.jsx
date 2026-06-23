import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-[var(--color-surface-bg)] text-[var(--color-text-primary)] antialiased font-sans">
      <Sidebar />

      <div className="ml-[200px] flex flex-col min-h-screen">
        <main className="flex-1 p-6 bg-[var(--color-surface-bg)] min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
