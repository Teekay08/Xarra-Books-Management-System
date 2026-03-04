export function Dashboard() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Xarra Books Management System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Titles', value: '—', color: 'bg-blue-50 text-blue-700' },
          { label: 'Active Authors', value: '—', color: 'bg-green-50 text-green-700' },
          { label: 'Open Consignments', value: '—', color: 'bg-amber-50 text-amber-700' },
          { label: 'Outstanding Invoices', value: '—', color: 'bg-red-50 text-red-700' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-lg p-6 ${stat.color}`}>
            <p className="text-sm font-medium opacity-80">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-400">
        <p className="text-lg font-medium">System is ready</p>
        <p className="text-sm mt-2">Start by adding authors and titles in the sidebar.</p>
      </div>
    </div>
  );
}
