# Supply Chain Management System

A full-stack application for managing inventory, suppliers, purchase orders and material consumption.

- **Backend:** Django 5 + Django REST Framework, JWT auth (SimpleJWT), django-filter
- **Frontend:** React 18 (Vite), React Router, Axios, plain CSS
- **Database:** MySQL 8 (Docker Compose included)

## Features

- **Inventory** – items with SKU, category, warehouse, unit, cost, reorder level and reorder quantity. Search, filter (category, supplier, low stock, active) and sort.
- **Stock ledger** – every movement (purchase receipt, consumption, adjustment, return, transfer) is an append-only transaction with a running balance. Stock is never edited directly.
- **Atomic stock updates** – all movements go through one service that locks the item row (`SELECT … FOR UPDATE`) inside a database transaction and refuses to let stock go negative.
- **Suppliers** – directory with lead time, rating, GST number, item count and open PO count.
- **Purchase orders** – multi-line POs with tax and shipping; workflow Draft → Submitted → Approved → Partially received → Received (or Cancelled). Receiving goods posts stock automatically and updates the item's unit cost to the latest purchase price. Auto-numbered `PO-YYYYMM-0001`.
- **Material consumption** – record usage by department / work order; stock is deducted in the same transaction.
- **Low-stock alerts** – opened automatically when an item falls to its reorder level, resolved automatically when stock recovers. Acknowledge/resolve manually, or create a PO straight from an alert.
- **Reports** – dashboard KPIs and 6-month movement trend, stock valuation by category, consumption by item/department, purchase spend and supplier on-time delivery, opening/in/out/closing stock movement. All reports export to CSV.
- **JWT authentication** with automatic token refresh in the React app.

## Project structure

