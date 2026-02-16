export default function LeadsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
        <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
          Novo Lead
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm text-gray-600">
          Próximo passo: listar leads reais do backend aqui.
        </p>
      </div>
    </div>
  );
}
