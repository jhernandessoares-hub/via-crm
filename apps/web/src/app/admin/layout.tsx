"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/saude", label: "Saúde do Sistema" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<any>(null);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    const token = localStorage.getItem("adminToken");
    const user = localStorage.getItem("adminUser");
    if (!token) { router.push("/admin/login"); return; }
    if (user) setAdmin(JSON.parse(user));
  }, [pathname, router]);

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-900 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <div className="text-xs text-slate-400 uppercase tracking-widest">VIA CRM</div>
          <div className="text-sm font-semibold mt-0.5">Admin</div>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href) && item.href !== "/admin";
            return (
              <Link key={item.href} href={item.href}
                className={`block px-3 py-2 rounded-md text-sm ${active ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800"}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700 text-xs text-slate-400">
          <div>{admin?.nome || "Admin"}</div>
          <button onClick={() => { localStorage.removeItem("adminToken"); localStorage.removeItem("adminUser"); router.push("/admin/login"); }}
            className="mt-1 text-slate-500 hover:text-white">Sair</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
