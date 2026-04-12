const logger = require("../utils/logger");
const saleModel = require("../models/saleModel");
const { round2, computePaidBreakdown } = require("../utils/salePayment");

async function index(req, res) {
  const { startDate, endDate, pendente } = req.query;
  const somentePendente = pendente === "1" || pendente === "true";
  const sales = await saleModel.listByDate(startDate, endDate, { somentePendenteReceber: somentePendente });
  return res.render("sales/history", { sales, startDate, endDate, somentePendente });
}

async function details(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  return res.render("sales/details", { sale: data.sale, items: data.items });
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
  const modo = req.body.modo_pagamento || req.body.forma_pagamento || "Dinheiro";
  if (modo === "A receber") {
    return res.status(400).json({ error: "Escolha a forma em que o cliente está pagando agora." });
  }

  const b = computePaidBreakdown(modo, req.body, total);
  if (!b.ok) {
    return res.status(400).json({ error: b.error });
  }

  try {
    await saleModel.settleSalePayment(saleId, {
      formaPagamento: b.formaPagamentoStr,
      valorPago: b.valorPagoNum,
      troco: b.troco,
      parcelas: b.parcelas,
      pagamentoDinheiro: b.pagamentoDinheiro,
      pagamentoCartao: b.pagamentoCartao,
      pagamentoPix: b.pagamentoPix
    });
    return res.json({ ok: true });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }
    logger.error("Erro ao registrar recebimento", err);
    return res.status(500).json({ error: "Erro ao registrar pagamento. Tente novamente." });
  }
}

module.exports = { index, details, receber };
