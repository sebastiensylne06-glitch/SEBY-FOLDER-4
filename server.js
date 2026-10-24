
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");

// =====================================================
// SEBY FOLDER — SERVER
// =====================================================

const app = express();
app.disable("x-powered-by");

// Render sèvi ak yon proxy devan aplikasyon an.
app.set("trust proxy", 1);

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================

const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    "Configurez SESSION_SECRET avec au moins 32 caractères dans Render."
  );
}

if (
  !ADMIN_EMAIL ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)
) {
  throw new Error(
    "Configurez une adresse ADMIN_EMAIL valide dans Render."
  );
}

if (
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.includes("CHANGE_THIS") ||
  ADMIN_PASSWORD.length < 12
) {
  throw new Error(
    "Configurez ADMIN_PASSWORD avec au moins 12 caractères dans Render."
  );
}

// =====================================================
// DATABASE
// =====================================================

// Pour Render, DB_PATH peut pointer vers un disque persistant.
// Par défaut, la base est créée dans le dossier du projet.
const DB_PATH = process.env.DB_PATH ||
  path.join(__dirname, "seby-folder.db");

const SESSION_DB_DIR = process.env.SESSION_DB_DIR ||
  path.dirname(DB_PATH);

const SESSION_DB_NAME = "sessions.db";

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

// =====================================================
// CONFIGURATION
// =====================================================

const countries = {
  "Haïti": "+509",
  "Togo": "+228",
  "États-Unis": "+1",
  "Canada": "+1",
  "Brésil": "+55",
  "France": "+33",
  "Nigeria": "+234"
};

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.use(
  session({
    name: "sebyfolder.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    store: new SQLiteStore({
      db: SESSION_DB_NAME,
      dir: SESSION_DB_DIR
    }),

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

// =====================================================
// WEBSITE — PUBLIC FILES AND HOME PAGE
// =====================================================

app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  res.sendFile(INDEX_FILE, (err) => {
    if (err) {
      console.error("Impossible de charger public/index.html :", err);
      if (!res.headersSent) {
        res.status(500).send(
          "SEBY FOLDER : index.html introuvable dans le dossier public."
        );
      }
    }
  });
});

// =====================================================
// HELPERS
// =====================================================

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

function regenerateSession(req, res, next, callback) {
  req.session.regenerate((err) => {
    if (err) {
      console.error("Erreur de session :", err);

      return res.status(500).json({
        error: "Erreur de session."
      });
    }

    callback();
  });
}

function safePasswordCompare(input, expected) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

// =====================================================
// API STATUS
// =====================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "SEBY FOLDER",
    status: "online"
  });
});

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

// =====================================================
// USER REGISTRATION
// =====================================================

app.post("/api/register", async (req, res) => {
  try {
    const name = clean(req.body.name);
    const country = clean(req.body.country);
    const email = clean(req.body.email).toLowerCase();
    const phone = normalizePhone(req.body.phone);

    const password =
      typeof req.body.password === "string"
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

    if (
      (!email && !phone) ||
      (email && !validEmail(email)) ||
      (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
    ) {
      return res.status(400).json({
        error:
          "Entrez un e-mail valide ou un numéro international avec indicatif."
      });
    }

    if (password.length < 10 || password.length > 200) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir entre 10 et 200 caractères."
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

    regenerateSession(req, res, null, () => {
      req.session.user = {
        id: Number(result.lastInsertRowid),
        name,
        country
      };

      req.session.save((err) => {
        if (err) {
          console.error("Erreur sauvegarde session :", err);

          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        res.status(201).json({
          message: "Inscription réussie.",
          user: req.session.user
        });
      });
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "Cet e-mail ou ce numéro est déjà enregistré."
      });
    }

    console.error("Erreur inscription :", error);

    res.status(500).json({
      error: "Une erreur est survenue."
    });
  }
});

// =====================================================
// USER LOGIN
// =====================================================

app.post("/api/login", (req, res) => {
  try {
    const identifier = clean(req.body.identifier).toLowerCase();

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!identifier || !password) {
      return res.status(400).json({
        error: "Entrez votre identifiant et votre mot de passe."
      });
    }

    const user = db.prepare(`
      SELECT id, name, country, phone, email, password_hash
      FROM users
      WHERE lower(email) = ? OR phone = ?
    `).get(identifier, normalizePhone(identifier));

    if (
      !user ||
      !bcrypt.compareSync(password, user.password_hash)
    ) {
      return res.status(401).json({
        error: "Identifiants incorrects."
      });
    }

    regenerateSession(req, res, null, () => {
      req.session.user = {
        id: user.id,
        name: user.name,
        country: user.country
      };

      req.session.save((err) => {
        if (err) {
          console.error("Erreur sauvegarde session :", err);

          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        res.json({
          message: "Connexion réussie.",
          user: req.session.user
        });
      });
    });
  } catch (error) {
    console.error("Erreur connexion :", error);

    res.status(500).json({
      error: "Une erreur est survenue."
    });
  }
});

// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/me", (req, res) => {
  res.json({
    user: req.session.user || null
  });
});

