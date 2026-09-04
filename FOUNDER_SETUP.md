# TechGrah — installing on your Mac

You've been given **`TechGrah.dmg`**. This is the whole app. It runs entirely
on your Mac — no internet, no accounts, no separate database to install.

## Install (2 minutes, once)

1. Double-click **`TechGrah.dmg`**, then drag the **TechGrah** icon onto the
   **Applications** folder in the same window.
2. Open the **Terminal** app (Spotlight → type "Terminal"). Paste this line
   and press Return:

   ```
   xattr -cr /Applications/TechGrah.app
   ```

   (This is needed once because the app isn't distributed through the App
   Store. It doesn't ask for a password.)
3. Open **TechGrah** from Launchpad or Applications.
4. The first launch takes about 15 seconds while it sets up its database.
   A window then appears showing your **login email and password** — write
   these down. They're also saved to a file the dialog points to.
5. Sign in. Go to **Settings** and fill in your real business details —
   legal name, GSTIN, address, bank details, and upload your logo and
   signature image. These appear on every invoice.

That's it. From now on it's just a normal app — open it from the Dock.

## Day-to-day

- **Clients → New**: add a client. Set their currency to **USD** for
  tax-free (export) invoices, or leave it **INR** for GST invoices.
- **Invoices → New**: pick a client, add line items, **Save Draft**,
  **Preview PDF**, then **Finalize** to lock it and assign its number.
- **Dashboard**: revenue, outstanding, and per-client totals, filterable by
  date range, client, currency, and status.

## Your data

Everything lives in one folder:

```
~/Library/Application Support/TechGrah/
```

To **back up**, copy that whole folder somewhere safe (an external drive,
cloud folder) while the app is **closed**. To move to a new Mac, install the
app there and copy this folder across before first launch.

## Updates

A new version comes as a new `.dmg`. Quit TechGrah, drag the new app over
the old one in Applications, run the `xattr -cr` line again, reopen. Your
data folder is untouched.

## Digital signatures (optional)

If you need invoices digitally signed with your DSC USB token, that's a
separate small tool — see `HANDOVER_INSTRUCTIONS.md` (Parts 2 and 3) and
`local-signer/README.md`.

## Something wrong?

If the app won't start, open it, and when the error appears, copy the full
text and send it over.
