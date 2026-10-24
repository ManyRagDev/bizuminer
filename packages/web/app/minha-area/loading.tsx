export default function MemberAreaLoading() {
  return (
    <main className="route-loading route-loading-member" aria-live="polite" aria-busy="true">
      <div className="route-loading-header" />
      <section><span /><strong /><p /><p className="short" /></section>
      <span className="sr-only">Carregando sua área…</span>
    </main>
  );
}
