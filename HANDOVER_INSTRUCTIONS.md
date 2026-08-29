# TechGrah Invoice App — Setup & DSC Signing Guide

This covers getting the invoicing app running on your Mac, and testing that
invoices signed with your DSC (Digital Signature Certificate) USB token come
out as a real, valid digital signature — verifiable in Adobe Acrobat Reader.

Everything runs locally on your machine. There's no server to deploy, no
account to create, nothing to pay for except your existing DSC token.

## What's in this build

Working now: clients, invoice creation with GST calculation, PDF generation,
invoice finalization (locks the invoice and assigns its permanent number),
and DSC PDF signing.

Not built yet (later steps): a payments/dashboard view, Razorpay payment
links, recurring invoices, quotations, and credit notes. Don't expect those
yet — this handover is about the invoicing + signing core.

## Part 1 — Install the app

### Prerequisites

- A Mac (required — the DSC token's driver only runs on macOS)
- [Node.js 20+](https://nodejs.org)
- [Homebrew](https://brew.sh)

### Steps

1. Unzip the project folder anywhere you like, then open Terminal in that folder.

2. Install dependencies (this also downloads a bundled Chromium for PDF
   generation, ~200MB — normal, one-time):

   ```bash
   npm install
   ```

3. Set up your environment file:

   ```bash
   cp .env.example .env
   ```

   Open `.env` in any text editor. The defaults work as-is; the one thing
   worth changing before real use is `ADMIN_PASSWORD`.

4. Install and start Postgres:

   ```bash
   brew install postgresql@16
   brew services start postgresql@16
   createuser -s techgrah
   psql -U techgrah -d postgres -c "ALTER ROLE techgrah WITH PASSWORD 'techgrah' CREATEDB;"
   createdb -O techgrah techgrah_invoice
   ```

5. Create the database tables:

   ```bash
   npm run db:migrate
   ```

6. Create your admin login + starter business profile:

   ```bash
   npm run db:seed
   ```

   Login is whatever `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`
   (defaults to `founder@techgrah.com` / `ChangeThisPassword123!`).

7. Start the app:

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000), log in, and fill in
   your real business details under **Settings** (GSTIN, address, bank
   details, logo, signature image).

Leave this Terminal tab running. You'll add a second one for signing next.

## Part 2 — Test DSC signing (do this in two stages)

The signing service is a separate small program (`local-signer/`) that talks
to your USB token. **Test it in "mock" mode first** — this confirms the
whole plumbing works using a fake throwaway certificate, with zero risk to
your actual token, before you touch the hardware at all.

### Stage A — Mock mode (no token needed)

Open a **second** Terminal tab in the project folder:

```bash
cd local-signer
npm install
npm run generate-test-cert
cp .env.example .env
npm start
```

You should see `DSC local signer listening on http://127.0.0.1:7734 (mode: mock)`.

Back in the app (first tab still running), open any finalized invoice and
click **"Sign PDF (DSC)"**. It should download a signed PDF immediately.
That confirms the full round trip — PDF built, digest sent to the signer,
signature spliced back in — works correctly on your machine. The signature
itself is **not real yet** (it's a throwaway test cert), so don't send this
particular PDF to a client.

*(This exact flow was already re-tested end-to-end before this handover,
down to independently re-deriving the cryptographic digest from the PDF and
verifying the RSA signature against the certificate — so stage A is
expected to just work.)*

### Stage B — Real token

Stop the mock signer (`Ctrl+C` in that tab), then:

1. **Install your DSC's driver** — whatever came from Watchdata or your
   Certifying Authority for the ProxKey token.

2. **Find the driver file** (a `.dylib`):

   ```bash
   find /usr/local/lib /Library -iname "*pkcs11*.dylib" 2>/dev/null
   ```

3. **Plug in your token**, then confirm it's visible:

   ```bash
   export PKCS11_MODULE_PATH=/path/you/found/above.dylib
   npm run list-slots
   ```

   This should print your token's slot and your certificate's subject name
   (your name / business name, from when the DSC was issued). If this
   doesn't work, nothing past this point will — sort this out first. Common
   snags: wrong driver architecture for your Mac's chip (Apple Silicon vs
   Intel — check what your CA's driver docs say), or the token needs to be
   plugged in before the driver's background service starts.

4. **Run the real signer**:

   ```bash
   SIGNER_MODE=pkcs11 PKCS11_MODULE_PATH=/path/you/found/above.dylib npm start
   ```

   You'll be asked for your token PIN once (typed input is hidden). It's
   never written to disk or sent anywhere over the network.

5. **Sign a real invoice** from the app the same way as Stage A.

## Part 3 — Verify the signature in Adobe Acrobat Reader

Open the downloaded, signed PDF in **Adobe Acrobat Reader** (not Preview —
macOS's built-in viewer doesn't show signature validity the same way).
Click the signature panel. Acrobat will report:

- **Signature valid** — the PDF hasn't been altered since signing, and the
  signature was produced by the certificate on your token. This is the
  cryptographic guarantee, and it's the part this whole pipeline exists to
  produce correctly.
- **Certificate trust** — likely shows as "not trusted" unless your CA's
  root certificate happens to already be in your OS/Acrobat's trust store.
  That's expected and not a bug here — it's a separate question from
  whether the signature itself is valid, and is generally resolved by
  installing your CA's root/intermediate certificates into Acrobat's
  trusted list (your CA's site will have these).

If Acrobat says the signature is **invalid** (not just untrusted), stop and
get in touch before signing real invoices — that would mean something in
the PDF changed after signing, which shouldn't happen with this flow but is
worth catching immediately.

## If something doesn't work

- `local-signer/README.md` has more detail on every step above, including
  security notes and troubleshooting for the PKCS#11 driver specifically.
- The one part of this whole system that couldn't be tested before your
  hardware arrived is the real token talking to the real driver (Stage B,
  step 3 onward) — everything else (the web app, PDF generation, GST math,
  the signing protocol and cryptography itself) has been verified.
