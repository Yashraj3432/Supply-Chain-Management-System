import Icon from "./Icon";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <label className="search-box">
      <Icon name="search" size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function StatusBadge({ status, label }) {
  return <span className={`badge badge-${status}`}>{label || status}</span>;
}

export function StockBadge({ item }) {
  if (Number(item.quantity_on_hand) <= 0) return <span className="badge badge-danger">Out of stock</span>;
  if (item.is_low_stock) return <span className="badge badge-warning">Low stock</span>;
  return <span className="badge badge-success">In stock</span>;
}

export function Empty({ message = "Nothing to show yet.", colSpan }) {
  if (colSpan)
    return (
      <tr>
        <td colSpan={colSpan} className="empty">
          {message}
        </td>
      </tr>
    );
  return <div className="empty">{message}</div>;
}

export function Loading({ colSpan }) {
  if (colSpan)
    return (
      <tr>
        <td colSpan={colSpan} className="empty">
          <span className="spinner" /> Loading…
        </td>
      </tr>
    );
  return (
    <div className="empty">
      <span className="spinner" /> Loading…
    </div>
  );
}

export function Pagination({ page, count, pageSize = 20, onPage }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return <div className="pagination muted">{count} record{count === 1 ? "" : "s"}</div>;
  return (
    <div className="pagination">
      <span className="muted">
        Page {page} of {pages} · {count} records
      </span>
      <div className="btn-group">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint, full = false }) {
  return (
    <label className={`field ${full ? "field-full" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="alert-banner" role="alert">
      <Icon name="alert" size={16} /> {message}
    </div>
  );
}

export function StatCard({ label, value, tone = "default", hint, icon }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className="stat-icon">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
