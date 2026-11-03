export default function SiteLoading() {
  return <main className="route-loading" aria-live="polite" aria-busy="true">
    <div className="route-loading-header" />
    <p>Carregando os achados…</p>
  </main>;
}
