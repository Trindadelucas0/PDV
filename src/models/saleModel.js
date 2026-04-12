const pool = require("../config/db");
const { EPS, round2 } = require("../utils/salePayment");

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

    if (status !== "pendente") {
      await client.query(
        `INSERT INTO venda_recebimentos (
           venda_id, valor, forma_pagamento, troco, parcelas,
           pagamento_dinheiro, pagamento_cartao, pagamento_pix, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sale.id,
          total,
          formaPagamento,
          troco,
          parcelas,
          pagamentoDinheiro,
          pagamentoCartao,
          pagamentoPix,
          recebidoSql
        ]
      );
    }

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

async function listRecebimentosBySaleId(vendaId) {
  const res = await pool.query(
    `SELECT * FROM venda_recebimentos WHERE venda_id = $1 ORDER BY created_at ASC, id ASC`,
    [vendaId]
  );
  return res.rows;
}

async function sumRecebimentosBySaleId(vendaId, client = pool) {
  const res = await client.query(
    `SELECT COALESCE(SUM(valor), 0) AS s FROM venda_recebimentos WHERE venda_id = $1`,
    [vendaId]
  );
  return round2(Number(res.rows[0].s));
}

/**
 * Registra um recebimento parcial ou final; insere em venda_recebimentos e
 * marca quitado quando o acumulado cobrir o total.
 */
async function registrarRecebimentoVenda(
  saleId,
  {
    formaPagamento,
    valorPago,
    troco,
    parcelas,
    pagamentoDinheiro,
    pagamentoCartao,
    pagamentoPix,
    valorAbate
  }
) {
  const abate = round2(Number(valorAbate));
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
    const total = round2(Number(row.total));
    const acum = await sumRecebimentosBySaleId(saleId, client);
    const saldo = round2(total - acum);
    if (abate < EPS) {
      const err = new Error("Valor do recebimento inválido.");
      err.statusCode = 400;
      throw err;
    }
    if (abate > saldo + EPS) {
      const err = new Error(`O valor excede o saldo (R$ ${saldo.toFixed(2)}).`);
      err.statusCode = 400;
      throw err;
    }

    await client.query(
      `INSERT INTO venda_recebimentos (
         venda_id, valor, forma_pagamento, troco, parcelas,
         pagamento_dinheiro, pagamento_cartao, pagamento_pix
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        saleId,
        abate,
        formaPagamento,
        troco,
        parcelas,
        pagamentoDinheiro,
        pagamentoCartao,
        pagamentoPix
      ]
    );

    const novoAcum = round2(acum + abate);
    const quitou = novoAcum >= total - EPS;

    if (quitou) {
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
    }

    await client.query("COMMIT");
    return { quitado: quitou, saldoRestante: quitou ? 0 : round2(total - novoAcum) };
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

  const recebimentos = await listRecebimentosBySaleId(id);

  return { sale, items, recebimentos };
}

async function listContasAReceber() {
  const res = await pool.query(
    `SELECT v.*, c.nome AS cliente_nome, c.cpf AS cliente_cpf, c.telefone,
      COALESCE((
        SELECT SUM(r.valor) FROM venda_recebimentos r WHERE r.venda_id = v.id
      ), 0) AS recebido_acumulado
     FROM vendas v
     LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE COALESCE(v.recebimento_status, 'quitado') = 'pendente'
     ORDER BY v.created_at DESC`
  );
  return res.rows;
}

