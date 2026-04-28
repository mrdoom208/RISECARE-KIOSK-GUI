import initSqlJs from "sql.js";
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
    db.run("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT, patient_name TEXT NOT NULL, patient_phone TEXT, patient_age INTEGER, patient_gender TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME)");
    db.run("CREATE TABLE IF NOT EXISTS vital_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, blood_pressure_systolic INTEGER, blood_pressure_diastolic INTEGER, heart_rate INTEGER, oxygen_saturation REAL, temperature REAL, weight REAL, height REAL, blood_glucose REAL, bmi REAL, notes TEXT, recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (session_id) REFERENCES sessions(id))");
    db.run("CREATE TABLE IF NOT EXISTS sensors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, instruction TEXT NOT NULL, img TEXT)");

    // New tables for settings
    db.run("CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, passcode TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, action TEXT NOT NULL, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES accounts(id))");

    // Insert default account if none exists
    const accounts = db.exec("SELECT COUNT(*) as count FROM accounts");
    if (accounts[0]?.values?.[0]?.[0] === 0) {
      db.run("INSERT INTO accounts (name, passcode) VALUES ('admin', '082405')");
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
