import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Empty, ErrorBanner, Loading, PageHeader, Pagination, SearchBox, StatusBadge } from "../components/ui";
import { useDebounced, useList, useLookup } from "../hooks";
import { date, money, PO_STATUS_LABELS } from "../utils";

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [supplier, setSupplier] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const suppliers = useLookup("/suppliers/");
  useEffect(() => setPage(1), [debounced, status, supplier]);
  const { results, count, loading, error } = useList("/purchase-orders/", { search: debounced, status, supplier, page });
  const todayStr = new Date().toLocaleDateString("en-CA");

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle="Create, approve and receive orders from suppliers"
        actions={
          <button className="btn btn-primary" onClick={() => navigate("/purchase-orders/new")}>
            <Icon name="plus" /> New purchase order
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search PO number, supplier, item…" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(PO_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <ErrorBanner message={error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>PO number</th>
                <th>Supplier</th>
                <th>Order date</th>
                <th>Expected</th>
                <th className="num">Lines</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <Loading colSpan={7} />}
              {!loading && results.length === 0 && <Empty colSpan={7} message="No purchase orders found." />}
              {!loading &&
                results.map((po) => {
                  const overdue =
                    po.expected_date &&
                    po.expected_date < todayStr &&
                    ["submitted", "approved", "partially_received"].includes(po.status);
                  return (
                    <tr key={po.id} className="clickable" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                      <td>
                        <Link to={`/purchase-orders/${po.id}`} className="strong" onClick={(e) => e.stopPropagation()}>
                          {po.po_number}
                        </Link>
                      </td>
                      <td>{po.supplier_name}</td>
                      <td>{date(po.order_date)}</td>
                      <td className={overdue ? "text-danger strong" : ""}>
                        {date(po.expected_date)}
                        {overdue && " · overdue"}
                      </td>
                      <td className="num">{po.line_count}</td>
                      <td className="num strong">{money(po.total)}</td>
                      <td>
                        <StatusBadge status={po.status} label={po.status_display} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} count={count} onPage={setPage} />
      </div>
    </>
  );
}
