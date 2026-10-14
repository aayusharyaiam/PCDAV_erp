# Beginner Render deployment guide

**Purpose:** deploy the current Level 4 demo for synthetic-data review only.

> **Do not use this guide to import the live school database or collect real money.** The demo has financial controls, but production approval, school UAT, external bank/refund settlement, private object storage, backups/restore, printer approval and live migration are still open.

## 1. What will be deployed

Create three Render resources from this repository. Follow the requested beginner order: **frontend service first, backend service second, database third**. The backend service will remain unhealthy until the database is connected and migrated; that is expected during the first two steps.

1. **Frontend Web Service** — Next.js staff application from `frontend/`.
2. **Backend Web Service** — NestJS API from `backend/`.
3. **PostgreSQL database** — Render Postgres, separate from the backend service.

The backend owns the schema and migrations. The frontend never connects directly to PostgreSQL. The frontend talks to the backend through same-origin `/api/v1` requests, and Next.js proxies those requests using `API_INTERNAL_URL`.

For the first demo, use `APP_MODE=demo`. This keeps `NODE_ENV=production` and secure cookies while explicitly disabling document uploads when private S3 storage is not configured. Do not set `STORAGE_DRIVER=local` and expose public uploads as a substitute for object storage.

## 2. Before clicking Deploy

You need:

- A GitHub account with access to `aayusharyaiam/PCDAV_erp`.
- A Render account connected to GitHub.
- The `main` branch pushed with the current changes.
- A local password for the first synthetic Superadmin. Use a new password; do not place it in Git or this document.
- An installed browser for the optional live Playwright test.

Render Free resources are suitable only for this disposable demo. Free web services sleep, and free databases have limited storage/lifetime and no production backup guarantee. Use a paid, always-on plan with managed backups before any real school data is considered.

## 3. Create the frontend first

This lets you confirm that the Next.js service builds independently. It will not perform API actions until the backend is deployed.

1. Open the Render dashboard and choose **New → Web Service**.
2. Connect the GitHub repository `aayusharyaiam/PCDAV_erp`.
3. Select branch `main`.
4. Set the service name to something recognizable, for example `pcdav-frontend-demo`.
5. Set **Root Directory** to `frontend`.
6. Set **Environment** to `Node`.
7. Set **Build Command** to:

   ```text
   npm ci && npm run build
   ```

8. Set **Start Command** to:

   ```text
   npm start
   ```

9. Choose the smallest plan suitable for a demo.
10. Do not add a public secret or database URL to the frontend.
11. Add this temporary environment variable:

   ```text
   API_INTERNAL_URL=https://example.invalid
   ```

   Replace it later with the backend URL. The frontend can build with this placeholder because it is only used when the Next.js proxy receives a request.
12. Create the service and wait for **Live**.
13. Open the generated `onrender.com` URL. A login screen or a clear API-unavailable message is expected before the backend is ready.

If the build fails, open the Render deploy log and compare the failed command with `frontend/README.md`. Do not change package versions or install an unrelated starter kit.

## 4. Create the backend service

Create the backend service before creating the database so the three resources are visible in the requested order.

1. Choose **New → Web Service**.
2. Select the same GitHub repository and branch `main`.
3. Set the service name to `pcdav-backend-demo`.
4. Set **Root Directory** to `backend`.
5. Set **Build Command** to:

   ```text
   npm ci && npm run build
   ```

6. Set **Start Command** to:

   ```text
   npm run start:prod
   ```

7. Set the health-check path to:

   ```text
   /health
   ```

8. Add these environment variables for now:

   ```text
   NODE_ENV=production
   APP_MODE=demo
   DATABASE_URL=<add after the database is created>
   FRONTEND_ORIGIN=<frontend Render URL>
   SESSION_SECRET=<long random private value>
   CSRF_SECRET=<long random private value>
   ```

   Keep the existing application-specific defaults from `backend/.env.example` unless Render requires an explicit value. `PORT` is supplied by Render; do not hard-code a public port.
