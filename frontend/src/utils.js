const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export const money = (v) => inr.format(Number(v || 0));
export const qty = (v) => num.format(Number(v || 0));
export const compactMoney = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr.format(n);
};
export const date = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const dateTime = (v) =>
  v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};

export const UNITS = [
  ["pcs", "Pieces"],
  ["kg", "Kilograms"],
  ["g", "Grams"],
  ["l", "Litres"],
  ["m", "Metres"],
  ["box", "Boxes"],
  ["set", "Sets"],
];

export const PO_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export const TXN_TYPE_LABELS = {
  purchase: "Purchase receipt",
  consumption: "Consumption",
  adjustment: "Adjustment",
  return: "Return to supplier",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};
