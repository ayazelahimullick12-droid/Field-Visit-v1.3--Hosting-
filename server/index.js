import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assignComplaint, extendDeadline, resolveComplaint, runDeadlineCheck } from "./logic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "db.json");
const DIST_PATH = path.join(__dirname, "../dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

function readDb() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDb(db) {
  // Pretty-printed so db.json stays readable/diffable if you peek at it.
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

// GET /api/:collection -> returns that array/object from db.json
app.get("/api/:collection", (req, res) => {
  try {
    const db = readDb();
    const { collection } = req.params;
    if (!(collection in db)) {
      return res.status(404).json({ error: `Unknown collection "${collection}"` });
    }
    res.json(db[collection]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read database" });
  }
});

// PUT /api/:collection -> replaces that collection entirely with req.body
// and persists it to db.json. This matches how the frontend keeps each
// piece of state as a single array (visits, complaints, stories, etc.),
// so the whole array is sent back on every change.
app.put("/api/:collection", (req, res) => {
  try {
    const db = readDb();
    const { collection } = req.params;
    db[collection] = req.body;
    writeDb(db);
    res.json(db[collection]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to write database" });
  }
});

// --- Complaint workflow actions -------------------------------------------
// These are the only endpoints with real business logic; everything else is
// the generic collection GET/PUT above. Each one reads the whole db, mutates
// it via server/logic.js, writes it back, and returns what changed.

app.post("/api/actions/assign-complaint", (req, res) => {
  try {
    const db = readDb();
    const { complaint, email } = assignComplaint(db, req.body);
    writeDb(db);
    res.json({ complaint, email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/actions/extend-deadline", (req, res) => {
  try {
    const db = readDb();
    const { complaint, email } = extendDeadline(db, req.body);
    writeDb(db);
    res.json({ complaint, email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/actions/resolve-complaint", (req, res) => {
  try {
    const db = readDb();
    const { complaint } = resolveComplaint(db, req.body);
    writeDb(db);
    res.json({ complaint });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/actions/run-deadline-check", (req, res) => {
  try {
    const db = readDb();
    const generated = runDeadlineCheck(db);
    writeDb(db);
    res.json({ emailsGenerated: generated.length, emails: generated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Serve the built frontend (Vite's multi-page output) ---
// This must come AFTER the /api routes above, so API calls are never
// swallowed by the static file handler.
app.use(express.static(DIST_PATH));

// Fallback: if someone hits a route that isn't a static file or an API
// route (e.g. a bare "/"), send the landing page. staff.html and
// admin.html are served directly by express.static above since they
// exist as real files in dist/.
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_PATH, "index.html"));
});

// Render (and most hosts) assign the port via this env var at runtime.
// Hardcoding 4000 works locally but breaks deployment.
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Field Visit Tracker API server running at http://localhost:${PORT}`);
  console.log(`Reading/writing: ${DB_PATH}`);
  console.log(`Serving frontend from: ${DIST_PATH}`);
});

// Automatic reminder/escalation sweep. Runs every 5 minutes while the
// service is awake. On free-tier hosts (e.g. Render's free plan) the
// service can sleep after inactivity, in which case this simply won't run
// until something wakes it back up — use the "Run deadline check now"
// button in the admin console to trigger it on demand for a demo.
const DEADLINE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  try {
    const db = readDb();
    const generated = runDeadlineCheck(db);
    if (generated.length > 0) {
      writeDb(db);
      console.log(`[deadline-check] generated ${generated.length} email(s)`);
    }
  } catch (err) {
    console.error("[deadline-check] failed:", err);
  }
}, DEADLINE_CHECK_INTERVAL_MS);