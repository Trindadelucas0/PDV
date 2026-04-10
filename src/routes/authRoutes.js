const express = require("express");
const { showLogin, login, logout } = require("../controllers/authController");
const { redirectIfAuthenticated } = require("../middlewares/auth");

const router = express.Router();

router.get("/login", redirectIfAuthenticated, showLogin);
router.post("/login", redirectIfAuthenticated, login);
router.post("/logout", logout);

module.exports = router;
