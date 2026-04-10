const saleModel = require("../models/saleModel");

async function index(req, res) {
  const today = new Date();
  const endDate = req.query.ate || today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(today.getDate() - 6);
  const startDate = req.query.de || start.toISOString().slice(0, 10);

  const { totals, ticketMedio, stockOverview, lowStock, latestSales, chartRows } = await saleModel.dashboardStats(
    startDate,
    endDate
  );
  return res.render("dashboard/index", {
    totals,
    ticketMedio,
    stockOverview,
    lowStock,
    latestSales,
    chartRows,
    startDate,
    endDate
  });
}

module.exports = { index };
