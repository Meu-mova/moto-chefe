export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-slate-200 rounded" />
          <div className="h-4 w-56 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-64 bg-slate-100 rounded" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border rounded-lg p-4 space-y-2">
            <div className="h-3 w-24 bg-slate-100 rounded" />
            <div className="h-7 w-20 bg-slate-200 rounded" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg h-64" />
        <div className="bg-white border rounded-lg h-64" />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg h-48" />
        <div className="bg-white border rounded-lg h-48" />
      </div>
    </div>
  )
}
