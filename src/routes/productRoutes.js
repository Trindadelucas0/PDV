const express = require("express");
const controller = require("../controllers/productController");

const router = express.Router();
router.get("/", controller.index);
router.get("/novo", controller.createForm);
router.post("/", controller.store);
router.get("/:id/editar", controller.editForm);
router.put("/:id", controller.update);
router.delete("/:id", controller.destroy);

module.exports = router;
