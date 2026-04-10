const express = require("express");
const { index } = require("../controllers/dashboardController");

const router = express.Router();
router.get("/", index);

module.exports = router;
