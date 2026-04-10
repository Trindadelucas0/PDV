const pool = require("./db");
const logger = require("../utils/logger");

async function initDb() {
  logger.info("Verificando / criando tabelas e índices...");
  try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      codigo_barras VARCHAR(80) UNIQUE NOT NULL,
      estoque INTEGER NOT NULL DEFAULT 0,
      custo NUMERIC(10,2) NOT NULL DEFAULT 0,
      preco NUMERIC(10,2) NOT NULL DEFAULT 0,
      categoria VARCHAR(100),
      fornecedor VARCHAR(150),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      cpf VARCHAR(20),
      telefone VARCHAR(30),
      email VARCHAR(150),
      endereco TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendas (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER REFERENCES clientes(id),
      total NUMERIC(10,2) NOT NULL,
      lucro NUMERIC(10,2) NOT NULL,
      forma_pagamento VARCHAR(30) NOT NULL,
      valor_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
      troco NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS venda_itens (
      id SERIAL PRIMARY KEY,
      venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL,
      preco NUMERIC(10,2) NOT NULL,
      custo NUMERIC(10,2) NOT NULL,
      subtotal NUMERIC(10,2) NOT NULL
    );
  `);

  await pool.query(`
    ALTER TABLE vendas ADD COLUMN IF NOT EXISTS parcelas INTEGER NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    ALTER TABLE vendas ADD COLUMN IF NOT EXISTS pagamento_dinheiro NUMERIC(10,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE vendas ADD COLUMN IF NOT EXISTS pagamento_cartao NUMERIC(10,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE vendas ADD COLUMN IF NOT EXISTS pagamento_pix NUMERIC(10,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE vendas ALTER COLUMN forma_pagamento TYPE VARCHAR(120);
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos (nome);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos (codigo_barras);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas (created_at);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes (cpf) WHERE cpf IS NOT NULL;");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes (telefone) WHERE telefone IS NOT NULL;");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      tipo VARCHAR(30) NOT NULL,
      quantidade INTEGER NOT NULL,
      motivo TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_estoque_mov_prod ON estoque_movimentacoes (produto_id);");

  logger.info("Schema do banco verificado (tabelas e índices).");
  } catch (err) {
    logger.error("Falha ao inicializar schema do banco (initDb)", err);
    throw err;
  }
}

module.exports = initDb;
