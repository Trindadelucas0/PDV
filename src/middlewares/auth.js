function requireAuth(req, res, next) {
  if (!req.session || !req.session.isAuthenticated) {
    return res.redirect("/login");
  }
  return next();
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect("/");
  }
  return next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
