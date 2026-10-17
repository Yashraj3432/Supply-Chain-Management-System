import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import Icon from "./Icon";

const NAV = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/items", label: "Inventory", icon: "box" },
  { to: "/suppliers", label: "Suppliers", icon: "truck" },
  { to: "/purchase-orders", label: "Purchase Orders", icon: "cart" },
  { to: "/consumption", label: "Consumption", icon: "factory" },
  { to: "/transactions", label: "Stock Ledger", icon: "swap" },
  { to: "/alerts", label: "Low-stock Alerts", icon: "bell", badge: true },
  { to: "/reports", label: "Reports", icon: "chart" },
  { to: "/settings", label: "Categories & Sites", icon: "layers" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get("/alerts/", { params: { status: "open", page_size: 1 } })
        .then((r) => alive && setAlertCount(r.data.count))
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [location.pathname]);

  return (
    <div className={`app-shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="box" size={20} />
          </span>
          <span>SupplyChain Pro</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.badge && alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{(user?.first_name || user?.username || "?").charAt(0).toUpperCase()}</div>
            <div>
              <div className="user-name">{user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-block" onClick={logout}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <main className="main">
        <header className="topbar">
          <button className="btn btn-icon menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
            <Icon name="menu" />
          </button>
          <div className="topbar-title">Supply Chain Management</div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
