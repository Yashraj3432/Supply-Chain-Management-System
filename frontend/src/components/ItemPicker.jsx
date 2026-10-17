import { useLookup } from "../hooks";
import { qty } from "../utils";

/** Select an item; shows on-hand quantity to help avoid over-issuing. */
export default function ItemPicker({ value, onChange, required = true, showStock = true, filter }) {
  const items = useLookup("/items/", { is_active: true, ordering: "sku" });
  const list = filter ? items.filter(filter) : items;
  return (
    <select required={required} value={value ?? ""} onChange={(e) => onChange(e.target.value, items.find((i) => String(i.id) === e.target.value))}>
      <option value="">Select item…</option>
      {list.map((i) => (
        <option key={i.id} value={i.id}>
          {i.sku} — {i.name}
          {showStock ? ` (${qty(i.quantity_on_hand)} ${i.unit})` : ""}
        </option>
      ))}
    </select>
  );
}
