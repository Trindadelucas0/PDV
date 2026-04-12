document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("global_loading_overlay");
  if (!overlay) return;

  const showLoading = () => {
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
  };

  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    const method = String(form.getAttribute("method") || "get").toLowerCase();
    if (method === "get") return;

    form.addEventListener("submit", (event) => {
      showLoading();
      const submitter = event.submitter;
      if (submitter) submitter.disabled = true;
      form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((btn) => {
        btn.disabled = true;
      });
    });
  });
});
