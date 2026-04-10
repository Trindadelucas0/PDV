const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

pool.on("error", (err) => {
  const logger = require("../utils/logger");
  logger.error("Pool PostgreSQL: erro inesperado no cliente ocioso", err);
});

module.exports = pool;
