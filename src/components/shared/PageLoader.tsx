export default function PageLoader({ label = '正在載入資料...' }: { label?: string }) {
  return (
    <div className="loading-container">
      <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
      <div className="loading-pulse">{label}</div>
    </div>
  );
}
