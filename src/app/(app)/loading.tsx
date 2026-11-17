export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ width: 220, height: 28, marginBottom: 16 }} />
      <div className="grid grid-2"><div className="skeleton" style={{ height: 180 }} /><div className="skeleton" style={{ height: 180 }} /></div>
      <div className="skeleton" style={{ height: 120, marginTop: 16 }} />
    </div>
  );
}
