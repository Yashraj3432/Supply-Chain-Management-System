import { useEffect, useState } from "react";
import api, { downloadCsv, errorMessage } from "../api/client";
import BarChart from "../components/BarChart";
import Icon from "../components/Icon";
import { ErrorBanner, Loading, PageHeader, StatCard } from "../components/ui";
import { useLookup } from "../hooks";
import { compactMoney, daysAgo, money, qty, today } from "../utils";

const TABS = [
  ["valuation", "Stock valuation"],
  ["consumption", "Consumption"],
  ["purchases", "Purchases & suppliers"],
  ["movement", "Stock movement"],
];

export default function Reports() {
  const [tab, setTab] = useState("valuation");
  const [range, setRange] = useState({ start: daysAgo(30), end: today() });
  const [category, setCategory] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const categories = useLookup("/categories/");

  const endpoint = { valuation: "stock-valuation", consumption: "consumption", purchases: "purchases", movement: "movement" }[tab];
  const params = tab === "valuation" ? { category } : { ...range, ...(tab === "movement" ? { only_moved: "true" } : {}) };
  const paramKey = JSON.stringify(params);

  useEffect(() => {
    setData(null);
    setError("");
    api
      .get(`/reports/${endpoint}/`, { params: JSON.parse(paramKey) })
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [endpoint, paramKey]);

  const exportCsv = () => downloadCsv(`/reports/${endpoint}/`, params, `${endpoint}-${today()}.csv`).catch((e) => setError(errorMessage(e)));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Valuation, consumption, purchasing and movement analysis"
        actions={
          <button className="btn" onClick={exportCsv}>
            <Icon name="download" /> Export CSV
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <div className="tabs">
            {TABS.map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === "valuation" ? (
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="toolbar-group">
              <label className="inline-field">
                From <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
              </label>
              <label className="inline-field">
                To <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
              </label>
              {[30, 90, 180].map((d) => (
                <button key={d} className="btn btn-sm" onClick={() => setRange({ start: daysAgo(d), end: today() })}>
                  {d}d
                </button>
              ))}
            </div>
          )}
        </div>
        <ErrorBanner message={error} />
        {!data && !error && <Loading />}
        {data && tab === "valuation" && <Valuation data={data} />}
        {data && tab === "consumption" && <ConsumptionRpt data={data} />}
        {data && tab === "purchases" && <Purchases data={data} />}
        {data && tab === "movement" && <Movement data={data} />}
      </div>
    </>
  );
}

function Valuation({ data }) {
  const max = Math.max(1, ...data.by_category.map((c) => Number(c.value)));
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Total stock value" value={money(data.total_value)} />
        <StatCard label="Items" value={data.items.length} />
        <StatCard label="Low-stock items" value={data.items.filter((i) => i.is_low_stock).length} tone="warning" />
      </div>
      <h3 className="section-title">By category</h3>
      <div className="hbars">
        {data.by_category.map((c) => (
          <div key={c.id} className="hbar-row">
            <span className="hbar-label">{c.name}</span>
            <div className="hbar-track">
              <div className="hbar-fill" style={{ width: `${(Number(c.value) / max) * 100}%` }} />
            </div>
            <span className="num">{compactMoney(c.value)}</span>
          </div>
        ))}
      </div>
      <h3 className="section-title">Items</h3>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th>Category</th>
              <th className="num">On hand</th>
              <th className="num">Unit cost</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id}>
                <td className="strong">{i.sku}</td>
                <td>{i.name}</td>
                <td>{i.category}</td>
                <td className={`num ${i.is_low_stock ? "text-warning" : ""}`}>
                  {qty(i.quantity_on_hand)} {i.unit}
                </td>
                <td className="num">{money(i.unit_cost)}</td>
                <td className="num strong">{money(i.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ConsumptionRpt({ data }) {
  const max = Math.max(1, ...data.by_department.map((d) => Number(d.cost)));
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Total consumption cost" value={money(data.total_cost)} />
        <StatCard label="Items consumed" value={data.by_item.length} />
        <StatCard label="Entries" value={data.by_item.reduce((s, i) => s + i.entries, 0)} />
      </div>
      <h3 className="section-title">By department</h3>
      <div className="hbars">
        {data.by_department.map((d) => (
          <div key={d.department} className="hbar-row">
            <span className="hbar-label">{d.department}</span>
            <div className="hbar-track">
              <div className="hbar-fill fill-alt" style={{ width: `${(Number(d.cost) / max) * 100}%` }} />
            </div>
            <span className="num">{compactMoney(d.cost)}</span>
          </div>
        ))}
        {!data.by_department.length && <p className="muted">No consumption in this period.</p>}
      </div>
      <h3 className="section-title">By item</h3>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th className="num">Quantity</th>
              <th className="num">Entries</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.by_item.map((i) => (
              <tr key={i.item}>
                <td className="strong">{i.sku}</td>
                <td>{i.name}</td>
                <td className="num">
                  {qty(i.quantity)} {i.unit}
                </td>
                <td className="num">{i.entries}</td>
                <td className="num strong">{money(i.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Purchases({ data }) {
  const chart = data.by_month.map((m) => ({
    label: new Date(`${m.month}-01`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    values: { spend: m.spend },
  }));
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Total spend" value={money(data.total_spend)} />
        <StatCard label="Suppliers used" value={data.by_supplier.length} />
        <StatCard label="Orders" value={data.by_supplier.reduce((s, r) => s + r.order_count, 0)} />
      </div>
      <h3 className="section-title">Monthly spend</h3>
      <BarChart data={chart} series={[{ key: "spend", label: "Spend", className: "series-1" }]} height={200} />
      <h3 className="section-title">Supplier performance</h3>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Supplier</th>
              <th className="num">Orders</th>
              <th className="num">Spend</th>
              <th className="num">Received</th>
              <th className="num">On-time delivery</th>
            </tr>
          </thead>
          <tbody>
            {data.by_supplier.map((s) => (
              <tr key={s.supplier}>
                <td className="strong">{s.name}</td>
                <td className="num">{s.order_count}</td>
                <td className="num">{money(s.spend)}</td>
                <td className="num">{s.received_orders}</td>
                <td className="num">
                  {s.on_time_rate === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className={s.on_time_rate >= 90 ? "text-success" : s.on_time_rate >= 70 ? "text-warning" : "text-danger"}>
                      {s.on_time_rate}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Movement({ data }) {
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item</th>
            <th className="num">Opening</th>
            <th className="num">In</th>
            <th className="num">Out</th>
            <th className="num">Closing</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                No stock movement in this period.
              </td>
            </tr>
          )}
          {data.items.map((i) => (
            <tr key={i.item}>
              <td className="strong">{i.sku}</td>
              <td>{i.name}</td>
              <td className="num">{qty(i.opening)}</td>
              <td className="num text-success">{Number(i.inbound) ? `+${qty(i.inbound)}` : "—"}</td>
              <td className="num text-danger">{Number(i.outbound) ? `−${qty(i.outbound)}` : "—"}</td>
              <td className="num strong">
                {qty(i.closing)} <span className="muted small">{i.unit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
