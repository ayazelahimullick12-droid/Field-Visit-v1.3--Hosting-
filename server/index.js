import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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