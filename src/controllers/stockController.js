const productModel = require("../models/productModel");
const stockModel = require("../models/stockModel");

async function form(req, res) {
  const products = await productModel.list("");
  const movimentos = await stockModel.listRecent(30);
  return res.render("products/adjust-stock", { products, movimentos, error: null, success: null });
}

async function submit(req, res) {
  const { produto_id, tipo, quantidade, motivo } = req.body;
  const products = await productModel.list("");
  const movimentos = await stockModel.listRecent(30);

  try {
    const pid = Number(produto_id);
    if (!pid) {
      return res.status(400).render("products/adjust-stock", {
        products,
        movimentos,
        error: "Selecione um produto.",
        success: null
      });
    }
    await stockModel.adjust({
      produtoId: pid,
      tipo: String(tipo || "").trim(),
      quantidade,
      motivo
    });
    const mov2 = await stockModel.listRecent(30);
    return res.render("products/adjust-stock", {
      products,
      movimentos: mov2,
      error: null,
      success: "Movimentação registrada com sucesso."
    });
  } catch (e) {
    return res.status(400).render("products/adjust-stock", {
      products,
      movimentos,
      error: e.message || "Erro ao registrar.",
      success: null
    });
  }
}

module.exports = { form, submit };