```
Supply Chain Management System/
├── docker-compose.yml          # MySQL 8 + Adminer
├── mysql/init/                 # one-time DB grants
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── scm/                    # settings, urls, pagination, error handler
│   ├── accounts/               # login, refresh, me, register, change password
│   ├── suppliers/              # Supplier model + API
│   ├── inventory/              # Category, Warehouse, Item, StockTransaction,
│   │   ├── services.py         #   MaterialConsumption, LowStockAlert
│   │   ├── management/commands/seed_demo.py
│   │   └── tests.py
│   ├── purchasing/             # PurchaseOrder, PurchaseOrderLine, workflow + receiving
│   └── reports/                # dashboard and report endpoints (JSON + CSV)
└── frontend/
    ├── package.json
    ├── vite.config.js          # proxies /api to Django on :8000
    └── src/
        ├── api/client.js       # Axios + JWT refresh
        ├── context/            # Auth and toast providers
        ├── components/         # Layout, Modal, BarChart, shared UI
        ├── pages/              # Dashboard, Items, Suppliers, POs, Consumption, …
        └── styles.css
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (for MySQL), or a local MySQL 8 server

## 1. Start MySQL

```bash
docker compose up -d
```

This starts MySQL on `localhost:3306` (database `scm_db`, user `scm_user`, password `scm_password`) and Adminer on http://localhost:8080 for browsing the database.

**Using your own MySQL instead?** Create the database and user:

```sql
CREATE DATABASE scm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'scm_user'@'localhost' IDENTIFIED BY 'scm_password';
GRANT ALL PRIVILEGES ON scm_db.* TO 'scm_user'@'localhost';
GRANT ALL PRIVILEGES ON test_scm_db.* TO 'scm_user'@'localhost';
FLUSH PRIVILEGES;
```

## 2. Backend

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

The API runs at http://127.0.0.1:8000/api/ and the Django admin at http://127.0.0.1:8000/admin/.

`seed_demo` loads 6 suppliers, 22 items, 10 purchase orders in different states and ~5 months of consumption history, and creates three users:

| Username | Password | Role |
|---|---|---|
| admin | Admin@12345 | superuser |
| manager | Manager@12345 | staff |
| staff | Staff@12345 | regular user |

Run `python manage.py seed_demo --reset` to wipe and reload the demo data. To start empty instead, skip `seed_demo` and run `python manage.py createsuperuser`.

## 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with `admin / Admin@12345`. In development, Vite proxies `/api` to Django, so no CORS setup is needed.

For a production build: `npm run build` (output in `frontend/dist/`). If the API is on a different host, set `VITE_API_URL` (see `frontend/.env.example`) and add the frontend origin to `CORS_ALLOWED_ORIGINS` in `backend/.env`.

## Running tests

```bash
cd backend
python manage.py test                       # against MySQL (needs test_scm_db grant)
DB_ENGINE=sqlite python manage.py test      # quick run without MySQL (macOS/Linux)
$env:DB_ENGINE="sqlite"; python manage.py test   # same on Windows PowerShell
```

## API reference

All endpoints are under `/api/` and require `Authorization: Bearer <access token>` except login and refresh. List endpoints are paginated (`?page=`, `?page_size=`), searchable (`?search=`) and sortable (`?ordering=field` or `-field`).

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login/` | `{username, password}` → `{access, refresh, user}` |
| POST | `/auth/refresh/` | `{refresh}` → new `{access, refresh}` |
| GET / PATCH | `/auth/me/` | Current user |
| POST | `/auth/register/` | Create user (admin only) |
| POST | `/auth/change-password/` | `{old_password, new_password}` |
| CRUD | `/suppliers/` | Filters: `is_active`, `city`, `country` |
| GET | `/suppliers/{id}/purchase_orders/` | POs for a supplier |
| CRUD | `/categories/`, `/warehouses/` | Reference data |
| CRUD | `/items/` | Filters: `category`, `preferred_supplier`, `warehouse`, `low_stock`, `out_of_stock`, `min_qty`, `max_qty`, `is_active`. POST accepts `opening_quantity`. |
| GET | `/items/low-stock/` | Items at or below reorder level |
| GET | `/items/{id}/transactions/` | Ledger for one item |
| GET / POST | `/transactions/` | Ledger; POST for `adjustment` (signed qty), `return`, `transfer_in`, `transfer_out` |
| GET / POST / PATCH | `/consumptions/` | Record material consumption (deducts stock) |
| GET | `/alerts/` | Filter `status=open\|acknowledged\|resolved` |
| POST | `/alerts/{id}/acknowledge/`, `/alerts/{id}/resolve/` | Alert actions |
| POST | `/alerts/rescan/` | Re-evaluate all items |
| CRUD | `/purchase-orders/` | Nested `lines`; editable/deletable only in draft |
| POST | `/purchase-orders/{id}/status/` | `{status: submitted\|approved\|draft\|cancelled}` |
| POST | `/purchase-orders/{id}/receive/` | `{receipts: [{line, quantity}], notes}` |
| GET | `/reports/dashboard/` | KPIs, PO status counts, trend, low stock, recent movements |
| GET | `/reports/stock-valuation/` | `?category=` |
| GET | `/reports/consumption/` | `?start=&end=` |
| GET | `/reports/purchases/` | `?start=&end=` |
| GET | `/reports/movement/` | `?start=&end=&only_moved=true` |

Add `?export=csv` to any report endpoint to download CSV.

## Design notes

- `Item.quantity_on_hand` is only changed by `inventory/services.py::apply_stock_movement`, which writes the ledger entry, updates the balance and syncs low-stock alerts in one transaction. Purchase receipts and consumption both call it, so a failure anywhere rolls back everything.
- Ledger entries are append-only (no update/delete via API or admin). Corrections are made with adjustment entries.
- Reports avoid MySQL `CONVERT_TZ`, so they work even when the MySQL server has no time-zone tables loaded.
- `scm/__init__.py` uses `mysqlclient` if installed and falls back to the pure-Python `PyMySQL` driver otherwise.
