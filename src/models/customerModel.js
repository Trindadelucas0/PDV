const pool = require("../config/db");

async function findByCpf(cpf) {
  const v = cpf && String(cpf).trim();
  if (!v) return null;
  return (await pool.query("SELECT * FROM clientes WHERE cpf = $1 LIMIT 1", [v])).rows[0];
}

async function findByTelefone(telefone) {
  const v = telefone && String(telefone).trim();
  if (!v) return null;
  return (await pool.query("SELECT * FROM clientes WHERE telefone = $1 LIMIT 1", [v])).rows[0];
}

async function create(data) {
  const query = `
    INSERT INTO clientes (nome, cpf, telefone, email, endereco)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const values = [data.nome, data.cpf || null, data.telefone || null, data.email || null, data.endereco || null];
  return (await pool.query(query, values)).rows[0];
}

/** Reutiliza cliente existente pelo CPF ou telefone quando informados. */
async function findOrCreate(data) {
  const nome = data.nome || "Consumidor Final";
  const cpf = data.cpf && String(data.cpf).trim() ? String(data.cpf).trim() : null;
  const telefone = data.telefone && String(data.telefone).trim() ? String(data.telefone).trim() : null;

  if (cpf) {
    const byCpf = await findByCpf(cpf);
    if (byCpf) return byCpf;
  }
  if (telefone) {
    const byTel = await findByTelefone(telefone);
    if (byTel) return byTel;
  }
  return create({ ...data, nome, cpf, telefone });
}

module.exports = { create, findOrCreate, findByCpf, findByTelefone };
