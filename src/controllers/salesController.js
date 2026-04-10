const logger = require("../utils/logger");
const productModel = require("../models/productModel");
const customerModel = require("../models/customerModel");
const saleModel = require("../models/saleModel");

const EPS = 0.02;
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
function clampParcelas(n) {
  const p = parseInt(n, 10);
  if (Number.isNaN(p)) return 1;
  return Math.min(12, Math.max(1, p));
}

async function index(req, res) {
  return res.render("sales/index");
}

async function getProductByCode(req, res) {
  const product = await productModel.findByBarcode(req.params.code);
  if (!product) return res.status(404).json({ error: "Produto não encontrado" });
  return res.json(product);
}

async function searchProducts(req, res) {
  const q = String(req.query.q || "").trim();
  const minLen = 2;
  if (q.length < minLen) {
    return res.json([]);
  }
  const rows = await productModel.search(q, 10);
  return res.json(rows);
}

async function finalize(req, res) {
  const { cliente, items, modo_pagamento, forma_pagamento } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Venda sem itens." });
  }

  const parsedItems = items.map((item) => ({
    id: Number(item.id),
    nome: item.nome,
    quantidade: Number(item.quantidade),
    preco: Number(item.preco),
    custo: Number(item.custo),
    subtotal: Number(item.subtotal)
  }));

  const total = round2(parsedItems.reduce((sum, i) => sum + i.subtotal, 0));
  const lucro = round2(parsedItems.reduce((sum, i) => sum + (i.preco - i.custo) * i.quantidade, 0));

  const modo = modo_pagamento || forma_pagamento || "Dinheiro";
  let formaPagamentoStr = modo;
  let valorPagoNum = 0;
  let troco = 0;
  let parcelas = 1;
  let pd = 0;
  let pc = 0;
  let pp = 0;

  if (modo === "Dinheiro") {
    pd = total;
    valorPagoNum = round2(Number(req.body.valor_recebido ?? req.body.valor_pago ?? 0));
    troco = Math.max(0, round2(valorPagoNum - total));
    formaPagamentoStr = "Dinheiro";
  } else if (modo === "Pix") {
    pp = total;
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = "Pix";
  } else if (modo === "Cartão") {
    pc = total;
    parcelas = clampParcelas(req.body.parcelas);
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = "Cartão";
  } else if (modo === "Misto") {
    pd = round2(Number(req.body.parte_dinheiro || 0));
    pc = round2(Number(req.body.parte_cartao || 0));
    pp = round2(Number(req.body.parte_pix || 0));
    parcelas = clampParcelas(req.body.parcelas);
    const soma = round2(pd + pc + pp);
    if (Math.abs(soma - total) > EPS) {
      return res.status(400).json({
        error: `A soma (Dinheiro + Cartão + Pix) deve ser R$ ${total.toFixed(2)}. Atual: R$ ${soma.toFixed(2)}.`
      });
    }
    const recebidoDinheiro = round2(Number(req.body.valor_recebido_dinheiro ?? pd));
    if (recebidoDinheiro + EPS < pd) {
      return res.status(400).json({ error: "Valor recebido em dinheiro não cobre a parte em dinheiro." });
    }
    troco = Math.max(0, round2(recebidoDinheiro - pd));
    valorPagoNum = round2(recebidoDinheiro + pc + pp);
    formaPagamentoStr = "Misto";
  } else {
    return res.status(400).json({ error: "Forma de pagamento inválida." });
  }

  try {
    const createdCustomer = await customerModel.findOrCreate(cliente || { nome: "Consumidor Final" });
    const sale = await saleModel.createSaleWithItems({
      clienteId: createdCustomer.id,
      total,
      lucro,
      formaPagamento: formaPagamentoStr,
      valorPago: valorPagoNum,
      troco,
      parcelas,
      pagamentoDinheiro: pd,
      pagamentoCartao: pc,
      pagamentoPix: pp,
      items: parsedItems
    });

    return res.json({ saleId: sale.id });
  } catch (err) {
    if (err.code === "INSUFFICIENT_STOCK" || err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }
    logger.error("Erro ao finalizar venda", err);
    return res.status(500).json({ error: "Erro ao finalizar venda. Tente novamente." });
  }
}

async function receipt(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  return res.render("sales/receipt", {
    sale: data.sale,
    items: data.items,
    store: {
      name: process.env.STORE_NAME || "Controle PDV",
      phone: process.env.STORE_PHONE || "",
      address: process.env.STORE_ADDRESS || ""
    }
  });
}

module.exports = { index, getProductByCode, searchProducts, finalize, receipt };
