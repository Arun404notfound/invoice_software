# TechGrah Invoice & Billing

GST-compliant invoicing and billing app for TechGrah Innovations. Next.js 16
(App Router) + TypeScript strict + Prisma/PostgreSQL + Tailwind + shadcn/ui.

**Runs entirely locally, for personal use — no hosting required.** There's
no dependency on Vercel or Supabase; those only matter if you later decide
to deploy this somewhere reachable outside your own machine. Everything
below assumes you're running the app, its database, and (when signing
invoices) the [DSC local signer](local-signer/README.md) all on the same
machine — a Mac, since that's what the DSC token's driver targets.

This repo is being built in delivery steps (see `Delivery status` below).
Latest step covers: **clients, invoice builder, GST calculation, PDF
generation, send/email, the public share page, DSC PDF signing, USD
(tax-free) billing, and a filterable dashboard.**

## Stack

- Next.js 16 (App Router), TypeScript strict
- PostgreSQL via Prisma ORM 7 (driver adapter: `@prisma/adapter-pg`)
- Tailwind CSS v4 + shadcn/ui
- bcryptjs for password hashing, DB-backed session cookies (no JWT)
- Zod for input validation
- Vitest for unit tests

## Prerequisites

- Node.js 20+
- PostgreSQL 16+, installed natively (no Docker) — see step 3 below for the
  exact commands on macOS. On Windows, the EnterpriseDB installer (or
  `winget install PostgreSQL.PostgreSQL.17`) works; then create the role and
  database with `psql` / `createdb` exactly as shown below.
