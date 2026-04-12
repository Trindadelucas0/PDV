const express = require("express");
const controller = require("../controllers/historyController");

const router = express.Router();
router.get("/", controller.index);
router.post("/:id/receber", controller.receber);
router.get("/:id", controller.details);

module.exports = router;
