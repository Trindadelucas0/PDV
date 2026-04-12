const logger = require("../utils/logger");
const PDFDocument = require("pdfkit");
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
  const minLen = 1;
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

  const subtotalBruto = round2(parsedItems.reduce((sum, i) => sum + i.subtotal, 0));
  const lucroBruto = round2(parsedItems.reduce((sum, i) => sum + (i.preco - i.custo) * i.quantidade, 0));
  const descontoNum = Number(req.body.desconto || 0);
  if (!Number.isFinite(descontoNum)) {
    return res.status(400).json({ error: "Desconto inválido para o total da venda." });
  }
  const desconto = round2(descontoNum);
  if (desconto < 0 || desconto - subtotalBruto > EPS) {
    return res.status(400).json({ error: "Desconto inválido para o total da venda." });
  }
  const total = round2(subtotalBruto - desconto);
  const lucro = subtotalBruto > 0 ? round2(lucroBruto * (total / subtotalBruto)) : 0;

  const modo = modo_pagamento || forma_pagamento || "Dinheiro";
  const isCartaoCredito = modo === "Cartão" || modo === "Cartão crédito";
  const isCartaoDebito = modo === "Cartão débito";
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
  } else if (isCartaoCredito) {
    pc = total;
    parcelas = clampParcelas(req.body.parcelas);
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = modo === "Cartão crédito" ? "Cartão crédito" : "Cartão";
  } else if (isCartaoDebito) {
    pc = total;
    parcelas = 1;
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = "Cartão débito";
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
      desconto,
      formaPagamento: formaPagamentoStr,
      valorPago: valorPagoNum,
      troco,
      parcelas,
      pagamentoDinheiro: pd,
      pagamentoCartao: pc,
      pagamentoPix: pp,
      items: parsedItems
    });

    req.session.lastSaleId = sale.id;

    return res.json({ saleId: sale.id });
  } catch (err) {
    if (err.code === "INSUFFICIENT_STOCK" || err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }
    logger.error("Erro ao finalizar venda", err);
    return res.status(500).json({ error: "Erro ao finalizar venda. Tente novamente." });
  }
}

async function getLastSessionSale(req, res) {
  const saleId = Number(req.session?.lastSaleId || 0);
  if (!saleId) {
    return res.status(404).json({ error: "Nenhuma venda nesta sessão ainda." });
  }
  return res.json({ saleId });
}

async function receipt(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  const store = {
    name: process.env.STORE_NAME || "Controle PDV",
    phone: process.env.STORE_PHONE || "",
    address: process.env.STORE_ADDRESS || ""
  };
  return res.render("sales/receipt", {
    sale: data.sale,
    items: data.items,
    store
  });
}

async function receiptFragment(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  return res.render("sales/_receipt_content", {
    sale: data.sale,
    items: data.items,
    store: {
      name: process.env.STORE_NAME || "Controle PDV",
      phone: process.env.STORE_PHONE || "",
      address: process.env.STORE_ADDRESS || ""
    }
  });
}

async function receiptPdf(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  const { sale, items } = data;
  const store = {
    name: process.env.STORE_NAME || "Controle PDV",
    phone: process.env.STORE_PHONE || "",
    address: process.env.STORE_ADDRESS || ""
  };
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const desconto = round2(Number(sale.desconto || 0));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recibo-${sale.id}.pdf"`);

  const doc = new PDFDocument({ margin: 36, size: "A4" });
  doc.pipe(res);
  doc.font("Helvetica-Bold").fontSize(14).text(store.name, { align: "center" });
  if (store.phone) {
    doc.font("Helvetica").fontSize(10).text(`Tel: ${store.phone}`, { align: "center" });
  }
  if (store.address) {
    doc.font("Helvetica").fontSize(10).text(store.address, { align: "center" });
  }
  doc.moveDown(1);
  doc.font("Helvetica").fontSize(10);
  doc.text(`Venda N.: ${sale.id}`);
  doc.text(`Data: ${new Date(sale.created_at).toLocaleString("pt-BR")}`);
  doc.text(`Cliente: ${sale.cliente_nome || "Consumidor Final"}`);
  doc.text(`CPF: ${sale.cpf || "-"}`);
  doc.moveDown(0.6);
  doc.text("Itens", { underline: true });
  items.forEach((item) => {
    doc.text(`${item.nome} x${item.quantidade} .... R$ ${Number(item.subtotal).toFixed(2)}`);
  });
  doc.moveDown(0.8);
  doc.text(`Subtotal: R$ ${subtotal.toFixed(2)}`);
  if (desconto > 0) {
    doc.text(`Desconto: R$ ${desconto.toFixed(2)}`);
  }
  doc.font("Helvetica-Bold").text(`Total: R$ ${Number(sale.total).toFixed(2)}`);
  doc.font("Helvetica").text(`Forma: ${sale.forma_pagamento}`);
  if (Number(sale.pagamento_dinheiro) > 0) {
    doc.text(`Dinheiro: R$ ${Number(sale.pagamento_dinheiro).toFixed(2)}`);
  }
  if (Number(sale.pagamento_pix) > 0) {
    doc.text(`Pix: R$ ${Number(sale.pagamento_pix).toFixed(2)}`);
  }
  if (Number(sale.pagamento_cartao) > 0) {
    const parcelasTxt = Number(sale.parcelas) > 1 ? ` (${sale.parcelas}x)` : "";
    doc.text(`Cartão: R$ ${Number(sale.pagamento_cartao).toFixed(2)}${parcelasTxt}`);
  }
  doc.text(`Valor pago: R$ ${Number(sale.valor_pago).toFixed(2)}`);
  doc.text(`Troco: R$ ${Number(sale.troco).toFixed(2)}`);
  doc.moveDown(1);
  doc.text("Obrigado pela preferência!", { align: "center" });
  doc.end();
}

module.exports = { index, getProductByCode, searchProducts, finalize, getLastSessionSale, receipt, receiptFragment, receiptPdf };
