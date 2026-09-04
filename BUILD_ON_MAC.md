# Building the TechGrah desktop app (macOS)

This turns the web app into a double‑click **`TechGrah.app`** (Dock icon,
native window, Launchpad) that runs **fully offline**. Node and PostgreSQL
are bundled inside the app — the end user installs nothing.

The build itself must run **on a Mac** (Apple Silicon). It needs internet
**once** to download packages; the finished `.app` never does.

---

## 1. One‑time prerequisites (on the build Mac)

```bash
# Homebrew (brew.sh), then:
brew install node        # Node 20 or newer
xcode-select --install   # if not already present
```

## 2. Get the code and install

```bash
cd ~/invoice_software          # the repo
rm -rf node_modules .next dist # clean out anything copied from another OS
npm install                    # downloads deps incl. the bundled PostgreSQL binary
```

`npm install` (not `npm ci`) — the lockfile is refreshed here because the
desktop dependencies were added on another machine.

## 3. Build the app

```bash
npm run desktop:mac
```

This runs three steps:

1. `desktop:icon` – renders `build/icon.svg` → `build/icon.png`
2. `build:standalone` – `next build` with `output: standalone`, then copies
   `.next/static` + `public/` into `.next/standalone/` and strips any `.env`
3. `electron-builder --mac` – packages everything into `dist/`

Output:

```
dist/TechGrah-0.1.0-arm64.dmg     <- ship this
dist/TechGrah-0.1.0-arm64.zip
dist/mac-arm64/TechGrah.app
```

## 4. Install and run

Drag `TechGrah.app` from the `.dmg` to **Applications**. Because the app is
**not code‑signed** (no Apple Developer account required), Gatekeeper will
block the first launch. Clear it once:

```bash
xattr -cr /Applications/TechGrah.app
```

…then open it normally (or right‑click → Open the first time).

**First launch:** a dialog shows the generated admin email + password (also
written to `~/Library/Application Support/TechGrah/first-run-credentials.txt`).
Sign in with those.

---

## What happens at runtime

On every launch the app (see `electron/main.js`):

1. Starts a private PostgreSQL 17 on a random loopback port, data in
   `~/Library/Application Support/TechGrah/pgdata/`.
2. Applies any pending SQL migrations from `Contents/Resources/migrations/`
   (tracked in `_tg_desktop_migrations` — don't also run `prisma migrate`
   against this DB).
3. Starts a loopback PDF service that renders invoices via Electron's own
   Chromium (no Puppeteer/Chromium bundled).
4. Starts the Next.js standalone server on a random loopback port with
   `DESKTOP_APP=1` (relaxes the `Secure` cookie so http‑localhost login
   works) and `UPLOADS_DIR` pointed at a writable folder.
5. Seeds the admin user + business profile via `POST /api/setup` (idempotent).
6. Opens the window.

Quitting stops the server, the PDF service, and PostgreSQL in order.

Nothing contacts the network. Email is disabled (logs to console),
Razorpay/Supabase are unset, the DSC signer stays a separate localhost tool.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm install` can't resolve `embedded-postgres@17.10.0-beta.17` | `npm view embedded-postgres versions \| tr ',' '\n' \| grep '^ *"17'` and pin the newest `17.x.y-beta.N` in `package.json`. |
| App opens, "couldn't start", PostgreSQL spawn error | `chmod -R +x "/Applications/TechGrah.app/Contents/Resources/app.asar.unpacked/node_modules/@embedded-postgres"` then relaunch. |
| Blank window / 404 on styles | `.next/standalone` wasn't prepped — re‑run `npm run build:standalone` and check it printed "prepared .next/standalone". |
| Need an Intel (x64) build | `npm i -D @embedded-postgres/darwin-x64@17.10.0-beta.17`, then set `mac.target[].arch` to `["arm64","x64"]` in `package.json` and rebuild on / for that arch. |
| Want it signed (no Gatekeeper prompt) | Set `CSC_LINK`/`CSC_KEY_PASSWORD` env for a Developer ID cert and remove `"identity": null`; add notarization. Needs a paid Apple Developer account. |

## Iterating

`npm run electron:dev` runs the packaged flow against the repo (after at
least one `npm run build:standalone`). Logs from PostgreSQL, migrations,
the Next server and PDF service all stream to the terminal, prefixed
`[pg]` / `[migrate]` / `[next]`.
