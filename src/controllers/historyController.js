const saleModel = require("../models/saleModel");

async function index(req, res) {
  const { startDate, endDate } = req.query;
  const sales = await saleModel.listByDate(startDate, endDate);
  return res.render("sales/history", { sales, startDate, endDate });
}

async function details(req, res) {
  const data = await saleModel.findById(req.params.id);
  if (!data) return res.status(404).send("Venda não encontrada.");
  return res.render("sales/details", { sale: data.sale, items: data.items });
}

module.exports = { index, details };
