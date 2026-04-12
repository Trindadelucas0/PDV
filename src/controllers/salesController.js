const logger = require("../utils/logger");
const PDFDocument = require("pdfkit");
const productModel = require("../models/productModel");
const customerModel = require("../models/customerModel");
const saleModel = require("../models/saleModel");
const { round2, computePaidBreakdown } = require("../utils/salePayment");

const EPS = 0.02;

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

  let formaPagamentoStr;
  let valorPagoNum = 0;
  let troco = 0;
  let parcelas = 1;
  let pd = 0;
  let pc = 0;
  let pp = 0;
  let recebimentoStatus = "quitado";
  let recebidoEm = null;

  if (modo === "A receber") {
    const nome = String(cliente?.nome || "").trim();
    const tel = String(cliente?.telefone || "").replace(/\D/g, "");
    const cpfDigits = String(cliente?.cpf || "").replace(/\D/g, "");
    if (nome.length < 2 || nome.toLowerCase() === "consumidor final") {
      return res.status(400).json({ error: "Informe o nome do cliente para venda a receber." });
    }
    if (tel.length < 8 && cpfDigits.length < 11) {
      return res.status(400).json({ error: "Informe telefone ou CPF válido do cliente para venda a receber." });
    }
    formaPagamentoStr = "A receber";
    valorPagoNum = 0;
    troco = 0;
    parcelas = 1;
    pd = 0;
    pc = 0;
    pp = 0;
    recebimentoStatus = "pendente";
    recebidoEm = null;
  } else {
    const b = computePaidBreakdown(modo, req.body, total);
    if (!b.ok) {
      return res.status(400).json({ error: b.error });
    }
    formaPagamentoStr = b.formaPagamentoStr;
    valorPagoNum = b.valorPagoNum;
    troco = b.troco;
    parcelas = b.parcelas;
    pd = b.pagamentoDinheiro;
    pc = b.pagamentoCartao;
    pp = b.pagamentoPix;
    recebimentoStatus = "quitado";
    recebidoEm = new Date();
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
      recebimentoStatus,
      recebidoEm,
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
  const data = await saleModel.findById(saleId);
  if (!data) {
    return res.status(404).json({ error: "Venda da sessão não encontrada." });
  }
  const { sale } = data;
  return res.json({
    saleId,
    resumo: {
      id: sale.id,
      total: Number(sale.total),
      createdAt: sale.created_at,
      clienteNome: sale.cliente_nome || "Consumidor final",
      formaPagamento: sale.forma_pagamento,
      recebimentoStatus: sale.recebimento_status || "quitado"
    }
  });
}

function receiptFinanceiro(data) {
  const recebimentos = data.recebimentos || [];
  const recebidoAcumulado = round2(recebimentos.reduce((s, r) => s + Number(r.valor || 0), 0));
  const saldoEmAberto = round2(Number(data.sale.total) - recebidoAcumulado);
  return { recebimentos, recebidoAcumulado, saldoEmAberto };
}

async function receipt(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  const store = {
    name: process.env.STORE_NAME || "Controle PDV",
    phone: process.env.STORE_PHONE || "",
    address: process.env.STORE_ADDRESS || ""
  };
  const fin = receiptFinanceiro(data);
  return res.render("sales/receipt", {
    sale: data.sale,
    items: data.items,
    store,
    ...fin
  });
}

async function receiptFragment(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  const fin = receiptFinanceiro(data);
  return res.render("sales/_receipt_content", {
    sale: data.sale,
    items: data.items,
    store: {
      name: process.env.STORE_NAME || "Controle PDV",
      phone: process.env.STORE_PHONE || "",
      address: process.env.STORE_ADDRESS || ""
    },
    ...fin
  });
}

async function receiptPdf(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  const { sale, items } = data;
  const fin = receiptFinanceiro(data);
  const { recebimentos, recebidoAcumulado, saldoEmAberto } = fin;
  const store = {
    name: process.env.STORE_NAME || "Controle PDV",
    phone: process.env.STORE_PHONE || "",
    address: process.env.STORE_ADDRESS || ""
  };
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const desconto = round2(Number(sale.desconto || 0));
  const pendente = (sale.recebimento_status || "quitado") === "pendente";

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
  doc.font("Helvetica").text(`Forma (venda): ${sale.forma_pagamento}`);
  if (recebimentos.length > 0) {
    doc.moveDown(0.4);
    doc.text("Recebimentos registrados:", { underline: true });
    recebimentos.forEach((r) => {
      const dt = new Date(r.created_at).toLocaleString("pt-BR");
      doc.text(`  ${dt} — ${r.forma_pagamento} — R$ ${Number(r.valor).toFixed(2)}`);
    });
  }
  doc.moveDown(0.3);
  doc.text(`Total recebido no caixa: R$ ${recebidoAcumulado.toFixed(2)}`);
  if (pendente) {
    doc.text(`Saldo em aberto: R$ ${saldoEmAberto.toFixed(2)}`);
    doc.font("Helvetica-Bold").fillColor("red").text("PAGAMENTO PARCIAL OU PENDENTE.", { underline: false });
    doc.fillColor("black");
  }
  if (!pendente) {
    if (Number(sale.pagamento_dinheiro) > 0) {
      doc.text(`Ultimo pagamento — Dinheiro: R$ ${Number(sale.pagamento_dinheiro).toFixed(2)}`);
    }
    if (Number(sale.pagamento_pix) > 0) {
      doc.text(`Ultimo pagamento — Pix: R$ ${Number(sale.pagamento_pix).toFixed(2)}`);
    }
    if (Number(sale.pagamento_cartao) > 0) {
      const parcelasTxt = Number(sale.parcelas) > 1 ? ` (${sale.parcelas}x)` : "";
      doc.text(`Ultimo pagamento — Cartao: R$ ${Number(sale.pagamento_cartao).toFixed(2)}${parcelasTxt}`);
    }
    doc.text(`Valor pago (ultimo recebimento): R$ ${Number(sale.valor_pago).toFixed(2)}`);
    doc.text(`Troco (ultimo recebimento): R$ ${Number(sale.troco).toFixed(2)}`);
  }
  doc.moveDown(1);
  doc.text("Obrigado pela preferência!", { align: "center" });
  doc.end();
}

module.exports = { index, getProductByCode, searchProducts, finalize, getLastSessionSale, receipt, receiptFragment, receiptPdf };