9. Create the backend service and wait for the build. It may show unhealthy until the database is connected and migrated.

## 5. Create the Render PostgreSQL database

The database must exist before the backend can pass its health check. This is the one dependency that cannot be skipped even if the frontend was created first.

1. In Render, choose **New → PostgreSQL**.
2. Name it, for example, `pcdav-postgres-demo`.
3. Select the same region as the frontend/backend when possible.
4. Choose a demo-appropriate plan and review its expiry, storage and backup limitations.
5. Create the database and wait until it is available.
6. Open the database's **Connect** section.
7. Copy the **Internal Database URL** for the backend service. Keep the URL private; it contains credentials.

Do not commit this URL, paste it into a Markdown file, or send it in a chat transcript. Render can inject it directly into the backend environment later.

After the database is created, return to the backend service and set `DATABASE_URL` from the database's **Internal Database URL**. The backend can then connect, but apply migrations before expecting `/health` to be ready.

## 6. Apply database migrations

The repository uses reviewed Prisma migrations. Never use `prisma db push` against the Render database.

### Preferred method: Render Shell

If the selected Render plan exposes **Shell**:

1. Open the backend service.
2. Open **Shell**.
3. Run:

   ```bash
   npm run db:migrate
   ```

4. Confirm that Prisma reports all 13 migrations applied and no pending migrations.
5. Restart the backend service.

### Alternative method: local terminal with the external database URL

If Render does not provide Shell, use the database's **External Database URL** from a trusted local terminal. Do not put the URL in a file tracked by Git:

```bash
cd backend
DATABASE_URL='<private Render external database URL>' npm run db:migrate
```

The external URL may be blocked by a network policy. If so, use Render Shell or a temporary trusted environment; do not disable database security for convenience.

After migration, open:

```text
https://<backend-service>.onrender.com/health
```

The endpoint must return a successful health response before testing login.

## 7. Create the first synthetic Superadmin

The seed command requires a password supplied at runtime. Do not commit it.

With Render Shell:

```bash
SEED_SUPERADMIN_PASSWORD='<new private demo password>' npm run db:seed
```

To create the seeded synthetic student and fee data for this demo, use:

```bash
NODE_ENV=production APP_MODE=demo \
SEED_SUPERADMIN_PASSWORD='<new private demo password>' \
npm run db:seed -- --demo
```

`APP_MODE=demo` is required for this production-mode demo command. Without it, the seed intentionally refuses to create synthetic records while `NODE_ENV=production` is set.

Record the generated demo login in a private password manager or local note, not in the repository. If the seed reports that a Superadmin already exists, do not overwrite it blindly; use the existing private demo credentials or follow the application's password-reset procedure.

## 8. Point the frontend to the backend

1. Return to the frontend Render service.
2. Change `API_INTERNAL_URL` from the placeholder to:

   ```text
   https://<backend-service>.onrender.com
   ```

3. Save the environment variable and trigger a new deploy.
4. Confirm the backend `FRONTEND_ORIGIN` exactly matches the frontend URL, including `https://` and excluding a trailing slash unless the application specifically expects one.
5. Open the frontend URL in a private browser window.
6. Sign in with the synthetic Superadmin or seeded demo staff account.

If the browser shows `401`, check that the frontend and backend URLs are correct and that cookies are not being blocked. If the browser shows a proxy error, check `API_INTERNAL_URL` and the backend `/health` endpoint. Do not solve a cookie problem by disabling CSRF or secure cookies in production mode.

## 9. Beginner synthetic-data verification

Perform these checks in order. Use only generated/demo records.

### Login and navigation

1. Sign in.
2. Confirm the demo banner is visible.
3. Confirm the role-aware menu contains the areas allowed for the signed-in account:
   - Finance requests: `/finance/requests`
   - Finance policy: `/finance/policy`
   - Reports: `/reports`
   - Statements: `/statements`
   - Collection: `/fees/collect`
   - Receipts: `/receipts`
   - Cashier: `/cashier`
