import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import ItemPicker from "../components/ItemPicker";
import Modal from "../components/Modal";
import { Empty, ErrorBanner, Field, Loading, PageHeader, Pagination, SearchBox } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useDebounced, useList } from "../hooks";
import { dateTime, money, qty, TXN_TYPE_LABELS } from "../utils";

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [debounced, type, from, to]);

  const { results, count, loading, error, reload } = useList("/transactions/", {
    search: debounced,
    transaction_type: type,
    created_at__gte: from ? `${from}T00:00:00` : "",
    created_at__lte: to ? `${to}T23:59:59` : "",
    page,
  });

  return (
    <>
      <PageHeader
        title="Stock ledger"
        subtitle="Every stock movement, in order. Entries are append-only."
        actions={
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Record movement
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search item, reference, notes…" />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TXN_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="inline-field">
            From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="inline-field">
            To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <ErrorBanner message={error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Type</th>
                <th>Reference</th>
                <th className="num">Change</th>
                <th className="num">Balance</th>
                <th className="num">Value</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {loading && <Loading colSpan={8} />}
              {!loading && results.length === 0 && <Empty colSpan={8} message="No movements found." />}
              {!loading &&
                results.map((t) => (
                  <tr key={t.id}>
                    <td className="small">{dateTime(t.created_at)}</td>
                    <td>
                      <Link to={`/items/${t.item}`} className="strong">
                        {t.item_sku}
                      </Link>
                      <div className="small muted">{t.item_name}</div>
                    </td>
                    <td>
                      <span className={`badge badge-txn-${t.transaction_type}`}>{t.transaction_type_display}</span>
                    </td>
                    <td>{t.purchase_order ? <Link to={`/purchase-orders/${t.purchase_order}`}>{t.po_number}</Link> : t.reference || "—"}</td>
                    <td className={`num strong ${Number(t.quantity) < 0 ? "text-danger" : "text-success"}`}>
                      {Number(t.quantity) > 0 ? "+" : ""}
                      {qty(t.quantity)} <span className="muted small">{t.item_unit}</span>
                    </td>
                    <td className="num">{qty(t.balance_after)}</td>
                    <td className="num">{money(Math.abs(Number(t.quantity) * Number(t.unit_cost || 0)))}</td>
                    <td>{t.created_by_username || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} count={count} onPage={setPage} />
      </div>
      {adding && (
        <AdjustmentForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </>
  );
}

const MANUAL_TYPES = [
  ["adjustment", "Adjustment (stock count correction)"],
  ["return", "Return to supplier"],
  ["transfer_in", "Transfer in"],
  ["transfer_out", "Transfer out"],
];

export function AdjustmentForm({ presetItem, onClose, onSaved }) {
  const notify = useToast();
  const [form, setForm] = useState({
    item: presetItem?.id ?? "",
    transaction_type: "adjustment",
    direction: "add",
    quantity: "",
    reference: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const amount = Number(form.quantity);
    const quantity = form.transaction_type === "adjustment" && form.direction === "remove" ? -amount : amount;
    try {
      await api.post("/transactions/", {
        item: form.item,
        transaction_type: form.transaction_type,
        quantity,
        reference: form.reference,
        notes: form.notes,
      });
      notify("Stock movement recorded");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record stock movement"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="adj-form" disabled={busy}>
            {busy ? "Saving…" : "Record"}
          </button>
        </>
      }
    >
      <form id="adj-form" className="form-grid" onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="Item *" full>
          {presetItem ? (
            <input disabled value={`${presetItem.sku} — ${presetItem.name} (${qty(presetItem.quantity_on_hand)} ${presetItem.unit})`} />
          ) : (
            <ItemPicker value={form.item} onChange={(v) => setForm({ ...form, item: v })} />
          )}
        </Field>
        <Field label="Movement type">
          <select value={form.transaction_type} onChange={set("transaction_type")}>
            {MANUAL_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {form.transaction_type === "adjustment" ? (
          <Field label="Direction">
            <select value={form.direction} onChange={set("direction")}>
              <option value="add">Increase stock</option>
              <option value="remove">Decrease stock</option>
            </select>
          </Field>
        ) : (
          <Field label="Direction">
            <input disabled value={form.transaction_type === "transfer_in" ? "Increase stock" : "Decrease stock"} />
          </Field>
        )}
        <Field label="Quantity *">
          <input type="number" required min="0.001" step="0.001" value={form.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Reference">
          <input value={form.reference} onChange={set("reference")} placeholder="Count sheet, GRN, transfer note…" />
        </Field>
        <Field label="Notes" full>
          <textarea rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
        <p className="muted small field-full">
          Purchase receipts are recorded from a purchase order; production usage from the Consumption page.
        </p>
      </form>
    </Modal>
  );
}
