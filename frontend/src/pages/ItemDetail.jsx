import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { Empty, ErrorBanner, Loading, PageHeader, Pagination, StatCard, StockBadge } from "../components/ui";
import { useList } from "../hooks";
import { dateTime, money, qty } from "../utils";
import { ItemForm } from "./Items";
import { AdjustmentForm } from "./Transactions";

export default function ItemDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [page, setPage] = useState(1);
  const ledger = useList(`/items/${id}/transactions/`, { page });

  const load = useCallback(() => {
    api
      .get(`/items/${id}/`)
      .then((r) => setItem(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorBanner message={error} />;
  if (!item) return <Loading />;

  const refresh = () => {
    load();
    ledger.reload();
  };

  return (
    <>
      <div className="breadcrumbs">
        <Link to="/items">Inventory</Link> / {item.sku}
      </div>
      <PageHeader
        title={
          <>
            {item.name} <StockBadge item={item} />
          </>
        }
        subtitle={`${item.sku} · ${item.category_name || "Uncategorised"} · ${item.warehouse_name || "No warehouse"}`}
        actions={
          <>
            <button className="btn" onClick={() => setAdjusting(true)}>
              <Icon name="swap" /> Adjust stock
            </button>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <Icon name="edit" /> Edit
            </button>
          </>
        }
      />
      <div className="stat-grid">
        <StatCard
          label="On hand"
          value={`${qty(item.quantity_on_hand)} ${item.unit}`}
          tone={item.is_out_of_stock ? "danger" : item.is_low_stock ? "warning" : "default"}
        />
        <StatCard label="Reorder level" value={qty(item.reorder_level)} hint={`Reorder qty ${qty(item.reorder_quantity)}`} />
        <StatCard label="Unit cost" value={money(item.unit_cost)} />
        <StatCard label="Stock value" value={money(item.stock_value)} />
        <StatCard label="Preferred supplier" value={item.preferred_supplier_name || "—"} />
      </div>
      {item.description && <p className="card">{item.description}</p>}
      <section className="card">
        <div className="card-header">
          <h2>Stock ledger</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th className="num">Change</th>
                <th className="num">Balance</th>
                <th className="num">Unit cost</th>
                <th>By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger.loading && <Loading colSpan={8} />}
              {!ledger.loading && ledger.results.length === 0 && <Empty colSpan={8} message="No movements yet." />}
              {!ledger.loading &&
                ledger.results.map((t) => (
                  <tr key={t.id}>
                    <td className="small">{dateTime(t.created_at)}</td>
                    <td>
                      <span className={`badge badge-txn-${t.transaction_type}`}>{t.transaction_type_display}</span>
                    </td>
                    <td>{t.purchase_order ? <Link to={`/purchase-orders/${t.purchase_order}`}>{t.po_number}</Link> : t.reference || "—"}</td>
                    <td className={`num strong ${Number(t.quantity) < 0 ? "text-danger" : "text-success"}`}>
                      {Number(t.quantity) > 0 ? "+" : ""}
                      {qty(t.quantity)}
                    </td>
                    <td className="num">{qty(t.balance_after)}</td>
                    <td className="num">{t.unit_cost ? money(t.unit_cost) : "—"}</td>
                    <td>{t.created_by_username || "—"}</td>
                    <td className="small muted">{t.notes}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} count={ledger.count} onPage={setPage} />
      </section>
      {editing && (
        <ItemForm
          item={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {adjusting && (
        <AdjustmentForm
          presetItem={item}
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
