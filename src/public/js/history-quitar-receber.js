(function () {
  const root = document.getElementById("quitar_form_root");
  if (!root) return;

  const saleId = root.dataset.saleId;
  const total = Number(root.dataset.total || 0);

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function currency(v) {
    return `R$ ${Number(v).toFixed(2)}`;
  }

  function showMsg(text, isErr) {
    const el = document.getElementById("quitar_msg");
    if (!el) return;
    el.textContent = text;
    el.className = `text-sm mt-2 ${isErr ? "text-red-400" : "text-emerald-400"}`;
  }

  function togglePainel() {
    const modo = document.getElementById("hr_modo_pagamento").value;
    document.getElementById("hr_painel_dinheiro").classList.toggle("hidden", modo !== "Dinheiro");
    document.getElementById("hr_painel_pix").classList.toggle("hidden", modo !== "Pix");
    document.getElementById("hr_painel_cartao").classList.toggle("hidden", modo !== "Cartão crédito" && modo !== "Cartão");
    document.getElementById("hr_painel_misto").classList.toggle("hidden", modo !== "Misto");
    updateMistoHint();
  }

  function updateMistoHint() {
    const el = document.getElementById("hr_misto_soma_hint");
    if (!el) return;
    const pd = round2(Number(document.getElementById("hr_parte_dinheiro")?.value || 0));
    const pc = round2(Number(document.getElementById("hr_parte_cartao")?.value || 0));
    const pp = round2(Number(document.getElementById("hr_parte_pix")?.value || 0));
    const soma = round2(pd + pc + pp);
    const ok = Math.abs(soma - total) < 0.03;
    el.textContent = `Soma: ${currency(soma)} · Total: ${currency(total)} ${ok ? "(ok)" : "(ajuste)"}`;
    el.className = `text-xs font-medium ${ok ? "text-emerald-400" : "text-amber-300"}`;
  }

  document.getElementById("hr_modo_pagamento").addEventListener("change", togglePainel);
  document.querySelectorAll(".hr-modo-rapido").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("hr_modo_pagamento").value = btn.dataset.modo;
      togglePainel();
    });
  });
  ["hr_parte_dinheiro", "hr_parte_cartao", "hr_parte_pix", "hr_valor_recebido_dinheiro"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", updateMistoHint);
  });
  document.getElementById("hr_btn_restante_cartao")?.addEventListener("click", () => {
    const pd = round2(Number(document.getElementById("hr_parte_dinheiro").value || 0));
    const pp = round2(Number(document.getElementById("hr_parte_pix").value || 0));
    document.getElementById("hr_parte_cartao").value = Math.max(0, round2(total - pd - pp)).toFixed(2);
    updateMistoHint();
  });

  togglePainel();

  document.getElementById("hr_btn_quitar").addEventListener("click", async () => {
    const btn = document.getElementById("hr_btn_quitar");
    const modo = document.getElementById("hr_modo_pagamento").value;
    const body = { modo_pagamento: modo };
    if (modo === "Dinheiro") {
      body.valor_recebido = document.getElementById("hr_valor_recebido").value;
    } else if (modo === "Cartão" || modo === "Cartão crédito") {
      body.parcelas = document.getElementById("hr_parcelas_cartao").value;
    } else if (modo === "Cartão débito") {
      body.parcelas = 1;
    } else if (modo === "Misto") {
      body.parte_dinheiro = document.getElementById("hr_parte_dinheiro").value;
      body.parte_cartao = document.getElementById("hr_parte_cartao").value;
      body.parte_pix = document.getElementById("hr_parte_pix").value;
      body.parcelas = document.getElementById("hr_parcelas_misto").value;
      body.valor_recebido_dinheiro = document.getElementById("hr_valor_recebido_dinheiro").value;
      const pd = round2(Number(body.parte_dinheiro || 0));
      const pc = round2(Number(body.parte_cartao || 0));
      const pp = round2(Number(body.parte_pix || 0));
      if (Math.abs(pd + pc + pp - total) > 0.03) {
        showMsg(`A soma das partes deve ser ${currency(total)}.`, true);
        return;
      }
    }

    btn.disabled = true;
    showMsg("Registrando pagamento…", false);
    try {
      const res = await fetch(`/historico/${saleId}/receber`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        showMsg("Resposta inválida do servidor.", true);
        return;
      }
      if (!res.ok) {
        showMsg(data.error || "Não foi possível registrar.", true);
        return;
      }
      window.location.reload();
    } catch (e) {
      showMsg(e?.message || "Erro de rede.", true);
    } finally {
      btn.disabled = false;
    }
  });
})();
