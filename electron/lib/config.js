"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/**
 * Small JSON config persisted in the app's userData dir. Holds the secrets
 * and the admin credentials that are generated once on first launch and
 * must stay stable across restarts (changing SESSION_SECRET would log the
 * user out every launch; changing the admin password would lock them out).
 */
function rand(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function friendlyPassword() {
  // Readable-ish: no ambiguous chars, grouped. Only shown once, then the
  // user can keep using it or (later) change it in-app.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => alphabet[crypto.randomInt(alphabet.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}-${group()}`;
}

function load(userDataDir) {
  const file = path.join(userDataDir, "config.json");
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    stored = {};
  }

  let changed = false;
  const ensure = (key, make) => {
    if (!stored[key]) {
      stored[key] = make();
      changed = true;
    }
  };

  ensure("sessionSecret", () => rand(48));
  ensure("setupSecret", () => rand(24));
  ensure("pdfSecret", () => rand(24));
  ensure("dbPassword", () => rand(18));
  ensure("adminEmail", () => "founder@techgrah.local");
  ensure("adminName", () => "TechGrah Admin");
  ensure("adminPassword", () => friendlyPassword());
  if (stored.credentialsShown === undefined) {
    stored.credentialsShown = false;
    changed = true;
  }

  if (changed) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(stored, null, 2), "utf8");
  }

  return {
    values: stored,
    markCredentialsShown() {
      stored.credentialsShown = true;
      fs.writeFileSync(file, JSON.stringify(stored, null, 2), "utf8");
    },
    file,
  };
}

module.exports = { load };
