export default function DealLoading() {
  return (
    <main className="route-loading" aria-live="polite" aria-busy="true">
      <div className="route-loading-header" />
      <div className="route-loading-deal">
        <div className="route-loading-image" />
        <div className="route-loading-copy">
          <span /><strong /><strong className="short" /><p /><p className="short" />
        </div>
      </div>
      <span className="sr-only">Carregando oferta…</span>
    </main>
  );
}
