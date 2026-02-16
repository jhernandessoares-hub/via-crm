export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar escura */}
      <aside className="w-64 bg-slate-950 text-slate-100 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="text-lg font-semibold tracking-wide">VIA CRM</div>
          <div className="text-xs text-slate-400 mt-1">
            Multiempresa • Leads • IA
          </div>
        </div>

        <nav className="p-3 space-y-1">
          <a
            href="/leads"
            className="block rounded-md px-3 py-2 text-sm hover:bg-slate-900"
          >
            Leads
          </a>

          <a
            href="/users"
            className="block rounded-md px-3 py-2 text-sm hover:bg-slate-900"
          >
            Usuários
          </a>
        </nav>

        <div className="mt-auto p-3 border-t border-slate-800">
          <a
            href="/"
            className="block rounded-md px-3 py-2 text-sm hover:bg-slate-900"
          >
            Sair
          </a>
        </div>
      </aside>

      {/* Área clara */}
      <div className="flex-1 flex flex-col">
        {/* Topbar clara */}
        <header className="h-14 bg-white border-b flex items-center px-6">
          <div className="text-sm text-gray-600">
            Área de trabalho — <span className="text-gray-900">VIA CRM</span>
          </div>

          <div className="ml-auto">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
