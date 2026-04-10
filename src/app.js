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

const app = express();

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
  next();
});

app.use(authRoutes);
app.use("/", requireAuth, dashboardRoutes);
app.use("/produtos/estoque", requireAuth, stockRoutes);
app.use("/produtos", requireAuth, productRoutes);
app.use("/vendas", requireAuth, salesRoutes);
app.use("/historico", requireAuth, historyRoutes);

module.exports = app;
