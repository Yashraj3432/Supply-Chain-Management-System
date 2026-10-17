import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Empty, ErrorBanner, Field, Loading, PageHeader, Pagination, SearchBox, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useDebounced, useList } from "../hooks";
import { date, money, PO_STATUS_LABELS } from "../utils";

const EMPTY = {
  name: "",
  code: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  country: "India",
  gst_number: "",
  lead_time_days: 7,
  rating: "0",
  is_active: true,
  notes: "",
};

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("true");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [debounced, active]);
  const { results, count, loading, error, reload } = useList("/suppliers/", { search: debounced, is_active: active, page });

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Vendor directory, lead times and ratings"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing(EMPTY)}>
            <Icon name="plus" /> New supplier
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, code, contact, city…" />
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="">All</option>
          </select>
        </div>
        <ErrorBanner message={error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact</th>
                <th>City</th>
                <th className="num">Lead time</th>
                <th className="num">Rating</th>
                <th className="num">Items</th>
                <th className="num">Open POs</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && <Loading colSpan={10} />}
              {!loading && results.length === 0 && <Empty colSpan={10} message="No suppliers found." />}
              {!loading &&
                results.map((s) => (
                  <tr key={s.id}>
                    <td className="strong">{s.code}</td>
                    <td>
                      <button className="link" onClick={() => setViewing(s)}>
                        {s.name}
                      </button>
                    </td>
                    <td>
                      {s.contact_person || "—"}
                      <div className="small muted">{s.phone}</div>
                    </td>
                    <td>{s.city || "—"}</td>
                    <td className="num">{s.lead_time_days} d</td>
                    <td className="num">
                      <span className="rating">★ {Number(s.rating).toFixed(1)}</span>
                    </td>
                    <td className="num">{s.item_count}</td>
                    <td className="num">{s.open_po_count}</td>
                    <td>{s.is_active ? <span className="badge badge-success">Active</span> : <span className="badge">Inactive</span>}</td>
                    <td className="row-actions">
                      <button className="btn btn-icon" title="Edit" onClick={() => setEditing(s)}>
                        <Icon name="edit" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} count={count} onPage={setPage} />
      </div>
      {editing && (
        <SupplierForm
          supplier={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {viewing && <SupplierDetail supplier={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const notify = useToast();
  const isNew = !supplier.id;
  const [form, setForm] = useState({ ...EMPTY, ...supplier });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isNew) await api.post("/suppliers/", form);
      else await api.patch(`/suppliers/${supplier.id}/`, form);
      notify(isNew ? "Supplier created" : "Supplier updated");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? "New supplier" : `Edit ${supplier.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="sup-form" disabled={busy}>
            {busy ? "Saving…" : "Save supplier"}
          </button>
        </>
      }
    >
      <form id="sup-form" className="form-grid" onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="Name *">
          <input required value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Code *">
          <input required value={form.code} onChange={set("code")} placeholder="SUP-007" />
        </Field>
        <Field label="Contact person">
          <input value={form.contact_person} onChange={set("contact_person")} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="GST / Tax number">
          <input value={form.gst_number} onChange={set("gst_number")} />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={set("city")} />
        </Field>
        <Field label="Country">
          <input value={form.country} onChange={set("country")} />
        </Field>
        <Field label="Lead time (days)">
          <input type="number" min="0" value={form.lead_time_days} onChange={set("lead_time_days")} />
        </Field>
        <Field label="Rating (0–5)">
          <input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={set("rating")} />
        </Field>
        <Field label="Address" full>
          <textarea rows={2} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Notes" full>
          <textarea rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
        <label className="checkbox field-full">
          <input type="checkbox" checked={form.is_active} onChange={set("is_active")} /> Active
        </label>
      </form>
    </Modal>
  );
}

function SupplierDetail({ supplier, onClose }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    api
      .get(`/suppliers/${supplier.id}/purchase_orders/`)
      .then((r) => setPos(r.data.results || r.data))
      .catch(() => setPos([]));
  }, [supplier.id]);

  return (
    <Modal title={supplier.name} onClose={onClose} wide>
      <dl className="details-grid">
        <dt>Code</dt>
        <dd>{supplier.code}</dd>
        <dt>Contact</dt>
        <dd>{supplier.contact_person || "—"}</dd>
        <dt>Email</dt>
        <dd>{supplier.email || "—"}</dd>
        <dt>Phone</dt>
        <dd>{supplier.phone || "—"}</dd>
        <dt>Address</dt>
        <dd>{[supplier.address, supplier.city, supplier.country].filter(Boolean).join(", ") || "—"}</dd>
        <dt>GST</dt>
        <dd>{supplier.gst_number || "—"}</dd>
        <dt>Lead time</dt>
        <dd>{supplier.lead_time_days} days</dd>
        <dt>Rating</dt>
        <dd>★ {Number(supplier.rating).toFixed(1)}</dd>
      </dl>
      <h3 className="section-title">Purchase orders</h3>
      <table className="table table-compact">
        <thead>
          <tr>
            <th>PO</th>
            <th>Date</th>
            <th>Status</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {pos === null && <Loading colSpan={4} />}
          {pos && pos.length === 0 && <Empty colSpan={4} message="No purchase orders." />}
          {pos &&
            pos.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/purchase-orders/${p.id}`} className="strong" onClick={onClose}>
                    {p.po_number}
                  </Link>
                </td>
                <td>{date(p.order_date)}</td>
                <td>
                  <StatusBadge status={p.status} label={PO_STATUS_LABELS[p.status]} />
                </td>
                <td className="num">{money(p.total)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </Modal>
  );
}
