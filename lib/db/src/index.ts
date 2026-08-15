import initSqlJs from "sql.js";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { workspaceRoot } from "./paths";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(workspaceRoot, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
if (!dbUrlMatch) throw new Error("DATABASE_URL not found in .env");

const dbPath = path.resolve(workspaceRoot, dbUrlMatch[1]);
let SQL: any;
let db: any;

// Fallback surnames for legacy rows that only have a single name part.
const FALLBACK_SURNAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Dela Cruz", "Garcia", "Mendoza",
  "Torres", "Ramos", "Flores", "Aquino", "Villanueva", "Domingo", "Castillo", "Salazar",
  "Navarro", "Padilla", "Marquez", "Vargas",
];

function randomSurname(): string {
  return FALLBACK_SURNAMES[Math.floor(Math.random() * FALLBACK_SURNAMES.length)];
}

async function initDb() {
  SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  createTables();
  saveDb();
  return db;
}

function createTables() {
  try {
    db.run("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT, patient_first_name TEXT NOT NULL, patient_last_name TEXT NOT NULL, patient_phone TEXT, patient_age INTEGER, patient_gender TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)");

    db.run("CREATE TABLE IF NOT EXISTS vital_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, blood_pressure_systolic INTEGER, blood_pressure_diastolic INTEGER, heart_rate INTEGER, oxygen_saturation REAL, temperature REAL, weight REAL, height REAL, bmi REAL, notes TEXT, recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (session_id) REFERENCES sessions(id))");
    db.run("CREATE TABLE IF NOT EXISTS sensors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, instruction TEXT NOT NULL, img TEXT)");

    // New tables for settings
    db.run("CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, action TEXT NOT NULL, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES accounts(id))");
    db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

    // Migrate sessions table: split patient_name into patient_first_name + patient_last_name
    const sessionCols = db.exec("PRAGMA table_info(sessions)")[0]?.values || [];
    const sessionColNames = sessionCols.map((col: any[]) => col[1]);
    const hasLegacyNameCol = sessionColNames.includes("patient_name");
    if (!sessionColNames.includes("patient_first_name")) {
      db.run("ALTER TABLE sessions ADD COLUMN patient_first_name TEXT");
    }
    if (!sessionColNames.includes("patient_last_name")) {
      db.run("ALTER TABLE sessions ADD COLUMN patient_last_name TEXT");
    }

    const nameSplitMigrated = db.exec("SELECT value FROM settings WHERE key = 'name_split_migrated'");
    if (!nameSplitMigrated[0]?.values?.length) {
      if (hasLegacyNameCol) {
        const rows = db.exec(
          "SELECT id, patient_name FROM sessions WHERE patient_name IS NOT NULL AND TRIM(patient_name) != ''"
        );
        if (rows[0]?.values) {
          for (const row of rows[0].values) {
            const id = row[0];
            const name = String(row[1]).trim();
            const parts = name.split(/\s+/).filter(Boolean);
            const first = parts[0] ?? "";
            const last = parts.length > 1 ? parts.slice(1).join(" ") : randomSurname();
            db.run("UPDATE sessions SET patient_first_name = ?, patient_last_name = ? WHERE id = ?", [
              first,
              last,
              id,
            ]);
          }
        }
      }
      db.run("INSERT INTO settings (key, value) VALUES ('name_split_migrated', 'true')");
    }

    if (hasLegacyNameCol) {
      try {
        db.run("ALTER TABLE sessions DROP COLUMN patient_name");
      } catch (e) {
        console.warn("Could not drop legacy patient_name column:", e);
      }
    }

    // Migrate existing accounts table (name -> username, passcode -> password, add role)
    const accountCols = db.exec("PRAGMA table_info(accounts)")[0]?.values || [];
    const accountColNames = accountCols.map((col: any[]) => col[1]);
    if (accountColNames.includes("name") && !accountColNames.includes("username")) {
      db.run("ALTER TABLE accounts RENAME COLUMN name TO username");
    }
    if (accountColNames.includes("passcode") && !accountColNames.includes("password")) {
      db.run("ALTER TABLE accounts RENAME COLUMN passcode TO password");
    }
    if (!accountColNames.includes("role")) {
      db.run("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
    }

    // Insert default account if none exists
    const accounts = db.exec("SELECT COUNT(*) as count FROM accounts");
    if (accounts[0]?.values?.[0]?.[0] === 0) {
      db.run("INSERT INTO accounts (username, password, role) VALUES ('admin', ?, 'superadmin')", [
        bcrypt.hashSync("082405", 10),
      ]);
    }

    // Migrate plaintext passwords to bcrypt hashes (run every boot, idempotent)
    const accountRows = db.exec("SELECT id, password FROM accounts");
    if (accountRows[0]?.values) {
      for (const row of accountRows[0].values) {
        const id = row[0];
        const pw = row[1];
        if (typeof pw === "string" && !pw.startsWith("$2")) {
          db.run("UPDATE accounts SET password = ? WHERE id = ?", [bcrypt.hashSync(pw, 10), id]);
        }
      }
    }

    // Migrate roles: admin -> superadmin, sub_admin -> admin (run once)
    const rolesMigrated = db.exec("SELECT value FROM settings WHERE key = 'roles_migrated'");
    if (!rolesMigrated[0]?.values?.length) {
      db.run("UPDATE accounts SET role = 'superadmin' WHERE role = 'admin'");
      db.run("UPDATE accounts SET role = 'admin' WHERE role = 'sub_admin'");
      db.run("INSERT INTO settings (key, value) VALUES ('roles_migrated', 'true')");
    }

    // Insert default settings if none exist
    const existingMode = db.exec("SELECT value FROM settings WHERE key = 'ai_mode'");
    if (!existingMode[0]?.values?.length) {
      db.run("INSERT INTO settings (key, value) VALUES ('ai_mode', 'integrated')");
    }
    const existingRec = db.exec("SELECT value FROM settings WHERE key = 'recommendation_enabled'");
    if (!existingRec[0]?.values?.length) {
      db.run("INSERT INTO settings (key, value) VALUES ('recommendation_enabled', 'true')");
    }

    saveDb();
  } catch (e) {
    console.error("Error creating tables:", e);
  }
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

export async function query(sql: string, params: any[] = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result: any[] = [];
  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export async function run(sql: string, params: any[] = []) {
  db.run(sql, params);
  const result = db.exec("SELECT last_insert_rowid()");
  const lastInsertRowid = result[0]?.values?.[0]?.[0];
  saveDb();
  return { lastInsertRowid };
}

process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(); });
process.on('SIGTERM', () => { saveDb(); process.exit(); });
setInterval(saveDb, 30000);

await initDb();
export { db };
export * from "./schema";
