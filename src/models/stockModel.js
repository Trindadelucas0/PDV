const pool = require("../config/db");

async function listRecent(limit = 50) {
  return (
    await pool.query(
      `SELECT m.*, p.nome AS produto_nome
       FROM estoque_movimentacoes m
       JOIN produtos p ON p.id = m.produto_id
       ORDER BY m.created_at DESC
       LIMIT $1`,
      [limit]
    )
  ).rows;
}

/**
 * tipo: entrada | perda | inventario
 * - entrada: quantidade = unidades a adicionar
 * - perda: quantidade = unidades a remover
 * - inventario: quantidade = novo estoque contado (absoluto)
 */
async function adjust({ produtoId, tipo, quantidade, motivo }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pr = await client.query("SELECT id, nome, estoque FROM produtos WHERE id = $1 FOR UPDATE", [produtoId]);
    if (pr.rows.length === 0) {
      throw new Error("Produto não encontrado.");
    }
    const atual = pr.rows[0].estoque;
    let delta = 0;
    let qtdRegistro = 0;

    if (tipo === "entrada") {
      qtdRegistro = Math.abs(Math.floor(Number(quantidade)));
      if (qtdRegistro <= 0) throw new Error("Informe uma quantidade maior que zero.");
      delta = qtdRegistro;
      await client.query("UPDATE produtos SET estoque = estoque + $1 WHERE id = $2", [delta, produtoId]);
    } else if (tipo === "perda") {
      qtdRegistro = Math.abs(Math.floor(Number(quantidade)));
      if (qtdRegistro <= 0) throw new Error("Informe uma quantidade maior que zero.");
      if (atual < qtdRegistro) {
        throw new Error(`Estoque insuficiente para baixa. Atual: ${atual}.`);
      }
      delta = -qtdRegistro;
      await client.query("UPDATE produtos SET estoque = estoque - $1 WHERE id = $2", [qtdRegistro, produtoId]);
    } else if (tipo === "inventario") {
      const novo = Math.max(0, Math.floor(Number(quantidade)));
      delta = novo - atual;
      qtdRegistro = delta;
      await client.query("UPDATE produtos SET estoque = $1 WHERE id = $2", [novo, produtoId]);
    } else {
      throw new Error("Tipo de movimentação inválido.");
    }

    if (qtdRegistro !== 0) {
      await client.query(
        `INSERT INTO estoque_movimentacoes (produto_id, tipo, quantidade, motivo)
         VALUES ($1, $2, $3, $4)`,
        [produtoId, tipo, qtdRegistro, motivo || null]
      );
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { listRecent, adjust };
