const logger = require("../utils/logger");
const saleModel = require("../models/saleModel");
const { round2, computeRecebimentoBreakdown } = require("../utils/salePayment");

async function index(req, res) {
  const { startDate, endDate, pendente } = req.query;
  const somentePendente = pendente === "1" || pendente === "true";
  const sales = await saleModel.listByDate(startDate, endDate, { somentePendenteReceber: somentePendente });
  return res.render("sales/history", { sales, startDate, endDate, somentePendente });
}

async function details(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  const recebimentos = data.recebimentos || [];
  const recebidoAcumulado = round2(recebimentos.reduce((s, r) => s + Number(r.valor || 0), 0));
  const saldoEmAberto = round2(Number(data.sale.total) - recebidoAcumulado);
  return res.render("sales/details", {
    sale: data.sale,
    items: data.items,
    recebimentos,
    recebidoAcumulado,
    saldoEmAberto
  });
}

async function receber(req, res) {
  const saleId = Number(req.params.id);
  if (!Number.isFinite(saleId) || saleId < 1) {
    return res.status(400).json({ error: "ID de venda inválido." });
  }
  const data = await saleModel.findById(saleId);
  if (!data) {
    return res.status(404).json({ error: "Venda não encontrada." });
  }
  if ((data.sale.recebimento_status || "quitado") !== "pendente") {
    return res.status(409).json({ error: "Esta venda não está pendente de recebimento." });
  }

  const total = round2(Number(data.sale.total));
  const acum = await saleModel.sumRecebimentosBySaleId(saleId);
  const saldoRestante = round2(total - acum);
  const modo = req.body.modo_pagamento || req.body.forma_pagamento || "Dinheiro";
  if (modo === "A receber") {
    return res.status(400).json({ error: "Escolha a forma em que o cliente está pagando agora." });
  }

  const b = computeRecebimentoBreakdown(modo, req.body, saldoRestante);
  if (!b.ok) {
    return res.status(400).json({ error: b.error });
  }

  try {
    const result = await saleModel.registrarRecebimentoVenda(saleId, {
      formaPagamento: b.formaPagamentoStr,
      valorPago: b.valorPagoNum,
      troco: b.troco,
      parcelas: b.parcelas,
      pagamentoDinheiro: b.pagamentoDinheiro,
      pagamentoCartao: b.pagamentoCartao,
      pagamentoPix: b.pagamentoPix,
      valorAbate: b.valorAbate
    });
    return res.json({ ok: true, quitado: result.quitado, saldoRestante: result.saldoRestante });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    logger.error("Erro ao registrar recebimento", err);
    return res.status(500).json({ error: "Erro ao registrar pagamento. Tente novamente." });
  }
}

async function contasAReceber(req, res) {
  const contas = await saleModel.listContasAReceber();
  let somaSaldos = 0;
  for (const r of contas) {
    somaSaldos += round2(Number(r.total) - Number(r.recebido_acumulado));
  }
  somaSaldos = round2(somaSaldos);
  return res.render("sales/contas_a_receber", { contas, somaSaldos });
}

module.exports = { index, details, receber, contasAReceber };
