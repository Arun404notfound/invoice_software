# TechGrah — Complete Setup Instructions

TechGrah is a GST + USD invoicing app for TechGrah Innovations. It runs
entirely on your Mac — no internet after setup, no accounts, no monthly
fees. This one file covers everything: building the app, installing it,
configuring it, and using it day to day.

There are two roles below. Most people only need **Part 2 onward** — a
`TechGrah.app` (or a `.dmg` containing it) was already built for you.

---

## Part 1 — Building the app (once, on a Mac with Apple Silicon)

Skip this if you already have `TechGrah.app` or `TechGrah.dmg`.

### Prerequisites

```bash
# Install Homebrew first: https://brew.sh
brew install node
xcode-select --install
```

### Build

```bash
git clone https://github.com/Arun404notfound/invoice_software.git
cd invoice_software
npm install          # a few minutes — downloads Electron + a bundled PostgreSQL
npm run desktop:mac
```

This needs **~4 GB of free disk space** during the build. Output:

```
dist/TechGrah-0.1.0-arm64.dmg          <- share this
dist/mac-arm64/TechGrah.app            <- or share this directly (zip it first)
```

To zip the `.app` instead of using the `.dmg`:

```bash
ditto -c -k --keepParent dist/mac-arm64/TechGrah.app TechGrah.zip
```

---

## Part 2 — Installing TechGrah

**From a `.dmg`:** double-click it, then drag **TechGrah** onto the
**Applications** shortcut in the window that opens.

**From a `.zip`:** unzip it, then drag **TechGrah.app** into your
**Applications** folder (Finder → Go → Applications).

**One-time step (both cases)** — the app isn't distributed through the App
Store, so macOS Gatekeeper blocks it until you clear that flag once:

```bash
xattr -cr /Applications/TechGrah.app
```

Now open **TechGrah** from Launchpad, Spotlight, or Applications — just
like any other app.

### First launch

Takes about 15–20 seconds (it's starting its own private database in the
background — nothing to configure). A dialog then shows your **login email
and password**:

- Write these down, or find them again anytime at
  `~/Library/Application Support/TechGrah/first-run-credentials.txt`
- Sign in with them

---

## Part 3 — First-time configuration

Go to **Settings** and fill in your real business details — these appear
on every invoice and PDF:

| Section | Fields |
| --- | --- |
| Business details | Legal name, trade name, GSTIN, PAN |
| Address | Address lines, city, state, pincode |
| Contact | Email, phone, website |
| Branding | Logo, signature image, brand color |
| Bank details | Bank name, account number, IFSC, UPI ID |
| Invoice defaults | Invoice number format (INR), invoice number format (USD/export), default tax rate %, default due days, default terms & notes text, export declaration text |

Invoice numbers are allocated automatically and never reused, in two
independent series:
- **INR invoices**: `TG/{FY}/{seq}` (e.g. `TG/2026-27/0001`)
- **USD / export invoices**: `TG/EXP/{FY}/{seq}` (e.g. `TG/EXP/2026-27/0001`)

Change either format string in Settings if you'd like a different scheme.

---

## Part 4 — Day-to-day usage

### Clients

**Clients → New Client.** Set the client's **Currency**:
- **INR** — standard GST invoices (CGST/SGST or IGST depending on state)
- **USD** — tax-free (export) billing: no GST is calculated or shown, no
  place-of-supply field, numbered in the separate USD series

### Invoices

1. **Invoices → New Invoice** → pick a client → **Create Draft**
2. Fill in line items (description, SAC code, quantity, unit, rate,
   discount %, tax % — tax % only appears for INR clients)
3. **Save Draft** as often as you like — a Draft can be freely edited
4. **Preview PDF** to check it
5. **Finalize Invoice** when ready — this permanently assigns the invoice
   number and locks it (no further edits; corrections happen via
   cancel + re-issue)
6. **Download PDF** / **Sign PDF (DSC)** on a finalized invoice

### Dashboard

The Dashboard shows, filterable by **period** (presets or a custom date
range), **client**, **currency**, and **status**:
- Invoiced / received / outstanding / overdue totals — per currency
  (INR and USD are never mixed together)
- A monthly invoiced-vs-received chart
- A per-client breakdown table

---

## Part 5 — Your data

Everything — the database, uploaded logos/signatures, your login — lives
in one folder:

```
~/Library/Application Support/TechGrah/
```

**Back up:** quit TechGrah, copy that whole folder somewhere safe (external
drive, cloud storage).

**Move to a new Mac:** install TechGrah there, quit it after the first
launch, replace its fresh data folder with your copied-over one, then
reopen.

---

## Part 6 — Updating TechGrah

A new version arrives as a new `.dmg`/`.zip`. To update:

1. Quit TechGrah
2. Drag the new `TechGrah.app` into Applications, replacing the old one
3. Run `xattr -cr /Applications/TechGrah.app` again
4. Reopen — your data folder (Part 5) is untouched

---

## Part 7 — Digital signatures (optional)

If invoices need to be signed with a physical DSC USB token (for legal
validity in India), that's a separate small local tool. See
[`HANDOVER_INSTRUCTIONS.md`](HANDOVER_INSTRUCTIONS.md) (Parts 2–3) and
[`local-signer/README.md`](local-signer/README.md).

---

## Part 8 — Troubleshooting

| Symptom | Fix |
| --- | --- |
| macOS says the app "can't be opened" / is from an unidentified developer | Run `xattr -cr /Applications/TechGrah.app`, or right-click the app → **Open** the first time. |
| App shows "TechGrah couldn't start" | Note the exact error text and send it along — it's almost always fixable. |
| Building on an Intel Mac | The default build targets Apple Silicon only. See the "Intel (x64)" row in `BUILD_ON_MAC.md`. |
| Ran out of disk space while building | Free ~4 GB (`rm -rf dist`, `npm cache clean --force`, empty Trash) and re-run `npm run desktop:mac`. |

---

## Good to know

- **Fully offline at runtime** — no data leaves your Mac. Email sending and
  online payments are not wired up (they're logged locally / disabled by
  default).
- **Single admin login** — one email/password for the whole business; there's
  no multi-user access yet.
- Deeper technical detail lives in [`README.md`](README.md) and
  [`BUILD_ON_MAC.md`](BUILD_ON_MAC.md) if you ever need it.
