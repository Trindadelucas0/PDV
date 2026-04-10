const express = require("express");
const controller = require("../controllers/salesController");

const router = express.Router();
router.get("/", controller.index);
router.get("/api/produtos", controller.searchProducts);
router.get("/produto/:code", controller.getProductByCode);
router.post("/finalizar", controller.finalize);
router.get("/recibo/:id", controller.receipt);

module.exports = router;
