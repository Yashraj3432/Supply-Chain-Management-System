import { useCallback, useEffect, useRef, useState } from "react";
import api, { errorMessage } from "./api/client";

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/**
 * Fetch a paginated DRF list. `params` changes trigger a reload; returns reload() for after mutations.
 */
export function useList(path, params = {}) {
  const [data, setData] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = JSON.stringify(params);
  const reqId = useRef(0);

  const load = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    const cleaned = Object.fromEntries(Object.entries(JSON.parse(key)).filter(([, v]) => v !== "" && v !== null && v !== undefined));
    return api
      .get(path, { params: cleaned })
      .then((res) => {
        if (id !== reqId.current) return;
        const d = res.data;
        setData(Array.isArray(d) ? { results: d, count: d.length } : d);
      })
      .catch((err) => id === reqId.current && setError(errorMessage(err)))
      .finally(() => id === reqId.current && setLoading(false));
  }, [path, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, reload: load };
}

/** Load a small lookup list (non-paginated or first 200 rows). */
export function useLookup(path, params = {}) {
  const [rows, setRows] = useState([]);
  const key = JSON.stringify(params);
  useEffect(() => {
    api
      .get(path, { params: { page_size: 200, ...JSON.parse(key) } })
      .then((res) => setRows(Array.isArray(res.data) ? res.data : res.data.results))
      .catch(() => setRows([]));
  }, [path, key]);
  return rows;
}
