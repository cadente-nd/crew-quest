export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ height: 10, borderRadius: 999, background: "#EEE", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#FF6B9D,#FFC371)" }} />
      </div>
      <p style={{ fontSize: 13, color: "#888", marginTop: 6 }}>You&apos;ve completed {value} / {total} topics</p>
    </div>
  );
}
