import { ProgressBar } from "@/components/ui/ProgressBar";

export function ProgressHeader({ completed, total }: { completed: number; total: number }) {
  return (
    <div style={{ padding: "8px 0 16px" }}>
      <ProgressBar value={completed} total={total} />
    </div>
  );
}
