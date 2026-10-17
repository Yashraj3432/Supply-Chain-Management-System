import { useState } from "react";
import api, { errorMessage } from "../api/client";
import Icon from "../components/Icon";
import { ErrorBanner, PageHeader } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useList } from "../hooks";

/** Simple inline CRUD for categories and warehouses. */
export default function Settings() {
  return (
    <>
      <PageHeader title="Categories & sites" subtitle="Reference data used to organise inventory" />
      <div className="grid-2">
        <LookupEditor
          title="Categories"
          path="/categories/"
          fields={[
            ["name", "Name", true],
            ["description", "Description"],
          ]}
        />
        <LookupEditor
          title="Warehouses"
          path="/warehouses/"
          fields={[
            ["code", "Code", true],
            ["name", "Name", true],
            ["location", "Location"],
          ]}
        />
      </div>
    </>
  );
}

function LookupEditor({ title, path, fields }) {
  const notify = useToast();
  const { results, reload } = useList(path);
  const blank = Object.fromEntries(fields.map(([k]) => [k, ""]));
  const [draft, setDraft] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState(blank);
  const [error, setError] = useState("");

  const run = async (fn, msg) => {
    setError("");
    try {
      await fn();
      notify(msg);
      reload();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api.post(path, draft), `${title.slice(0, -1)} added`)) setDraft(blank);
  };
  const save = async (id) => {
    if (await run(() => api.patch(`${path}${id}/`, editRow), "Saved")) setEditId(null);
  };
  const remove = (row) => window.confirm(`Delete ${row.name}?`) && run(() => api.delete(`${path}${row.id}/`), "Deleted");

  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      <ErrorBanner message={error} />
      <table className="table table-compact">
        <thead>
          <tr>
            {fields.map(([k, l]) => (
              <th key={k}>{l}</th>
            ))}
            <th className="num">Items</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {results.map((row) =>
            editId === row.id ? (
              <tr key={row.id}>
                {fields.map(([k]) => (
                  <td key={k}>
                    <input value={editRow[k] ?? ""} onChange={(e) => setEditRow({ ...editRow, [k]: e.target.value })} />
                  </td>
                ))}
                <td />
                <td className="row-actions nowrap">
                  <button className="btn btn-sm btn-primary" onClick={() => save(row.id)}>
                    Save
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={row.id}>
                {fields.map(([k], i) => (
                  <td key={k} className={i === 0 ? "strong" : ""}>
                    {row[k] || "—"}
                  </td>
                ))}
                <td className="num">{row.item_count}</td>
                <td className="row-actions nowrap">
                  <button
                    className="btn btn-icon"
                    title="Edit"
                    onClick={() => {
                      setEditId(row.id);
                      setEditRow(row);
                    }}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="btn btn-icon" title="Delete" onClick={() => remove(row)}>
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      <form className="inline-form" onSubmit={add}>
        {fields.map(([k, l, req]) => (
          <input key={k} placeholder={l} required={req} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        ))}
        <button className="btn btn-primary">
          <Icon name="plus" /> Add
        </button>
      </form>
    </section>
  );
}
