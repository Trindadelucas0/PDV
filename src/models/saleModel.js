const pool = require("../config/db");

function insufficientStockError(nomeProduto, disponivel, solicitado) {
  const err = new Error(
    `Estoque insuficiente para "${nomeProduto}". Disponível: ${disponivel}, solicitado: ${solicitado}.`
  );
  err.code = "INSUFFICIENT_STOCK";
  err.statusCode = 409;
  return err;
}

async function createSaleWithItems({
  clienteId,
  total,
  lucro,
  desconto = 0,
  formaPagamento,
  valorPago,
  troco,
  parcelas = 1,
  pagamentoDinheiro = 0,
  pagamentoCartao = 0,
  pagamentoPix = 0,
  items
}) {
  const need = new Map();
  for (const item of items) {
    const id = Number(item.id);
    need.set(id, (need.get(id) || 0) + Number(item.quantidade));
  }
  const sortedIds = [...need.keys()].sort((a, b) => a - b);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const pid of sortedIds) {
      const qty = need.get(pid);
      const lockRes = await client.query(
        `SELECT id, nome, estoque FROM produtos WHERE id = $1 FOR UPDATE`,
        [pid]
      );
      if (lockRes.rows.length === 0) {
        throw new Error(`Produto não encontrado (id ${pid}).`);
      }
      const row = lockRes.rows[0];
      if (row.estoque < qty) {
        throw insufficientStockError(row.nome, row.estoque, qty);
      }
    }

    const saleResult = await client.query(
      `INSERT INTO vendas (
         cliente_id, total, lucro, desconto, forma_pagamento, valor_pago, troco,
         parcelas, pagamento_dinheiro, pagamento_cartao, pagamento_pix
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        clienteId,
        total,
        lucro,
        desconto,
        formaPagamento,
        valorPago,
        troco,
        parcelas,
        pagamentoDinheiro,
        pagamentoCartao,
        pagamentoPix
      ]
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco, custo, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.id, item.quantidade, item.preco, item.custo, item.subtotal]
      );

      await client.query("UPDATE produtos SET estoque = estoque - $1 WHERE id = $2", [item.quantidade, item.id]);
    }

    await client.query("COMMIT");
    return sale;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listByDate(startDate, endDate) {
  let query = `
    SELECT v.*, c.nome AS cliente_nome, c.cpf AS cliente_cpf
    FROM vendas v
    LEFT JOIN clientes c ON c.id = v.cliente_id
  `;
  const values = [];
  if (startDate && endDate) {
    query += " WHERE DATE(v.created_at) BETWEEN $1 AND $2 ";
    values.push(startDate, endDate);
  }
  query += " ORDER BY v.created_at DESC";
  return (await pool.query(query, values)).rows;
}

async function findById(id) {
  const sale = (
    await pool.query(
      `SELECT v.*, c.nome AS cliente_nome, c.cpf, c.telefone, c.email, c.endereco
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1`,
      [id]
    )
  ).rows[0];

  if (!sale) return null;

  const items = (
    await pool.query(
      `SELECT vi.*, p.nome
       FROM venda_itens vi
       JOIN produtos p ON p.id = vi.produto_id
       WHERE vi.venda_id = $1`,
      [id]
    )
  ).rows;

  return { sale, items };
}

async function dashboardStats(startDate, endDate) {
  const totals = (
    await pool.query(
      `SELECT
         COALESCE(SUM(total), 0) AS total_periodo,
         COALESCE(SUM(lucro), 0) AS lucro_periodo,
         COUNT(*) AS qtd_vendas
       FROM vendas
       WHERE DATE(created_at) BETWEEN $1 AND $2`,
      [startDate, endDate]
    )
  ).rows[0];

  const ticketMedio =
    Number(totals.qtd_vendas) > 0 ? Number(totals.total_periodo) / Number(totals.qtd_vendas) : 0;

  const stockOverview = (
    await pool.query(
      `SELECT
         COALESCE(SUM(estoque), 0) AS unidades_estoque,
         COALESCE(SUM(estoque * custo), 0) AS valor_custo_estoque,
         COALESCE(SUM(estoque * preco), 0) AS valor_venda_estoque
       FROM produtos`
    )
  ).rows[0];

  const lowStock = (await pool.query("SELECT * FROM produtos WHERE estoque <= 5 ORDER BY estoque ASC LIMIT 10")).rows;
  const latestSales = (
    await pool.query(
      `SELECT v.id, v.total, v.forma_pagamento, v.created_at, c.nome AS cliente_nome
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE DATE(v.created_at) BETWEEN $1 AND $2
       ORDER BY v.created_at DESC
       LIMIT 10`,
      [startDate, endDate]
    )
  ).rows;

  const chartRows = (
    await pool.query(
      `SELECT
         DATE(created_at) AS dia,
         COALESCE(SUM(total), 0) AS total,
         COALESCE(SUM(lucro), 0) AS lucro,
         COUNT(*) AS vendas
       FROM vendas
       WHERE DATE(created_at) BETWEEN $1 AND $2
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [startDate, endDate]
    )
  ).rows;

  return { totals, ticketMedio, stockOverview, lowStock, latestSales, chartRows };
}

module.exports = { createSaleWithItems, insufficientStockError, listByDate, findById, dashboardStats };
