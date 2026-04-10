const productModel = require("../models/productModel");

async function index(req, res) {
  const search = req.query.search || "";
  const products = await productModel.list(search);
  return res.render("products/index", { products, search });
}

function createForm(req, res) {
  return res.render("products/form", { product: null, action: "/produtos", method: "POST" });
}

async function store(req, res) {
  await productModel.create(req.body);
  return res.redirect("/produtos");
}

async function editForm(req, res) {
  const product = await productModel.findById(req.params.id);
  return res.render("products/form", { product, action: `/produtos/${product.id}?_method=PUT`, method: "POST" });
}

async function update(req, res) {
  await productModel.update(req.params.id, req.body);
  return res.redirect("/produtos");
}

async function destroy(req, res) {
  await productModel.remove(req.params.id);
  return res.redirect("/produtos");
}

module.exports = { index, createForm, store, editForm, update, destroy };