// =====================================================
// USER LOGOUT
// =====================================================

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erreur déconnexion :", err);

      return res.status(500).json({
        error: "Erreur lors de la déconnexion."
      });
    }

    res.clearCookie("sebyfolder.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    res.json({
      message: "Déconnexion réussie."
    });
  });
});

// =====================================================
// PUBLIC MEMBER COUNT
// =====================================================

app.get("/api/members/count", (req, res) => {
  try {
    const result = db.prepare(
      "SELECT COUNT(*) AS total FROM users"
    ).get();

    res.json({
      total: result.total
    });
  } catch (error) {
    console.error("Erreur comptage membres :", error);

    res.status(500).json({
      error: "Impossible de compter les membres."
    });
  }
});

// =====================================================
// ADMIN LOGIN
// =====================================================

app.post("/api/admin/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();

  const password =
    typeof req.body.password === "string"
      ? req.body.password
      : "";

  const emailMatches = email === ADMIN_EMAIL;
  const passwordMatches = safePasswordCompare(
    password,
    ADMIN_PASSWORD
  );

  if (!emailMatches || !passwordMatches) {
    return res.status(401).json({
      error: "Accès refusé."
    });
  }

  regenerateSession(req, res, null, () => {
    req.session.admin = true;

    req.session.save((err) => {
      if (err) {
        console.error("Erreur session admin :", err);

        return res.status(500).json({
          error: "Impossible de sauvegarder la session."
        });
      }

      res.json({
        message: "Connexion administrateur réussie."
      });
    });
  });
});

// =====================================================
// ADMIN — LIST MEMBERS
// =====================================================

app.get(
  "/api/admin/members",
  requireAdmin,
  (req, res) => {
    try {
      const members = db.prepare(`
        SELECT id, name, country, phone, email, created_at
        FROM users
        ORDER BY id DESC
        LIMIT 500
      `).all();

      res.json({ members });
    } catch (error) {
      console.error("Erreur liste membres :", error);

      res.status(500).json({
        error: "Impossible de charger les membres."
      });
    }
  }
);

// =====================================================
// ADMIN — DELETE MEMBER
// =====================================================

app.delete(
  "/api/admin/members/:id",
  requireAdmin,
  (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Identifiant invalide."
      });
    }

    try {
      const result = db.prepare(
        "DELETE FROM users WHERE id = ?"
      ).run(id);

      if (!result.changes) {
        return res.status(404).json({
          error: "Membre introuvable."
        });
      }

      res.json({
        message: "Membre supprimé."
      });
    } catch (error) {
      console.error("Erreur suppression membre :", error);

      res.status(500).json({
        error: "Impossible de supprimer le membre."
      });
    }
  }
);

// =====================================================
// ADMIN — LOGOUT
// =====================================================

app.post(
  "/api/admin/logout",
  requireAdmin,
  (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Erreur déconnexion admin :", err);

        return res.status(500).json({
          error: "Erreur lors de la déconnexion."
        });
      }

      res.clearCookie("sebyfolder.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
      });

      res.json({
        message: "Déconnexion administrateur réussie."
      });
    });
  }
);

// =====================================================
// ADMIN — STATISTICS
// =====================================================

app.get(
  "/api/admin/stats",
  requireAdmin,
  (req, res) => {
    try {
      const total = db.prepare(
        "SELECT COUNT(*) AS total FROM users"
      ).get().total;

      res.json({ total });
    } catch (error) {
      console.error("Erreur statistiques :", error);

      res.status(500).json({
        error: "Impossible de charger les statistiques."
      });
    }
  }
);

// =====================================================
// 404 — API AND UNKNOWN ROUTES
// =====================================================

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "Route API introuvable."
  });
});

app.use((req, res) => {
  res.status(404).send("Page introuvable.");
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
  console.error("Erreur serveur :", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "Erreur interne du serveur."
  });
});

// =====================================================
// START SERVER
// =====================================================

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, "0.0.0.0", () => {
  console.log("=================================");
  console.log("SEBY FOLDER est lancé.");
  console.log("Port :", port);
  console.log("Dossier public :", PUBLIC_DIR);
  console.log("Page index :", INDEX_FILE);
  console.log("Base de données :", DB_PATH);
  console.log("=================================");
});

server.on("error", (error) => {
  console.error("Impossible de démarrer le serveur :", error);
  process.exit(1);
});
