import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Empty, ErrorBanner, Field, Loading, PageHeader, Pagination, SearchBox, StockBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useDebounced, useList, useLookup } from "../hooks";
import { money, qty, UNITS } from "../utils";

const EMPTY_ITEM = {
  sku: "",
  name: "",
  description: "",
  category: "",
  preferred_supplier: "",
  warehouse: "",
  unit: "pcs",
  unit_cost: "0",
  reorder_level: "10",
  reorder_quantity: "0",
  opening_quantity: "",
  is_active: true,
};

export default function Items() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ category: "", preferred_supplier: "", low_stock: "", is_active: "true" });
  const [ordering, setOrdering] = useState("name");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const debounced = useDebounced(search);
  const categories = useLookup("/categories/");
  const suppliers = useLookup("/suppliers/", { is_active: true });

  useEffect(() => setPage(1), [debounced, filters, ordering]);
  const { results, count, loading, error, reload } = useList("/items/", { search: debounced, page, ordering, ...filters });

  const sortBy = (field) => setOrdering((o) => (o === field ? `-${field}` : field));
  const sortMark = (field) => (ordering === field ? " ▲" : ordering === `-${field}` ? " ▼" : "");

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Items, stock levels and reorder settings"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing(EMPTY_ITEM)}>
            <Icon name="plus" /> New item
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search SKU, name, category, supplier…" />
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={filters.preferred_supplier} onChange={(e) => setFilters({ ...filters, preferred_supplier: e.target.value })}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={filters.low_stock} onChange={(e) => setFilters({ ...filters, low_stock: e.target.value })}>
            <option value="">Any stock level</option>
            <option value="true">Low stock only</option>
            <option value="false">Healthy stock</option>
          </select>
          <select value={filters.is_active} onChange={(e) => setFilters({ ...filters, is_active: e.target.value })}>
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
                <th className="sortable" onClick={() => sortBy("sku")}>SKU{sortMark("sku")}</th>
                <th className="sortable" onClick={() => sortBy("name")}>Name{sortMark("name")}</th>
                <th>Category</th>
                <th>Supplier</th>
                <th className="num sortable" onClick={() => sortBy("quantity_on_hand")}>On hand{sortMark("quantity_on_hand")}</th>
                <th className="num">Reorder at</th>
                <th className="num sortable" onClick={() => sortBy("unit_cost")}>Unit cost{sortMark("unit_cost")}</th>
                <th className="num">Value</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && <Loading colSpan={10} />}
              {!loading && results.length === 0 && <Empty colSpan={10} message="No items match your filters." />}
              {!loading &&
                results.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/items/${i.id}`} className="strong">
                        {i.sku}
                      </Link>
                    </td>
                    <td>{i.name}</td>
                    <td>{i.category_name || "—"}</td>
                    <td>{i.preferred_supplier_name || "—"}</td>
                    <td className="num strong">
                      {qty(i.quantity_on_hand)} <span className="muted small">{i.unit}</span>
                    </td>
                    <td className="num">{qty(i.reorder_level)}</td>
                    <td className="num">{money(i.unit_cost)}</td>
                    <td className="num">{money(i.stock_value)}</td>
                    <td>
                      <StockBadge item={i} />
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-icon" title="Edit" onClick={() => setEditing(i)}>
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
        <ItemForm
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export function ItemForm({ item, onClose, onSaved }) {
  const notify = useToast();
  const isNew = !item.id;
  const [form, setForm] = useState({
    ...EMPTY_ITEM,
    ...item,
    category: item.category ?? "",
    preferred_supplier: item.preferred_supplier ?? "",
    warehouse: item.warehouse ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const categories = useLookup("/categories/");
  const suppliers = useLookup("/suppliers/");
  const warehouses = useLookup("/warehouses/");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      category: form.category || null,
      preferred_supplier: form.preferred_supplier || null,
      warehouse: form.warehouse || null,
    };
    if (!isNew || !payload.opening_quantity) delete payload.opening_quantity;
    try {
      if (isNew) await api.post("/items/", payload);
      else await api.patch(`/items/${item.id}/`, payload);
      notify(isNew ? "Item created" : "Item updated");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? "New item" : `Edit ${item.sku}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="item-form" disabled={busy}>
            {busy ? "Saving…" : "Save item"}
          </button>
        </>
      }
    >
      <form id="item-form" className="form-grid" onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="SKU *">
          <input required value={form.sku} onChange={set("sku")} placeholder="e.g. RM-STL-001" />
        </Field>
        <Field label="Name *">
          <input required value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={set("category")}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preferred supplier">
          <select value={form.preferred_supplier} onChange={set("preferred_supplier")}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Warehouse">
          <select value={form.warehouse} onChange={set("warehouse")}>
            <option value="">—</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit">
          <select value={form.unit} onChange={set("unit")}>
            {UNITS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit cost (₹)">
          <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={set("unit_cost")} />
        </Field>
        <Field label="Reorder level" hint="Alert when stock falls to this level">
          <input type="number" min="0" step="0.001" value={form.reorder_level} onChange={set("reorder_level")} />
        </Field>
        <Field label="Reorder quantity" hint="Suggested order size">
          <input type="number" min="0" step="0.001" value={form.reorder_quantity} onChange={set("reorder_quantity")} />
        </Field>
        {isNew ? (
          <Field label="Opening stock" hint="Recorded as an adjustment in the ledger">
            <input type="number" min="0" step="0.001" value={form.opening_quantity} onChange={set("opening_quantity")} />
          </Field>
        ) : (
          <Field label="On hand" hint="Change stock via the ledger, consumption or PO receipts">
            <input disabled value={`${qty(item.quantity_on_hand)} ${item.unit}`} />
          </Field>
        )}
        <Field label="Description" full>
          <textarea rows={2} value={form.description} onChange={set("description")} />
        </Field>
        <label className="checkbox field-full">
          <input type="checkbox" checked={form.is_active} onChange={set("is_active")} /> Active
        </label>
      </form>
    </Modal>
  );
}
