import { money } from './format';
import { useT } from './i18n.jsx';

// A labelled progress bar: "Sales GHS 1,500 of 6,000 (25%)". Going over turns it amber (budgets).
export default function Progress({ label, value, target, budget = false }) {
  const v = Number(value || 0);
  const tgt = Number(target || 0);
  const pct = tgt > 0 ? Math.round((v / tgt) * 100) : 0;
  const warn = budget ? pct >= 90 : false;
  const { tt } = useT();
  return (
    <div className="progress-line">
      <div className="statement-row small">
        <span>{label}</span>
        <span className={warn ? 'warn-text strong' : 'muted'}>{tt('GHS {value} of {target} ({pct}%)', { value: money(v), target: money(tgt), pct })}</span>
      </div>
      <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)}>
        <div className={warn ? 'bar-low' : undefined} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