function mergeChartByDay(startDate, endDate, caixaRows, lucroRows) {
  const dayKey = (d) => {
    if (!d) return "";
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d);
    return s.length >= 10 ? s.slice(0, 10) : s;
  };
  const cMap = new Map(caixaRows.map((r) => [dayKey(r.dia), r]));
  const lMap = new Map(lucroRows.map((r) => [dayKey(r.dia), r]));
  const out = [];
  const cur = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cur <= end) {
    const dia = cur.toISOString().slice(0, 10);
    const cr = cMap.get(dia);
    const lr = lMap.get(dia);
    out.push({
      dia,
      total: Number(cr?.total || 0),
      lucro: Number(lr?.lucro || 0),
      recebimentos: Number(cr?.recebimentos || 0),
      vendas_quitadas: Number(lr?.vendas_quitadas || 0)
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

async function dashboardStats(startDate, endDate) {
  const caixaAgg = (
    await pool.query(
      `SELECT
         COALESCE(SUM(vr.valor), 0) AS total_periodo,
         COUNT(*)::int AS qtd_recebimentos
       FROM venda_recebimentos vr
       WHERE DATE(vr.created_at) BETWEEN $1::date AND $2::date`,
      [startDate, endDate]
    )
  ).rows[0];

  const lucroAgg = (
    await pool.query(
      `SELECT
         COALESCE(SUM(v.lucro), 0) AS lucro_periodo,
         COUNT(*)::int AS qtd_vendas_quitadas
       FROM vendas v
       WHERE COALESCE(v.recebimento_status, 'quitado') = 'quitado'
         AND v.recebido_em IS NOT NULL
         AND DATE(v.recebido_em) BETWEEN $1::date AND $2::date`,
      [startDate, endDate]
    )
  ).rows[0];

  const totals = {
    total_periodo: Number(caixaAgg.total_periodo),
    lucro_periodo: Number(lucroAgg.lucro_periodo),
    qtd_recebimentos: Number(caixaAgg.qtd_recebimentos),
    qtd_vendas_quitadas: Number(lucroAgg.qtd_vendas_quitadas)
  };

  const ticketMedio =
    totals.qtd_recebimentos > 0 ? round2(totals.total_periodo / totals.qtd_recebimentos) : 0;

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
      `SELECT vr.id AS recebimento_id, vr.venda_id, vr.valor, vr.forma_pagamento, vr.created_at,
              v.total AS venda_total, v.recebimento_status, c.nome AS cliente_nome
       FROM venda_recebimentos vr
       JOIN vendas v ON v.id = vr.venda_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE DATE(vr.created_at) BETWEEN $1::date AND $2::date
       ORDER BY vr.created_at DESC, vr.id DESC
       LIMIT 10`,
      [startDate, endDate]
    )
  ).rows;

  const caixaByDay = (
    await pool.query(
      `SELECT DATE(vr.created_at)::text AS dia,
         COALESCE(SUM(vr.valor), 0) AS total,
         COUNT(*)::int AS recebimentos
       FROM venda_recebimentos vr
       WHERE DATE(vr.created_at) BETWEEN $1::date AND $2::date
       GROUP BY DATE(vr.created_at)
       ORDER BY DATE(vr.created_at)`,
      [startDate, endDate]
    )
  ).rows;

  const lucroByDay = (
    await pool.query(
      `SELECT DATE(v.recebido_em)::text AS dia,
         COALESCE(SUM(v.lucro), 0) AS lucro,
         COUNT(*)::int AS vendas_quitadas
       FROM vendas v
       WHERE COALESCE(v.recebimento_status, 'quitado') = 'quitado'
         AND v.recebido_em IS NOT NULL
         AND DATE(v.recebido_em) BETWEEN $1::date AND $2::date
       GROUP BY DATE(v.recebido_em)
       ORDER BY DATE(v.recebido_em)`,
      [startDate, endDate]
    )
  ).rows;

  const chartRows = mergeChartByDay(startDate, endDate, caixaByDay, lucroByDay);

  return { totals, ticketMedio, stockOverview, lowStock, latestSales, chartRows };
}

module.exports = {
  createSaleWithItems,
  insufficientStockError,
  listRecebimentosBySaleId,
  sumRecebimentosBySaleId,
  registrarRecebimentoVenda,
  listByDate,
  findById,
  listContasAReceber,
  dashboardStats
};
