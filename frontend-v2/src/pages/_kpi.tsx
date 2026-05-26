// KPI tile — small headline metric used by Alerts/Watchlist page tops.

export interface KPIProps {
  label: string;
  value: string;
  tone?: 'cyan' | 'amber' | 'green' | 'red' | 'violet';
}

export function KPI({ label, value, tone = 'cyan' }: KPIProps) {
  return (
    <div className="pxl pxl-raised" style={{ padding: 12 }}>
      <div className="font-display t-xs faint">{label}</div>
      <div
        className="font-mono"
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: `var(--${tone})`,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
