import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { Empty, ErrorBanner, Loading, PageHeader, Pagination, SearchBox, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useDebounced, useList } from "../hooks";
import { dateTime, qty } from "../utils";

export default function Alerts() {
  const notify = useToast();
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [status, debounced]);
  const list = useList("/alerts/", { status, search: debounced, page });

  const act = async (alert, action) => {
    setError("");
    try {
      await api.post(`/alerts/${alert.id}/${action}/`);
      notify(action === "acknowledge" ? "Alert acknowledged" : "Alert resolved");
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const rescan = async () => {
    try {
      const { data } = await api.post("/alerts/rescan/");
      notify(`Rescan complete · ${data.open_alerts} open alerts`);
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Low-stock alerts"
        subtitle="Raised automatically when an item falls to its reorder level; resolved when stock recovers"
        actions={
          <button className="btn" onClick={rescan}>
            <Icon name="refresh" /> Rescan stock
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <div className="tabs">
            {[
              ["open", "Open"],
              ["acknowledged", "Acknowledged"],
              ["resolved", "Resolved"],
              ["", "All"],
            ].map(([v, l]) => (
              <button key={v} className={`tab ${status === v ? "active" : ""}`} onClick={() => setStatus(v)}>
                {l}
              </button>
            ))}
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="Search item…" />
        </div>
        <ErrorBanner message={error || list.error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Raised</th>
                <th>Item</th>
                <th className="num">At alert</th>
                <th className="num">Now</th>
                <th className="num">Reorder level</th>
                <th>Supplier</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.loading && <Loading colSpan={8} />}
              {!list.loading && list.results.length === 0 && <Empty colSpan={8} message="No alerts here. Stock levels look healthy." />}
              {!list.loading &&
                list.results.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{dateTime(a.created_at)}</td>
                    <td>
                      <Link to={`/items/${a.item}`} className="strong">
                        {a.item_sku}
                      </Link>
                      <div className="small muted">{a.item_name}</div>
                    </td>
                    <td className="num">{qty(a.quantity_at_alert)}</td>
                    <td className={`num strong ${Number(a.current_quantity) <= 0 ? "text-danger" : Number(a.current_quantity) <= Number(a.reorder_level) ? "text-warning" : "text-success"}`}>
                      {qty(a.current_quantity)} {a.item_unit}
                    </td>
                    <td className="num">{qty(a.reorder_level)}</td>
                    <td>{a.preferred_supplier_name || "—"}</td>
                    <td>
                      <StatusBadge status={`alert-${a.status}`} label={a.status} />
                      {a.acknowledged_by_username && <div className="small muted">by {a.acknowledged_by_username}</div>}
                    </td>
                    <td className="row-actions nowrap">
                      {a.status !== "resolved" && (
                        <>
                          <Link
                            className="btn btn-sm btn-primary"
                            to={`/purchase-orders/new?item=${a.item}&qty=${Number(a.reorder_quantity) || Number(a.reorder_level)}${a.preferred_supplier ? `&supplier=${a.preferred_supplier}` : ""}`}
                          >
                            Create PO
                          </Link>
                          {a.status === "open" && (
                            <button className="btn btn-sm" onClick={() => act(a, "acknowledge")}>
                              Acknowledge
                            </button>
                          )}
                          <button className="btn btn-sm" onClick={() => act(a, "resolve")}>
                            Resolve
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} count={list.count} onPage={setPage} />
      </div>
    </>
  );
}
