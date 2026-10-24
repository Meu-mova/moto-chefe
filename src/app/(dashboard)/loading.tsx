export default function PageLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="h-4 w-72 bg-muted rounded" />
      <div className="bg-card border rounded-lg h-96 mt-4" />
    </div>
  )
}
