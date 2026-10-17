import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { ErrorBanner, Field, Loading, PageHeader } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useLookup } from "../hooks";
import { money, qty, today } from "../utils";

const newLine = () => ({ key: Math.random(), item: "", quantity_ordered: "", unit_price: "" });

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = !id;
  const navigate = useNavigate();
  const notify = useToast();
  const suppliers = useLookup("/suppliers/", { is_active: true });
  const items = useLookup("/items/", { is_active: true, ordering: "sku" });
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) {
      // Allow prefilling from a low-stock alert: /purchase-orders/new?supplier=1&item=5&qty=100
      const line = newLine();
      if (params.get("item")) Object.assign(line, { item: params.get("item"), quantity_ordered: params.get("qty") || "" });
      setForm({
        supplier: params.get("supplier") || "",
        order_date: today(),
        expected_date: "",
        tax_percent: "18",
        shipping_cost: "0",
        notes: "",
        lines: [line],
      });
      return;
    }
    api
      .get(`/purchase-orders/${id}/`)
      .then(({ data }) => {
        if (data.status !== "draft") {
          navigate(`/purchase-orders/${id}`, { replace: true });
          return;
        }
        setForm({
          ...data,
          expected_date: data.expected_date || "",
          lines: data.lines.map((l) => ({ ...l, key: l.id })),
        });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id, isNew, navigate, params]);

  // Fill unit price from item cost when an item is chosen
  useEffect(() => {
    if (!form || !items.length) return;
    let changed = false;
    const lines = form.lines.map((l) => {
      if (l.item && l.unit_price === "") {
        const it = items.find((i) => String(i.id) === String(l.item));
        if (it) {
          changed = true;
          return { ...l, unit_price: it.unit_cost };
        }
      }
      return l;
    });
    if (changed) setForm((f) => ({ ...f, lines }));
  }, [items, form]);

  const totals = useMemo(() => {
    if (!form) return { subtotal: 0, tax: 0, total: 0 };
    const subtotal = form.lines.reduce((s, l) => s + Number(l.quantity_ordered || 0) * Number(l.unit_price || 0), 0);
    const tax = (subtotal * Number(form.tax_percent || 0)) / 100;
    return { subtotal, tax, total: subtotal + tax + Number(form.shipping_cost || 0) };
  }, [form]);

  if (error && !form) return <ErrorBanner message={error} />;
  if (!form) return <Loading />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (idx, patch) => setForm({ ...form, lines: form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });
  const chosen = new Set(form.lines.map((l) => String(l.item)));
  const supplierItems = form.supplier ? items.filter((i) => String(i.preferred_supplier) === String(form.supplier)) : [];

  const onSupplier = (e) => {
    const sup = suppliers.find((s) => String(s.id) === e.target.value);
    const patch = { supplier: e.target.value };
    if (sup && !form.expected_date) {
      const d = new Date(form.order_date);
      d.setDate(d.getDate() + Number(sup.lead_time_days || 0));
      patch.expected_date = d.toLocaleDateString("en-CA");
    }
    setForm({ ...form, ...patch });
  };

  const addSuggested = () => {
    const low = supplierItems.filter((i) => i.is_low_stock && !chosen.has(String(i.id)));
    if (!low.length) return notify("No low-stock items for this supplier", "info");
    const lines = form.lines.filter((l) => l.item);
    low.forEach((i) =>
      lines.push({
        key: Math.random(),
        item: String(i.id),
        quantity_ordered: Number(i.reorder_quantity) > 0 ? i.reorder_quantity : i.reorder_level,
        unit_price: i.unit_cost,
      })
    );
    setForm({ ...form, lines });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      supplier: form.supplier,
      order_date: form.order_date,
      expected_date: form.expected_date || null,
      tax_percent: form.tax_percent || 0,
      shipping_cost: form.shipping_cost || 0,
      notes: form.notes,
      lines: form.lines
        .filter((l) => l.item)
        .map((l) => ({ item: l.item, quantity_ordered: l.quantity_ordered, unit_price: l.unit_price || 0 })),
    };
    try {
      const { data } = isNew ? await api.post("/purchase-orders/", payload) : await api.put(`/purchase-orders/${id}/`, payload);
      notify(isNew ? `Purchase order ${data.po_number} created` : "Purchase order updated");
      navigate(`/purchase-orders/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <div className="breadcrumbs">
        <Link to="/purchase-orders">Purchase orders</Link> / {isNew ? "New" : form.po_number}
      </div>
      <PageHeader
        title={isNew ? "New purchase order" : `Edit ${form.po_number}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save draft"}
            </button>
          </>
        }
      />
      <ErrorBanner message={error} />
      <section className="card">
        <div className="form-grid form-grid-3">
          <Field label="Supplier *">
            <select required value={form.supplier} onChange={onSupplier}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.lead_time_days}d lead)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Order date *">
            <input type="date" required value={form.order_date} onChange={set("order_date")} />
          </Field>
          <Field label="Expected delivery">
            <input type="date" value={form.expected_date} onChange={set("expected_date")} />
          </Field>
          <Field label="Tax %">
            <input type="number" min="0" step="0.01" value={form.tax_percent} onChange={set("tax_percent")} />
          </Field>
          <Field label="Shipping (₹)">
            <input type="number" min="0" step="0.01" value={form.shipping_cost} onChange={set("shipping_cost")} />
          </Field>
          <Field label="Notes">
            <input value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Order lines</h2>
          <div className="btn-group">
            {form.supplier && (
              <button type="button" className="btn btn-sm" onClick={addSuggested}>
                <Icon name="bell" size={14} /> Add low-stock items
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}>
              <Icon name="plus" size={14} /> Add line
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table lines-table">
            <thead>
              <tr>
                <th style={{ width: "42%" }}>Item</th>
                <th className="num">On hand</th>
                <th className="num">Quantity</th>
                <th className="num">Unit price (₹)</th>
                <th className="num">Line total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, idx) => {
                const it = items.find((i) => String(i.id) === String(l.item));
                return (
                  <tr key={l.key}>
                    <td>
                      <select
                        required
                        value={l.item}
                        onChange={(e) => {
                          const sel = items.find((i) => String(i.id) === e.target.value);
                          setLine(idx, { item: e.target.value, unit_price: sel ? sel.unit_cost : "" });
                        }}
                      >
                        <option value="">Select item…</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id} disabled={chosen.has(String(i.id)) && String(i.id) !== String(l.item)}>
                            {i.sku} — {i.name}
                            {form.supplier && String(i.preferred_supplier) === String(form.supplier) ? " ★" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`num ${it?.is_low_stock ? "text-warning" : "muted"}`}>{it ? `${qty(it.quantity_on_hand)} ${it.unit}` : "—"}</td>
                    <td className="num">
                      <input
                        type="number"
                        required
                        min="0.001"
                        step="0.001"
                        className="input-num"
                        value={l.quantity_ordered}
                        onChange={(e) => setLine(idx, { quantity_ordered: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        className="input-num"
                        value={l.unit_price}
                        onChange={(e) => setLine(idx, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="num strong">{money(Number(l.quantity_ordered || 0) * Number(l.unit_price || 0))}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-icon"
                        title="Remove line"
                        disabled={form.lines.length === 1}
                        onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) })}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span>{money(totals.subtotal)}</span>
          </div>
          <div>
            <span>Tax ({form.tax_percent || 0}%)</span>
            <span>{money(totals.tax)}</span>
          </div>
          <div>
            <span>Shipping</span>
            <span>{money(form.shipping_cost)}</span>
          </div>
          <div className="totals-grand">
            <span>Total</span>
            <span>{money(totals.total)}</span>
          </div>
        </div>
        <p className="muted small">★ marks items whose preferred supplier is the selected supplier.</p>
      </section>
    </form>
  );
}
