const express = require("express");
const controller = require("../controllers/salesController");

const router = express.Router();
router.get("/", controller.index);
router.get("/api/produtos", controller.searchProducts);
router.get("/produto/:code", controller.getProductByCode);
router.get("/ultima-venda/sessao", controller.getLastSessionSale);
router.post("/finalizar", controller.finalize);
router.get("/recibo/:id/fragment", controller.receiptFragment);
router.get("/recibo/:id.pdf", controller.receiptPdf);
router.get("/recibo/:id", controller.receipt);

module.exports = router;
