import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import ItemPicker from "../components/ItemPicker";
import Modal from "../components/Modal";
import { Empty, ErrorBanner, Field, Loading, PageHeader, Pagination, SearchBox } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useDebounced, useList } from "../hooks";
import { date, money, qty, today } from "../utils";

export const DEPARTMENTS = ["Fabrication", "Assembly", "Moulding", "Paint Shop", "Packing", "Maintenance"];

export default function Consumption() {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [debounced, dept, from, to]);

  const { results, count, loading, error, reload } = useList("/consumptions/", {
    search: debounced,
    department: dept,
    consumed_on__gte: from,
    consumed_on__lte: to,
    page,
  });

  return (
    <>
      <PageHeader
        title="Material consumption"
        subtitle="Materials issued to production, projects and maintenance"
        actions={
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Record consumption
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search item, work order, purpose…" />
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
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
                <th className="num">Quantity</th>
                <th className="num">Cost</th>
                <th>Department</th>
                <th>Work order</th>
                <th>Purpose</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {loading && <Loading colSpan={8} />}
              {!loading && results.length === 0 && <Empty colSpan={8} message="No consumption recorded." />}
              {!loading &&
                results.map((c) => (
                  <tr key={c.id}>
                    <td>{date(c.consumed_on)}</td>
                    <td>
                      <Link to={`/items/${c.item}`} className="strong">
                        {c.item_sku}
                      </Link>
                      <div className="small muted">{c.item_name}</div>
                    </td>
                    <td className="num strong">
                      {qty(c.quantity)} <span className="muted small">{c.item_unit}</span>
                    </td>
                    <td className="num">{money(c.cost)}</td>
                    <td>{c.department || "—"}</td>
                    <td>{c.work_order || "—"}</td>
                    <td className="small">{c.purpose}</td>
                    <td>{c.created_by_username || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} count={count} onPage={setPage} />
      </div>
      {adding && (
        <ConsumptionForm
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

function ConsumptionForm({ onClose, onSaved }) {
  const notify = useToast();
  const [form, setForm] = useState({ item: "", quantity: "", consumed_on: today(), department: "", work_order: "", purpose: "" });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const remaining = selected ? Number(selected.quantity_on_hand) - Number(form.quantity || 0) : null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/consumptions/", form);
      notify("Consumption recorded");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Record material consumption"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="cons-form" disabled={busy}>
            {busy ? "Saving…" : "Record"}
          </button>
        </>
      }
    >
      <form id="cons-form" className="form-grid" onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="Item *" full>
          <ItemPicker
            value={form.item}
            onChange={(v, item) => {
              setForm({ ...form, item: v });
              setSelected(item || null);
            }}
            filter={(i) => Number(i.quantity_on_hand) > 0}
          />
        </Field>
        <Field
          label="Quantity *"
          hint={
            selected &&
            (remaining < 0 ? (
              <span className="text-danger">Exceeds available stock ({qty(selected.quantity_on_hand)})</span>
            ) : (
              `${qty(remaining)} ${selected.unit} will remain${remaining <= Number(selected.reorder_level) ? " — below reorder level" : ""}`
            ))
          }
        >
          <input type="number" required min="0.001" step="0.001" value={form.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Date *">
          <input type="date" required value={form.consumed_on} onChange={set("consumed_on")} />
        </Field>
        <Field label="Department">
          <select value={form.department} onChange={set("department")}>
            <option value="">—</option>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Work order">
          <input value={form.work_order} onChange={set("work_order")} placeholder="WO-2610-123" />
        </Field>
        <Field label="Purpose" full>
          <input value={form.purpose} onChange={set("purpose")} />
        </Field>
      </form>
    </Modal>
  );
}
