// Run once, automatically, the first time the server starts against an
// empty database. Safe to re-run: it checks whether roles already exist
// and does nothing if so, so restarting the server never duplicates data.

const crypto = require("crypto");
const db = require("./db");
const { hashPassword } = require("./auth");
const seedData = require("./seed-data");

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

// Generates a random, readable temporary password like "harbor-42-cedar"
// rather than a hard-to-communicate string of symbols, since this is the
// password a real person will be told (in person or by phone) and asked to
// change on first login.
function randomTempPassword() {
  const words = ["harbor", "cedar", "amber", "willow", "granite", "ridge", "ember", "river", "summit", "maple"];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${w1}-${num}-${w2}`;
}

async function seed() {
  const existingRoles = db.prepare("SELECT COUNT(*) as n FROM roles").get();
  if (existingRoles.n > 0) {
    console.log("Database already has data — skipping seed.");
    return null;
  }

  console.log("Empty database detected. Seeding starter data...");

  const insertRole = db.prepare(
    "INSERT INTO roles (id, name, can_edit, can_see_notes, can_admin, built_in) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const r of seedData.seedRoles) {
    insertRole.run(r.id, r.name, r.canEdit ? 1 : 0, r.canSeeNotes ? 1 : 0, r.canAdmin ? 1 : 0, r.builtIn ? 1 : 0);
  }

  const insertCat = db.prepare(
    "INSERT INTO categories (id, kind, name, note_no, subs) VALUES (?, ?, ?, ?, ?)"
  );
  for (const c of seedData.seedIncomeCats) {
    insertCat.run(c.id, "income", c.name, c.noteNo ?? null, JSON.stringify(c.subs || []));
  }
  for (const c of seedData.seedExpenseCats) {
    insertCat.run(c.id, "expense", c.name, c.noteNo ?? null, JSON.stringify(c.subs || []));
  }

  const insertAccount = db.prepare(
    "INSERT INTO accounts (id, kind, name, acc_no, opening, deletable) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const a of seedData.seedAccounts) {
    insertAccount.run(a.id, a.kind, a.name, a.accNo || "", a.opening || 0, a.deletable === false ? 0 : 1);
  }

  const insertMember = db.prepare(
    "INSERT INTO members (id, name, envelope_no, phone, email) VALUES (?, ?, ?, ?, ?)"
  );
  for (const m of seedData.seedMembers) {
    insertMember.run(m.id, m.name, m.envelopeNo || "", m.phone || "", m.email || "");
  }

  const insertDisclosure = db.prepare(
    "INSERT INTO disclosures (id, year, category, label, amount, note) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const d of seedData.seedDisclosures) {
    insertDisclosure.run(d.id, d.year, d.category, d.label, d.amount, d.note || "");
  }

  const insertBudget = db.prepare(
    "INSERT INTO budgets (year, cat_id, amount) VALUES (?, ?, ?)"
  );
  for (const [year, byCategory] of Object.entries(seedData.seedBudget)) {
    for (const [catId, amount] of Object.entries(byCategory)) {
      insertBudget.run(Number(year), catId, amount);
    }
  }

  const insertPriorYear = db.prepare(
    "INSERT INTO prior_year (year, cat_id, amount) VALUES (?, ?, ?)"
  );
  for (const [year, byCategory] of Object.entries(seedData.seedPriorYear)) {
    for (const [catId, amount] of Object.entries(byCategory)) {
      insertPriorYear.run(Number(year), catId, amount);
    }
  }

  // Users get real usernames and temporary passwords. Each must change
  // their password on first login (enforced by the /api/auth/login route).
  const insertUser = db.prepare(
    `INSERT INTO users (id, name, username, password_hash, role_id, phone, email, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );

  const credentials = [];
  for (const u of seedData.seedUsers) {
    const username = u.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
    const tempPassword = randomTempPassword();
    const hash = await hashPassword(tempPassword);
    insertUser.run(newId("user"), u.name, username, hash, u.roleId, u.phone || "", u.email || "");
    credentials.push({ name: u.name, username, tempPassword });
  }

  console.log("\nSeed complete. Starter logins (each must change their password on first sign-in):\n");
  for (const c of credentials) {
    console.log(`  ${c.name.padEnd(20)} username: ${c.username.padEnd(20)} temporary password: ${c.tempPassword}`);
  }
  console.log("\nWrite these down now — temporary passwords are not stored anywhere and cannot be recovered after this.\n");

  return credentials;
}

module.exports = seed;

// Allow running this file directly too: `npm run seed`, separate from the
// server auto-seeding on startup, for re-seeding a fresh database by hand.
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(err => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}