4. Open the browser developer console only if troubleshooting; never copy cookies or authorization values into a ticket or report.

### Finance policy

1. Open `/finance/policy` as Admin or Superadmin.
2. Confirm the page clearly labels the values as demo policy.
3. Review the receipt prefix, receipt scope, advance-credit setting, previous-session rule and bounce fee.
4. Change one value with a reason, save, and confirm the version increments.
5. Do not enter a real school rate unless the value is synthetic and the change is being used for testing.

### Collection and receipt

1. Open `/cashier` and create a synthetic shift for today's business date.
2. Open `/fees/collect` and search for a seeded synthetic student.
3. Create a quote. Try both automatic allocation and explicit fee/store selection if synthetic dues exist.
4. Confirm the preview shows amount received, allocations, outstanding balance and available credit separately.
5. Record one synthetic cash payment using a unique idempotency command generated by the UI.
6. Open `/receipts` and verify the immutable student/payer/allocation snapshot.
7. Open the PDF status control. A ready job should offer a download; a pending/failed job should offer status/retry without changing the payment.
8. Use browser reprint only with a reason. Confirm the reprint does not create a second payment.

### Correction approval

1. Sign in as Accountant and submit a synthetic correction request from the receipt/payment screen.
2. Sign in as Admin or Superadmin.
3. Open `/finance/requests` and inspect the frozen request details.
4. Reject one test request and approve a separate test request with a reason.
5. Confirm the approved correction is applied once and the original receipt/history remains visible.
6. Confirm a stale request is not applied after its financial state changes.

### Cash movements and reports

1. On the open shift, record a synthetic deposit or handover.
2. As Admin, record a small synthetic expense with a reason and reference.
3. Open `/statements` and confirm payment, allocation, credit and correction lineage.
4. Open `/reports` and compare collections, dues and journal totals.
5. Close the shift with the displayed counted amount. Provide a reason for any variance.
6. Confirm the closed shift cannot be modified.

## 10. Optional automated live check

Run this only against a disposable local database or a deliberately isolated demo database. The live test refuses non-local database hosts by default; do not weaken that guard for production data.

From the repository root, with the local backend and frontend running:

```bash
E2E_DATABASE_URL='postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public' \
  PLAYWRIGHT_CHROMIUM_PATH='/path/to/installed/chrome' \
  npm --prefix frontend run test:e2e -- \
  tests/level-4-live.spec.ts tests/level-4-contracts.spec.ts --workers=1
```

The expected current result is 34 passing tests: 33 mocked Level 4 contracts and one live synthetic flow. Append-only financial history may remain in the disposable test database; generated fixture accounts are disabled rather than deleting immutable financial records. Run the backend integration suite against a separate fresh disposable schema, not the seeded demo schema, because the application intentionally permits only one Superadmin.

## 11. If deployment fails

Check these items in order:

1. **Build failure:** verify the service root directory is exactly `frontend` or `backend`, then compare the command with the relevant README.
2. **Backend unhealthy:** open `/health`, confirm `DATABASE_URL`, apply migrations, and inspect database connection errors.
3. **Frontend cannot log in:** verify `API_INTERNAL_URL` and backend `FRONTEND_ORIGIN` match the actual Render URLs.
4. **CSRF or cookie error:** use HTTPS URLs, a private browser window and matching origins. Do not disable CSRF or secure cookies.
5. **PDF unavailable:** inspect the PDF status endpoint. A retryable PDF failure must not be fixed by collecting the payment again.
6. **Migration failure:** stop, preserve the error, check migration status and database connectivity. Do not delete migration history or run `db push`.
7. **Data concern:** stop all testing and verify that only synthetic records are present before continuing.

## 12. Production gate

This demo is not a production release. Before any live data or real money, obtain written approval for the unresolved roadmap decisions, use paid hosting with backups/restore, configure private object storage and a separate durable worker, approve receipt fonts/printer output, complete school UAT, reconcile an authorized import, rehearse recovery/cutover, and enable external bank/refund settlement only after its provider controls are verified.
