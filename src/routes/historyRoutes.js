const express = require("express");
const controller = require("../controllers/historyController");

const router = express.Router();
router.get("/", controller.index);
router.get("/:id", controller.details);

module.exports = router;
