
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");

const app = express();
const db = new Database("seby-folder.db");

if (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.includes("CHANGE_THIS")) {
  throw new Error("Configurez SESSION_SECRET dans .env");
}

if (!process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD.includes("CHANGE_THIS")) {
  throw new Error("Configurez ADMIN_PASSWORD dans .env");
}

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const countries = {
  "Haïti": "+509",
  "Togo": "+228",
  "États-Unis": "+1",
  "Canada": "+1",
  "Brésil": "+55",
  "France": "+33",
  "Nigeria": "+234"
};

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: "sebyfolder.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    db: "sessions.db",
    dir: "."
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(express.static(path.join(__dirname, "public")));

const adminEmail = process.env.ADMIN_EMAIL.toLowerCase();

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value) {
  return clean(value).replace(/[\s()-]/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requireUser(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Veuillez vous connecter."
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({
      error: "Accès administrateur requis."
    });
  }
  next();
}

app.get("/api/config", (req, res) => {
  res.json({
    name: "SEBY FOLDER",
    language: "fr",
    countries: Object.entries(countries).map(
      ([name, code]) => ({ name, code })
    ),
    supportEmail: "sebastiensylne06@gmail.com",
    whatsapp: "+50937155313"
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const name = clean(req.body.name);
    const country = clean(req.body.country);
    const email = clean(req.body.email).toLowerCase();
    const phone = normalizePhone(req.body.phone);
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        error: "Nom invalide."
      });
    }

    if (!countries[country]) {
      return res.status(400).json({
        error: "Pays non éligible."
      });
    }

    if ((!email && !phone) ||
        (email && !validEmail(email)) ||
        (phone && !/^\+[1-9]\d{7,14}$/.test(phone))) {
      return res.status(400).json({
        error: "Entrez un e-mail valide ou un numéro international avec indicatif."
      });
    }

    if (password.length < 10 || password.length > 200) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 10 caractères."
      });
    }

    if (phone && !phone.startsWith(countries[country])) {
      return res.status(400).json({
        error: "L'indicatif ne correspond pas au pays choisi."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users
        (name, country, phone, email, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      country,
      phone || null,
      email || null,
      hash
    );

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          error: "Erreur de session."
        });
      }

      req.session.user = {
        id: Number(result.lastInsertRowid),
        name,
        country
      };

      res.status(201).json({
        message: "Inscription réussie.",
        user: req.session.user
      });
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "Cet e-mail ou ce numéro est déjà enregistré."
      });
    }

    console.error(error);
    res.status(500).json({
      error: "Une erreur est survenue."
    });
  }
});

app.post("/api/login", (req, res) => {
  const identifier = clean(req.body.identifier).toLowerCase();
  const password = typeof req.body.password === "string"
    ? req.body.password
    : "";

  const user = db.prepare(`
    SELECT * FROM users
    WHERE lower(email) = ? OR phone = ?
  `).get(identifier, normalizePhone(identifier));

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({
      error: "Identifiants incorrects."
    });
  }

  req.session.regenerate(err => {
    if (err) {
      return res.status(500).json({
        error: "Erreur de session."
      });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      country: user.country
    };

    res.json({
      message: "Connexion réussie.",
      user: req.session.user
    });
  });
});

app.get("/api/me", (req, res) => {
  res.json({
    user: req.session.user || null
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sebyfolder.sid");
    res.json({ message: "Déconnexion réussie." });
  });
});

app.get("/api/members/count", (req, res) => {
  const result = db.prepare(
    "SELECT COUNT(*) AS total FROM users"
  ).get();

  res.json({ total: result.total });
});

app.post("/api/admin/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string"
    ? req.body.password
    : "";

  const emailMatches = email === adminEmail;
  const passwordMatches = bcrypt.compareSync(
    password,
    bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12)
  );

  if (!emailMatches || !passwordMatches) {
    return res.status(401).json({
      error: "Accès refusé."
    });
  }

  req.session.regenerate(err => {
    if (err) {
      return res.status(500).json({
        error: "Erreur de session."
      });
    }

    req.session.admin = true;
    res.json({ message: "Connexion administrateur réussie." });
  });
});

app.get("/api/admin/members", requireAdmin, (req, res) => {
  const members = db.prepare(`
    SELECT id, name, country, phone, email, created_at
    FROM users
    ORDER BY id DESC
    LIMIT 500
  `).all();

  res.json({ members });
});

app.delete("/api/admin/members/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      error: "Identifiant invalide."
    });
  }

  const result = db.prepare(
    "DELETE FROM users WHERE id = ?"
  ).run(id);

  if (!result.changes) {
    return res.status(404).json({
      error: "Membre introuvable."
    });
  }

  res.json({ message: "Membre supprimé." });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sebyfolder.sid");
    res.json({ message: "Déconnexion administrateur réussie." });
  });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const total = db.prepare(
    "SELECT COUNT(*) AS total FROM users"
  ).get().total;

  res.json({ total });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log("SEBY FOLDER lancé sur le port " + port);
});