- `npm install` downloads a bundled Chromium for Puppeteer (~200MB) — this
  is expected and only happens once.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` if you want non-default credentials. See [Environment
   variables](#environment-variables) below.

3. **Install and start PostgreSQL natively**

   On macOS, via [Homebrew](https://brew.sh):

   ```bash
   brew install postgresql@16
   brew services start postgresql@16
   ```

   Then create a role and database matching your `.env` (defaults shown —
   change if you edited `.env`):

   ```bash
   createuser -s techgrah
   psql -U techgrah -d postgres -c "ALTER ROLE techgrah WITH PASSWORD 'techgrah' CREATEDB;"
   createdb -O techgrah techgrah_invoice
   ```

   (`CREATEDB` on the role is required because `prisma migrate dev` creates
   a throwaway shadow database to diff against.)

4. **Run migrations** (creates all tables from `prisma/schema.prisma`)

   ```bash
   npm run db:migrate
   ```

5. **Seed the database** (creates the admin user + a sample business profile)

   ```bash
   npm run db:seed
   ```

   Admin login credentials come from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in
   `.env` (defaults: `founder@techgrah.com` / `ChangeThisPassword123!` —
   change these before using this for real invoices).

6. **Run the dev server**

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000), sign in, and fill
   in your business profile under **Settings**.

7. **(Only when you need to sign an invoice)** start the DSC local signer
   alongside the dev server — see [local-signer/README.md](local-signer/README.md)
   for the full setup (driver install, PIN entry, mock-vs-real-token modes):

   ```bash
   cd local-signer && npm start
   ```

## Environment variables

See `.env.example` for the full list with defaults. Summary:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Used by `docker-compose.yml` and to build `DATABASE_URL` |
| `SESSION_SECRET` | Reserved for future use signing/namespacing session data |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | Used only by `npm run db:seed` to create the single admin user |
| `APP_URL` | Base URL used to build the public share link embedded in send emails |
| `SMTP_*` | Outbound email on Send. **If `SMTP_HOST` is unset, emails are logged to the console instead of sent** — this is the current local-dev state; set real credentials to actually deliver mail |
| `RAZORPAY_*` | Payments — wired up in the Razorpay delivery step |

No secrets are committed. `.env` is git-ignored; `.env.example` is the
template.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm run start` | Production build / start |
| `npm run lint` | ESLint |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:migrate` | Create/apply a migration (`prisma migrate dev`) |
| `npm run db:seed` | Run `prisma/seed.ts` |
| `npm run db:studio` | Open Prisma Studio |

## Architecture notes

- **Money**: all amounts are stored and computed as integer paise (`lib/money.ts`).
  Never floats. `rupeesToPaise` parses decimal strings directly (not `rupees * 100`)
  to avoid IEEE-754 float drift on values like `1234.50`. Display formatting
  (`formatINR`) uses `Intl.NumberFormat("en-IN", ...)` for Indian digit
  grouping (`₹1,23,456.00`).
- **Auth**: single admin user (multi-user-ready `User` table), email +
  password (bcryptjs), DB-backed `Session` table + an httpOnly cookie holding
  only an opaque token — not a JWT, so sessions are instantly revocable.
  `lib/auth/session.ts` has the read side (`getCurrentUser`, safe from Server
  Components); the write side (`setSessionCookie`/`clearSessionCookie`) is
  only called from Route Handlers, per Next.js's rule that cookies can only
  be mutated there. Route protection happens in `app/(app)/layout.tsx`
  (a server component that redirects to `/login` if there's no valid
  session) rather than `proxy.ts` (Next 16's renamed `middleware.ts`) —
  Next's own guidance is to keep proxy-level checks as a fast-path only and
  do the real check in a data-access layer.
- **Prisma 7**: the schema has no `datasource.url` — Prisma 7 requires a
  driver adapter at the `PrismaClient` call site instead (`lib/prisma.ts`
  uses `@prisma/adapter-pg`). The generated client lives at
  `lib/generated/prisma/` (git-ignored, regenerate with `npm run db:generate`)
  and is imported from `lib/generated/prisma/client`, not the package root.
- **File uploads** (logo/signature): written to `public/uploads/` on local
  disk via a Route Handler using the native `request.formData()` API — no
  multipart-parsing library needed. This is the point where S3-compatible
  object storage would plug in for a production/multi-instance deployment.
- **Multi-currency / USD billing**: an invoice's `currency` (defaulted from
  the client, changeable while it's a Draft) drives everything. `INR` is the
  domestic GST currency; every other currency (`USD` today, see
  `SUPPORTED_CURRENCIES` in `lib/money.ts`) is billed **tax-free** — the
  builder hides the place-of-supply, export toggle and per-line tax fields,
  `calculateInvoice` forces 0% and skips the whole-rupee round-off, the PDF
  says "INVOICE" instead of "TAX INVOICE" and drops the GST columns/breakup,
  and the amount-in-words switches to the international scale
  ("US Dollars … Cents"). Tax-free invoices are numbered in their own series
  (`usdInvoiceNumberFormat`, default `TG/EXP/{FY}/{seq}`, its own sequence
  counter) so the domestic GST sequence stays gapless. Money is still stored
  as integer minor units — cents and paise are both 1/100.
- **Dashboard** (`app/(app)/page.tsx`, `lib/dashboard.ts`): filterable by
  period (presets + custom range), client, currency and status via URL
  search params. `lib/dashboard.ts` holds the pure range-resolver and
  aggregation (per-currency invoiced/received/outstanding/overdue, per-client
  rollup, gap-filled monthly series); the page only queries and renders.
  Mixed currencies are never summed — each currency gets its own stat block
  and Recharts bar chart.
- **GST calculation** (`lib/invoice-calc.ts`): pure function, `decimal.js`
  used only as scratch space for qty × rate / percentage math — every value
  crossing a function boundary is integer paise. Same-state → CGST+SGST
  split (rounded so the two halves always sum exactly to the line's tax,
  never off-by-a-paise); different state → IGST; export mode forces 0%
  regardless of the line's entered rate. The overall invoice-level discount
  is distributed proportionally across tax-rate buckets (with any rounding
  remainder dumped on the last bucket) so the rate-wise CGST/SGST/IGST
  breakup table on the PDF stays internally consistent.
  `recalculateInvoice()` re-derives that same breakdown from a persisted
  invoice's line items at PDF-render time — this is the single source of
  truth rather than a separately stored snapshot that could drift.
- **Invoice numbering** (`lib/invoice-number.ts`): allocated only on Send,
  not on Draft creation — `Invoice.number`/`financialYear` are nullable so
  a discarded Draft never burns a sequence number. Uses a real
  `SELECT ... FOR UPDATE` row lock (via `$queryRaw`, since Prisma has no
  native row-lock API) on the `Sequence` table inside a transaction, so
  concurrent sends can't collide — verified with a real concurrent-DB test,
  not a mock.
- **PDF** (`lib/pdf/`): Puppeteer renders HTML built by
  `render-invoice-html.ts` (Charcoal/Classic templates). Logo/signature
  images are read from `public/uploads/` and inlined as base64 data URIs
  before rendering, so Puppeteer never depends on the dev server being
  network-reachable from itself. A single Chromium instance is reused
  across requests (module-level singleton) rather than relaunched per PDF.
- **Email** (`lib/email.ts`): if `SMTP_HOST` is unset, Send still completes
  end-to-end — the email is logged to the console instead of thrown away
  silently. Set real SMTP credentials to actually deliver mail.
- **GST**: `lib/constants/gst-states.ts` has the official 38 GST state/UT
  codes. GSTIN/PAN formats are validated with the regexes from the product
  spec (`lib/validations/common.ts`).
- **DSC PDF signing** (`lib/pdf/signature/`, `app/api/invoices/[id]/sign/*`,
  [`local-signer/`](local-signer/README.md)): the token holding the DSC
  private key is a physical USB device, so the actual RSA signing operation
  can't happen inside this app's server — it happens in a small separate
  service (`local-signer/`) that talks to the token over PKCS#11. Signing is
  a two-step handshake: `prepare` builds the PDF with an empty signature
  placeholder and stores it server-side keyed by a session id (so the exact
  bytes being signed don't depend on Puppeteer producing byte-identical
  output twice), then `complete` splices the CMS/PKCS#7 signature `local-signer`
  returned back into those stored bytes.

## Invoice status state machine

Enforced in exactly one place server-side: `lib/invoice-state-machine.ts`
(`assertTransition`, called from every route that mutates `Invoice.status`).
Covered by an exhaustive test over all 49 (7×7) from/to combinations.

```
DRAFT ──────► SENT ──┬──► VIEWED ──┬──► PARTIALLY_PAID ──► PAID
                      │             │
                      ├──► PARTIALLY_PAID ──► PAID
                      │             │
                      ├──► PAID     ├──► PAID
                      │             │
                      ├──► CANCELLED├──► CANCELLED
                      │             │
                      └──► OVERDUE ─┴──► OVERDUE ──┬──► PARTIALLY_PAID ──► PAID
                                                     └──► CANCELLED

Terminal states: PAID, CANCELLED
OVERDUE is derived nightly (dueDate < today, unpaid) and persisted so
history stays queryable.
```

Legal transitions:

- `DRAFT → SENT`
- `SENT → VIEWED | PARTIALLY_PAID | PAID | CANCELLED | OVERDUE`
- `VIEWED → PARTIALLY_PAID | PAID | CANCELLED | OVERDUE`
- `OVERDUE → PARTIALLY_PAID | PAID | CANCELLED`
- `PARTIALLY_PAID → PAID | OVERDUE`

Invoices are immutable once `SENT`. Corrections happen via cancel + re-issue
(`Invoice.revisionOfId`) or, in a later step, a Credit Note.

## Delivery status

- [x] Schema + migrations + seed + auth + settings
- [x] Clients + invoice builder + state machine + PDF + public page + email send
- [x] DSC (Digital Signature Certificate) PDF signing — see [local-signer/README.md](local-signer/README.md)
- [x] USD (tax-free) billing + filterable dashboard (revenue / receivables / by-client)
- [ ] Invoice list/detail + manual payments
- [ ] Razorpay links + webhooks + reminders
- [ ] Recurring + quotations + credit notes + reports

## Where e-invoicing (IRN/QR) would plug in

Out of scope for this build, but noted for future reference: an IRN/QR
generation step would sit between `DRAFT → SENT` (calling the GST e-invoice
API to obtain an IRN + signed QR code before the PDF is finalized and the
invoice is frozen), with the IRN/QR stored on the `Invoice` row and rendered
into the PDF template.
