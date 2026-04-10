const express = require("express");
const controller = require("../controllers/stockController");

const router = express.Router();
router.get("/ajustar", controller.form);
router.post("/ajustar", controller.submit);

module.exports = router;
