const pool = require("../config/db");

async function list(search = "") {
  if (search) {
    const query = `
      SELECT * FROM produtos
      WHERE LOWER(nome) LIKE LOWER($1) OR codigo_barras LIKE $1
      ORDER BY created_at DESC
    `;
    return (await pool.query(query, [`%${search}%`])).rows;
  }
  return (await pool.query("SELECT * FROM produtos ORDER BY created_at DESC")).rows;
}

async function findById(id) {
  return (await pool.query("SELECT * FROM produtos WHERE id = $1", [id])).rows[0];
}

async function findByBarcode(code) {
  return (await pool.query("SELECT * FROM produtos WHERE codigo_barras = $1", [code])).rows[0];
}

/** Busca por nome ou código (parcial). Mínimo de caracteres e limite no controller. */
async function search(q, limit = 10) {
  const query = `
    SELECT id, nome, codigo_barras, estoque, preco, custo
    FROM produtos
    WHERE LOWER(nome) LIKE LOWER($1) OR codigo_barras LIKE $1
    ORDER BY nome ASC
    LIMIT $2
  `;
  return (await pool.query(query, [`%${q}%`, limit])).rows;
}

async function create(data) {
  const query = `
    INSERT INTO produtos (nome, codigo_barras, estoque, custo, preco, categoria, fornecedor)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  const values = [data.nome, data.codigo_barras, data.estoque, data.custo, data.preco, data.categoria, data.fornecedor];
  await pool.query(query, values);
}

async function update(id, data) {
  const query = `
    UPDATE produtos
    SET nome=$1, codigo_barras=$2, estoque=$3, custo=$4, preco=$5, categoria=$6, fornecedor=$7
    WHERE id=$8
  `;
  const values = [data.nome, data.codigo_barras, data.estoque, data.custo, data.preco, data.categoria, data.fornecedor, id];
  await pool.query(query, values);
}

async function remove(id) {
  await pool.query("DELETE FROM produtos WHERE id = $1", [id]);
}

module.exports = { list, findById, findByBarcode, search, create, update, remove };
