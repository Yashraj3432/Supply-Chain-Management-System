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


## 1. Start MySQL

```bash
docker compose up -d
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


