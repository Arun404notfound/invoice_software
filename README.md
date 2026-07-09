# TechGrah Invoice & Billing

GST-compliant invoicing and billing app for TechGrah Innovations. Next.js 16
(App Router) + TypeScript strict + Prisma/PostgreSQL + Tailwind + shadcn/ui.

This repo is being built in delivery steps (see `Delivery status` below).
Latest step covers: **clients, invoice builder, GST calculation, PDF
generation, send/email, and the public share page.**

## Stack

- Next.js 16 (App Router), TypeScript strict
- PostgreSQL via Prisma ORM 7 (driver adapter: `@prisma/adapter-pg`)
- Tailwind CSS v4 + shadcn/ui
- bcryptjs for password hashing, DB-backed session cookies (no JWT)
- Zod for input validation
- Vitest for unit tests

## Prerequisites

- Node.js 20+
- PostgreSQL 16, either:
  - **Docker Desktop** (recommended — `docker-compose.yml` is provided), or
  - **A native local install** (what this repo was actually developed
    against, since Docker Desktop's backend wasn't available in that
    environment — see below)
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

3. **Start PostgreSQL**

   Option A — Docker Compose (matches `.env.example` defaults exactly):

   ```bash
   docker compose up -d
   ```

   Option B — native install: install PostgreSQL 16, then create a role and
   database matching your `.env`:

   ```sql
   CREATE ROLE techgrah WITH LOGIN PASSWORD 'techgrah' CREATEDB;
   CREATE DATABASE techgrah_invoice OWNER techgrah;
   ```

   (`CREATEDB` is required on the role because `prisma migrate dev` creates
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
   change these before using this anywhere but local dev).

6. **Run the dev server**

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000), sign in, and fill
   in your business profile under **Settings**.

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
- [ ] Invoice list/detail + manual payments + dashboard
- [ ] Razorpay links + webhooks + reminders
- [ ] Recurring + quotations + credit notes + reports

## Where e-invoicing (IRN/QR) would plug in

Out of scope for this build, but noted for future reference: an IRN/QR
generation step would sit between `DRAFT → SENT` (calling the GST e-invoice
API to obtain an IRN + signed QR code before the PDF is finalized and the
invoice is frozen), with the IRN/QR stored on the `Invoice` row and rendered
into the PDF template.
