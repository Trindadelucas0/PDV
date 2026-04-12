const path = require("path");
const express = require("express");
const session = require("express-session");
const methodOverride = require("method-override");
const pgSession = require("connect-pg-simple")(session);
const pool = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const productRoutes = require("./routes/productRoutes");
const stockRoutes = require("./routes/stockRoutes");
const salesRoutes = require("./routes/salesRoutes");
const historyRoutes = require("./routes/historyRoutes");
const { requireAuth } = require("./middlewares/auth");
const logger = require("./utils/logger");

const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.http(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "trocar-este-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.store = {
    name: process.env.STORE_NAME || "Controle PDV",
    phone: process.env.STORE_PHONE || "",
    address: process.env.STORE_ADDRESS || ""
  };
  /* Troque ASSET_VERSION no deploy para forçar navegador a baixar styles.css novo */
  res.locals.cssVersion = process.env.ASSET_VERSION || "1";
  next();
});

app.use(authRoutes);
app.use("/", requireAuth, dashboardRoutes);
app.use("/produtos/estoque", requireAuth, stockRoutes);
app.use("/produtos", requireAuth, productRoutes);
app.use("/vendas", requireAuth, salesRoutes);
app.use("/historico", requireAuth, historyRoutes);

app.use((req, res) => {
  logger.warn(`404 — ${req.method} ${req.originalUrl}`);
  res.status(404).send("Não encontrado.");
});

app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} — erro na aplicação`, err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).send("Erro interno do servidor.");
});

module.exports = app;
