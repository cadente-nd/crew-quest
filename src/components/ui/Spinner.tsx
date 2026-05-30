export function Spinner() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div
        style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "4px solid #EEE", borderTopColor: "#FF6B9D",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
