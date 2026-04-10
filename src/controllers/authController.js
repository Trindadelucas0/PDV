function showLogin(req, res) {
  return res.render("auth/login", { error: null });
}

function login(req, res) {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    req.session.user = { username };
    return res.redirect("/");
  }
  return res.status(401).render("auth/login", { error: "Usuário ou senha inválidos." });
}

function logout(req, res) {
  req.session.destroy(() => res.redirect("/login"));
}

module.exports = { showLogin, login, logout };
