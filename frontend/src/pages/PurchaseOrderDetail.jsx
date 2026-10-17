import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { ErrorBanner, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { date, dateTime, money, qty } from "../utils";

const STEPS = ["draft", "submitted", "approved", "partially_received", "received"];

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useToast();
  const [po, setPo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/purchase-orders/${id}/`)
      .then((r) => setPo(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  if (error && !po) return <ErrorBanner message={error} />;
  if (!po) return <Loading />;

  const changeStatus = async (status, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/purchase-orders/${id}/status/`, { status });
      setPo(data);
      notify(`Purchase order ${data.status_display.toLowerCase()}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete draft ${po.po_number}?`)) return;
    try {
      await api.delete(`/purchase-orders/${id}/`);
      notify("Draft deleted");
      navigate("/purchase-orders");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // A fully received PO shows every step as done.
  const stepIndex = po.status === "received" ? STEPS.length : STEPS.indexOf(po.status);
  const canReceive = ["approved", "partially_received"].includes(po.status);

  return (
    <>
      <div className="breadcrumbs">
        <Link to="/purchase-orders">Purchase orders</Link> / {po.po_number}
      </div>
      <PageHeader
        title={
          <>
            {po.po_number} <StatusBadge status={po.status} label={po.status_display} />
          </>
        }
        subtitle={`${po.supplier_name} · ordered ${date(po.order_date)}`}
        actions={
          <>
            {po.status === "draft" && (
              <>
                <button className="btn btn-danger-ghost" onClick={remove} disabled={busy}>
                  <Icon name="trash" /> Delete
                </button>
                <Link className="btn" to={`/purchase-orders/${po.id}/edit`}>
                  <Icon name="edit" /> Edit
                </Link>
                <button className="btn btn-primary" disabled={busy} onClick={() => changeStatus("submitted")}>
                  Submit for approval
                </button>
              </>
            )}
            {po.status === "submitted" && (
              <>
                <button className="btn" disabled={busy} onClick={() => changeStatus("draft")}>
                  Send back to draft
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={() => changeStatus("approved")}>
                  <Icon name="check" /> Approve
                </button>
              </>
            )}
            {canReceive && (
              <button className="btn btn-primary" onClick={() => setReceiving(true)}>
                <Icon name="truck" /> Receive goods
              </button>
            )}
            {["draft", "submitted", "approved"].includes(po.status) && (
              <button className="btn btn-danger-ghost" disabled={busy} onClick={() => changeStatus("cancelled", `Cancel ${po.po_number}?`)}>
                Cancel PO
              </button>
            )}
          </>
        }
      />
      <ErrorBanner message={error} />

      {po.status !== "cancelled" && (
        <ol className="stepper">
          {["Draft", "Submitted", "Approved", "Receiving", "Received"].map((label, i) => (
            <li key={label} className={i < stepIndex ? "done" : i === stepIndex ? "current" : ""}>
              <span className="step-dot">{i < stepIndex ? "✓" : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}

      <div className="grid-2 grid-2-wide-left">
        <section className="card">
          <div className="card-header">
            <h2>Lines</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Ordered</th>
                  <th className="num">Received</th>
                  <th className="num">Pending</th>
                  <th className="num">Unit price</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link to={`/items/${l.item}`} className="strong">
                        {l.item_sku}
                      </Link>
                      <div className="small muted">{l.item_name}</div>
                    </td>
                    <td className="num">
                      {qty(l.quantity_ordered)} <span className="muted small">{l.item_unit}</span>
                    </td>
                    <td className="num text-success">{qty(l.quantity_received)}</td>
                    <td className={`num ${Number(l.quantity_pending) > 0 ? "text-warning" : "muted"}`}>{qty(l.quantity_pending)}</td>
                    <td className="num">{money(l.unit_price)}</td>
                    <td className="num strong">{money(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <span>{money(po.subtotal)}</span>
            </div>
            <div>
              <span>Tax ({Number(po.tax_percent)}%)</span>
              <span>{money(po.tax_amount)}</span>
            </div>
            <div>
              <span>Shipping</span>
              <span>{money(po.shipping_cost)}</span>
            </div>
            <div className="totals-grand">
              <span>Total</span>
              <span>{money(po.total)}</span>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h2>Details</h2>
          </div>
          <dl className="details-grid">
            <dt>Supplier</dt>
            <dd>{po.supplier_name}</dd>
            <dt>Order date</dt>
            <dd>{date(po.order_date)}</dd>
            <dt>Expected</dt>
            <dd>{date(po.expected_date)}</dd>
            <dt>Received</dt>
            <dd>{date(po.received_date)}</dd>
            <dt>Created by</dt>
            <dd>{po.created_by_username || "—"}</dd>
            <dt>Approved by</dt>
            <dd>{po.approved_by_username ? `${po.approved_by_username} · ${dateTime(po.approved_at)}` : "—"}</dd>
            <dt>Notes</dt>
            <dd>{po.notes || "—"}</dd>
          </dl>
        </section>
      </div>

      {receiving && (
        <ReceiveModal
          po={po}
          onClose={() => setReceiving(false)}
          onDone={(updated) => {
            setReceiving(false);
            setPo(updated);
          }}
        />
      )}
    </>
  );
}

function ReceiveModal({ po, onClose, onDone }) {
  const notify = useToast();
  const pending = po.lines.filter((l) => Number(l.quantity_pending) > 0);
  const [qtys, setQtys] = useState(Object.fromEntries(pending.map((l) => [l.id, l.quantity_pending])));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const receipts = Object.entries(qtys)
        .filter(([, q]) => Number(q) > 0)
        .map(([line, quantity]) => ({ line: Number(line), quantity }));
      const { data } = await api.post(`/purchase-orders/${po.id}/receive/`, { receipts, notes });
      notify(`Goods received — stock updated`);
      onDone(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Receive goods · ${po.po_number}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="receive-form" disabled={busy}>
            {busy ? "Posting…" : "Post receipt"}
          </button>
        </>
      }
    >
      <form id="receive-form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Pending</th>
              <th className="num">Receive now</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="strong">{l.item_sku}</span>
                  <div className="small muted">{l.item_name}</div>
                </td>
                <td className="num">
                  {qty(l.quantity_pending)} {l.item_unit}
                </td>
                <td className="num">
                  <input
                    type="number"
                    min="0"
                    max={l.quantity_pending}
                    step="0.001"
                    className="input-num"
                    value={qtys[l.id]}
                    onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Field label="Notes (GRN / invoice no.)" full>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="muted small">Stock levels and item unit costs update immediately. Partial receipts keep the PO open.</p>
      </form>
    </Modal>
  );
}
