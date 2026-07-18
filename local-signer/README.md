# DSC local signer

A small HTTP service that runs alongside the invoice app on **the Mac your
Watchdata ProxKey USB token is plugged into** and signs invoice PDF digests
on request. It's a separate service (not folded into the Next.js app)
because it depends on a native PKCS#11 driver binding that needs its own
build toolchain (Xcode Command Line Tools) — keeping it isolated means the
main app's build never has to know that dependency exists.

Run both from the same Mac: `npm run dev` in the repo root for the invoice
app, `npm start` in here for the signer. The "Sign PDF" button calls this
service at `http://127.0.0.1:7734` (configurable via
`NEXT_PUBLIC_DSC_SIGNER_URL` in the main app's `.env`) — plain loopback HTTP,
since both processes are on the same machine and nothing here is exposed to
the network.

(If you ever do deploy the invoice app somewhere like Vercel, this same
split still applies and still runs on your Mac — the deployed server has no
USB port for the token either way.)

## Two modes

- **`SIGNER_MODE=mock`** (default) — signs with a throwaway software test
  certificate instead of the real token. Use this to confirm the whole
  prepare → sign → download flow works before touching hardware. **Never use
  mock-signed PDFs for real invoices** — they're not a legally valid
  signature, just a plumbing test.
- **`SIGNER_MODE=pkcs11`** — signs with your actual DSC token via PKCS#11.
  This is the real thing, and the only part of this service that needs
  testing on your actual Mac with the token plugged in — nothing about
  PKCS#11/hardware-token behavior can be verified without it.

## Quick start (mock mode, no hardware needed)

```sh
cd local-signer
npm install
npm run generate-test-cert   # one-time, writes .testcert/ (gitignored)
cp .env.example .env         # SIGNER_MODE=mock by default
npm start
```

Then in another terminal:

```sh
curl http://127.0.0.1:7734/health
```

You should see `{"ok":true,"mode":"mock",...}`. Open an invoice in the app
and click "Sign PDF (DSC)" — it'll download a signed PDF. (It won't be a
*real* signature yet — that's expected in mock mode.)

## Switching to the real token

### 1. Install the Watchdata driver

Install whatever driver/utility came with your ProxKey token (from
Watchdata or your Certifying Authority's setup disc/download). This installs
a PKCS#11 module — a `.dylib` file — somewhere on disk.

### 2. Find your driver's `.dylib` path

The exact path varies by driver version. After installing, search for it:

```sh
find / -iname "*wd*pkcs11*.dylib" 2>/dev/null
find / -iname "*proxkey*" -iname "*.dylib" 2>/dev/null
find /usr/local/lib /Library -iname "*pkcs11*.dylib" 2>/dev/null
```

Common install locations to check first: `/usr/local/lib/`,
`/Library/Watchdata/`, or wherever the installer's docs say.

### 3. Verify the token is visible (before touching the full server)

```sh
export PKCS11_MODULE_PATH=/path/you/found/above.dylib
npm run list-slots
```

This should print your token's slot, label, and the certificate(s) on it —
including the subject name (should be your name / your business's, from
when the DSC was issued). If this doesn't work, nothing downstream will
either — get this working first. Common issues:

- **"No slots" / driver won't load**: wrong architecture (Apple Silicon vs
  Intel build of the driver) or the driver needs Rosetta — check what your
  CA's driver docs say for your Mac's chip.
- **Permission errors**: some drivers need the token plugged in *before* the
  driver's background service starts; try re-plugging the token and
  retrying.

### 4. Run the real server

```sh
SIGNER_MODE=pkcs11 PKCS11_MODULE_PATH=/path/you/found/above.dylib npm start
```

You'll be prompted for your token's PIN at startup (typed input is hidden).
The server keeps a single logged-in session open for as long as it runs, so
you only enter the PIN once per server restart — not per invoice.

Verify with `curl http://127.0.0.1:7734/health` — `subject` should show your
real DSC's certificate subject, not "Mock DSC Test Signer".

### 5. Sign a real invoice and verify it properly

After signing an invoice from the app, open the downloaded PDF in **Adobe
Acrobat Reader** (not just any PDF viewer) and check the signature panel —
Acrobat will tell you plainly whether the signature is valid and whether the
certificate chain is trusted. That's the real test; nothing in this repo can
confirm that without your actual token in hand.

If Acrobat shows the signature as valid but the certificate as
"not trusted", that's expected unless your CA's root is in your OS/Acrobat's
trust store — the *signature* is still cryptographically sound.

## How signing actually works here

1. The main app builds the invoice PDF, adds an empty signature placeholder,
   and computes a SHA-256 digest of everything except that placeholder. It
   sends only that digest here — never the whole PDF.
2. This service builds a CMS/PKCS#7 `SignedData` structure (the
   `messageDigest`, `contentType`, and `signingTime` signed attributes),
   and asks the token to RSA-sign the DER encoding of those attributes
   (`src/cms.ts` — the exact byte-retagging trick mirrors pkijs's own
   `SignedData.sign()` implementation).
3. The resulting CMS blob is sent back to the main app, which splices it
   into the PDF's reserved signature slot. No PDF bytes round-trip through
   this service at all — only a digest in, a signature out.

## Security notes

- The PIN is entered once, interactively, at process startup — it's never
  transmitted over the network or written to disk.
- This service only listens on `127.0.0.1` (loopback), never on your LAN.
- Set `ALLOWED_ORIGIN` in `.env` to your deployed app's real origin once
  you're past local testing, so a malicious page open in another tab can't
  call `/sign` on your behalf while the server is running.
