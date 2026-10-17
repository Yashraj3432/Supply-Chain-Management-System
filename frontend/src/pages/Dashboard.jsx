import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import BarChart from "../components/BarChart";
import { ErrorBanner, Loading, PageHeader, StatCard } from "../components/ui";
import { compactMoney, dateTime, PO_STATUS_LABELS, qty } from "../utils";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/reports/dashboard/")
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Loading />;
  const t = data.totals;
  const trend = data.movement_trend.map((m) => ({
    label: new Date(`${m.month}-01`).toLocaleDateString("en-IN", { month: "short" }),
    values: { inbound: m.inbound, outbound: m.outbound },
  }));
  const poTotal = Object.values(data.po_status_counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Inventory health and procurement at a glance" />

      <div className="stat-grid">
        <StatCard label="Stock value" value={compactMoney(t.stock_value)} hint={`${t.items} active items`} icon="box" />
        <StatCard
          label="Low-stock items"
          value={t.low_stock_items}
          tone={t.low_stock_items ? "warning" : "default"}
          hint={`${t.out_of_stock_items} out of stock · ${t.open_alerts} open alerts`}
          icon="bell"
        />
        <StatCard
          label="Open purchase orders"
          value={t.open_purchase_orders}
          tone={t.overdue_purchase_orders ? "danger" : "default"}
          hint={`${t.overdue_purchase_orders} overdue`}
          icon="cart"
        />
        <StatCard label="Purchases this month" value={compactMoney(t.purchase_value_this_month)} hint={`${t.suppliers} active suppliers`} icon="truck" />
        <StatCard label="Consumption this month" value={compactMoney(t.consumption_value_this_month)} icon="factory" />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Stock movement value</h2>
            <span className="muted">Last 6 months</span>
          </div>
          <BarChart
            data={trend}
            series={[
              { key: "inbound", label: "Inbound", className: "series-1" },
              { key: "outbound", label: "Outbound", className: "series-2" },
            ]}
          />
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Purchase orders by status</h2>
            <Link to="/purchase-orders">View all</Link>
          </div>
          <div className="status-bars">
            {Object.entries(data.po_status_counts).map(([s, c]) => (
              <div key={s} className="status-bar-row">
                <span className={`badge badge-${s}`}>{PO_STATUS_LABELS[s]}</span>
                <div className="status-bar-track">
                  <div className={`status-bar-fill fill-${s}`} style={{ width: `${(c / poTotal) * 100}%` }} />
                </div>
                <span className="num">{c}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Items needing reorder</h2>
            <Link to="/alerts">Alerts</Link>
          </div>
          <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">On hand</th>
                <th className="num">Reorder at</th>
              </tr>
            </thead>
            <tbody>
              {data.low_stock.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    All items are above their reorder level.
                  </td>
                </tr>
              )}
              {data.low_stock.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link to={`/items/${i.id}`} className="strong">
                      {i.sku}
                    </Link>
                    <div className="muted small">{i.name}</div>
                  </td>
                  <td className={`num ${Number(i.quantity_on_hand) <= 0 ? "text-danger" : "text-warning"}`}>
                    {qty(i.quantity_on_hand)} {i.unit}
                  </td>
                  <td className="num">{qty(i.reorder_level)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Recent stock movements</h2>
            <Link to="/transactions">Ledger</Link>
          </div>
          <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>When</th>
                <th>Item</th>
                <th>Type</th>
                <th className="num">Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="small muted">{dateTime(tx.created_at)}</td>
                  <td className="strong">{tx.sku}</td>
                  <td>
                    <span className={`badge badge-txn-${tx.transaction_type}`}>{tx.type_display}</span>
                  </td>
                  <td className={`num ${Number(tx.quantity) < 0 ? "text-danger" : "text-success"}`}>
                    {Number(tx.quantity) > 0 ? "+" : ""}
                    {qty(tx.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </>
  );
}
