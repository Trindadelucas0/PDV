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
  recebimentoStatus = "quitado",
  recebidoEm = null,
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

    const status = recebimentoStatus === "pendente" ? "pendente" : "quitado";
    const recebidoSql =
      status === "pendente" ? null : recebidoEm instanceof Date ? recebidoEm : new Date();

    const saleResult = await client.query(
      `INSERT INTO vendas (
         cliente_id, total, lucro, desconto, forma_pagamento, valor_pago, troco,
         parcelas, pagamento_dinheiro, pagamento_cartao, pagamento_pix,
         recebimento_status, recebido_em
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        pagamentoPix,
        status,
        recebidoSql
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

async function settleSalePayment(
  saleId,
  {
    formaPagamento,
    valorPago,
    troco,
    parcelas,
    pagamentoDinheiro,
    pagamentoCartao,
    pagamentoPix
  }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      `SELECT id, total, recebimento_status FROM vendas WHERE id = $1 FOR UPDATE`,
      [saleId]
    );
    if (lock.rows.length === 0) {
      throw new Error("Venda não encontrada.");
    }
    const row = lock.rows[0];
    if (row.recebimento_status !== "pendente") {
      const err = new Error("Esta venda já foi quitada ou não está pendente de recebimento.");
      err.statusCode = 409;
      throw err;
    }
    await client.query(
      `UPDATE vendas SET
         forma_pagamento = $1,
         valor_pago = $2,
         troco = $3,
         parcelas = $4,
         pagamento_dinheiro = $5,
         pagamento_cartao = $6,
         pagamento_pix = $7,
         recebimento_status = 'quitado',
         recebido_em = NOW()
       WHERE id = $8`,
      [
        formaPagamento,
        valorPago,
        troco,
        parcelas,
        pagamentoDinheiro,
        pagamentoCartao,
        pagamentoPix,
        saleId
      ]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function listByDate(startDate, endDate, opts = {}) {
  const somentePendente = Boolean(opts.somentePendenteReceber);
  let query = `
    SELECT v.*, c.nome AS cliente_nome, c.cpf AS cliente_cpf
    FROM vendas v
    LEFT JOIN clientes c ON c.id = v.cliente_id
  `;
  const values = [];
  const cond = [];
  if (startDate && endDate) {
    values.push(startDate, endDate);
    cond.push(`DATE(v.created_at) BETWEEN $${values.length - 1} AND $${values.length}`);
  }
  if (somentePendente) {
    cond.push(`COALESCE(v.recebimento_status, 'quitado') = 'pendente'`);
  }
  if (cond.length) {
    query += ` WHERE ${cond.join(" AND ")} `;
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
  const dateExpr = `DATE(COALESCE(v.recebido_em, v.created_at))`;
  const caixaFilter = `COALESCE(v.recebimento_status, 'quitado') = 'quitado'`;

  const totals = (
    await pool.query(
      `SELECT
         COALESCE(SUM(v.total), 0) AS total_periodo,
         COALESCE(SUM(v.lucro), 0) AS lucro_periodo,
         COUNT(*) AS qtd_vendas
       FROM vendas v
       WHERE ${dateExpr} BETWEEN $1 AND $2 AND ${caixaFilter}`,
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
      `SELECT v.id, v.total, v.forma_pagamento, v.created_at, v.recebimento_status, c.nome AS cliente_nome
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE ${dateExpr} BETWEEN $1 AND $2 AND ${caixaFilter}
       ORDER BY COALESCE(v.recebido_em, v.created_at) DESC
       LIMIT 10`,
      [startDate, endDate]
    )
  ).rows;

  const chartRows = (
    await pool.query(
      `SELECT
         ${dateExpr} AS dia,
         COALESCE(SUM(v.total), 0) AS total,
         COALESCE(SUM(v.lucro), 0) AS lucro,
         COUNT(*) AS vendas
       FROM vendas v
       WHERE ${dateExpr} BETWEEN $1 AND $2 AND ${caixaFilter}
       GROUP BY ${dateExpr}
       ORDER BY ${dateExpr}`,
      [startDate, endDate]
    )
  ).rows;

  return { totals, ticketMedio, stockOverview, lowStock, latestSales, chartRows };
}

module.exports = {
  createSaleWithItems,
  insufficientStockError,
  settleSalePayment,
  listByDate,
  findById,
  dashboardStats
};
