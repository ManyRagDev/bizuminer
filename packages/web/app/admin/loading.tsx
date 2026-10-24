export default function AdminLoading() {
  return (
    <main className="route-loading route-loading-admin" aria-live="polite" aria-busy="true">
      <div className="route-loading-header" />
      <div className="route-loading-admin-body">
        <aside />
        <section><span /><strong /><div /><div /><div /></section>
      </div>
      <span className="sr-only">Carregando painel…</span>
    </main>
  );
}
