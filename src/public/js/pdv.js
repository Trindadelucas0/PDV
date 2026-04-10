const items = [];
let debounceTimer = null;
let sugestoesLista = [];
let selectedSugIndex = -1;
let activeSearchController = null;

function showToast(message, type = "info") {
  const root = document.getElementById("toast_root");
  if (!root) return;
  const el = document.createElement("div");
  const bg =
    type === "success"
      ? "bg-amber-500 text-neutral-950"
      : type === "error"
        ? "bg-red-700"
        : "bg-neutral-800 text-amber-100 border border-amber-500/25";
  el.className = `${bg} text-sm px-4 py-2 rounded-lg shadow-lg pointer-events-auto`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3500);
}

function currency(v) {
  return `R$ ${Number(v).toFixed(2)}`;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function renderTable() {
  const tbody = document.querySelector("#itemsTable tbody");
  tbody.innerHTML = "";
  items.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.className = "border-t border-slate-800 text-slate-200";
    tr.innerHTML = `
      <td class="p-2">${item.nome}</td>
      <td class="p-2 text-center">
        <input data-idx="${index}" class="qty bg-neutral-950 border border-slate-700 text-slate-100 w-16 text-center rounded" type="number" min="1" value="${item.quantidade}" />
      </td>
      <td class="p-2 text-center">${currency(item.preco)}</td>
      <td class="p-2 text-center">${currency(item.subtotal)}</td>
      <td class="p-2 text-center"><button type="button" data-idx="${index}" class="remove text-red-400 hover:text-red-300 hover:underline">Remover</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".remove").forEach((btn) => {
    btn.onclick = () => {
      items.splice(Number(btn.dataset.idx), 1);
      updateTotals();
      renderTable();
    };
  });

  document.querySelectorAll(".qty").forEach((input) => {
    input.onchange = () => {
      const idx = Number(input.dataset.idx);
      items[idx].quantidade = Number(input.value);
      items[idx].subtotal = round2(items[idx].quantidade * items[idx].preco);
      updateTotals();
      renderTable();
    };
  });
}

function getTotalVenda() {
  return round2(items.reduce((sum, i) => sum + i.subtotal, 0));
}

function togglePainelPagamento() {
  const modo = document.getElementById("modo_pagamento").value;
  document.getElementById("painel_dinheiro").classList.toggle("hidden", modo !== "Dinheiro");
  document.getElementById("painel_pix").classList.toggle("hidden", modo !== "Pix");
  document.getElementById("painel_cartao").classList.toggle("hidden", modo !== "Cartão");
  document.getElementById("painel_misto").classList.toggle("hidden", modo !== "Misto");
  updateTotals();
}

function updateMistoHint() {
  const el = document.getElementById("misto_soma_hint");
  if (!el) return;
  const total = getTotalVenda();
  const pd = round2(Number(document.getElementById("parte_dinheiro")?.value || 0));
  const pc = round2(Number(document.getElementById("parte_cartao")?.value || 0));
  const pp = round2(Number(document.getElementById("parte_pix")?.value || 0));
  const soma = round2(pd + pc + pp);
  const ok = Math.abs(soma - total) < 0.03;
  el.textContent = `Soma: ${currency(soma)} · Total: ${currency(total)} ${ok ? "(ok)" : "(ajuste para fechar)"}`;
  el.className = `text-xs font-medium ${ok ? "text-emerald-400" : "text-amber-300"}`;
}

function updateTotals() {
  const total = getTotalVenda();
  const modo = document.getElementById("modo_pagamento").value;
  let troco = 0;

  if (modo === "Dinheiro") {
    const recebido = round2(Number(document.getElementById("valor_recebido")?.value || 0));
    troco = Math.max(0, round2(recebido - total));
  } else if (modo === "Misto") {
    const pd = round2(Number(document.getElementById("parte_dinheiro")?.value || 0));
    const recebidoD = round2(Number(document.getElementById("valor_recebido_dinheiro")?.value || pd));
    troco = Math.max(0, round2(recebidoD - pd));
    updateMistoHint();
  } else {
    troco = 0;
  }

  document.getElementById("total").innerText = currency(total);
  document.getElementById("troco").innerText = currency(troco);
}

function addProductFromJson(product) {
  const exists = items.find((i) => i.id === product.id);
  if (exists) {
    exists.quantidade += 1;
    exists.subtotal = round2(exists.quantidade * exists.preco);
  } else {
    items.push({
      id: product.id,
      nome: product.nome,
      quantidade: 1,
      preco: Number(product.preco),
      custo: Number(product.custo),
      subtotal: Number(product.preco)
    });
  }
  showToast(`${product.nome} adicionado`, "success");
  updateTotals();
  renderTable();
}

function hideSugestoes() {
  const box = document.getElementById("sugestoes");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
  sugestoesLista = [];
  selectedSugIndex = -1;
}

function renderSugestoes(lista) {
  const box = document.getElementById("sugestoes");
  if (!lista.length) {
    hideSugestoes();
    return;
  }
  sugestoesLista = lista;
  if (selectedSugIndex >= lista.length) selectedSugIndex = lista.length - 1;
  box.innerHTML = lista
    .map(
      (p, i) =>
        `<div role="option" data-idx="${i}" class="sug-item w-full text-left px-3 py-2 text-sm cursor-pointer border-b border-slate-800 last:border-0 ${i === selectedSugIndex ? "bg-amber-500/20" : "hover:bg-neutral-900"}">
          <span class="font-medium text-amber-100">${escapeHtml(p.nome)}</span>
          <span class="text-slate-300 text-xs ml-2">${escapeHtml(p.codigo_barras)} · ${currency(p.preco)} · est. ${p.estoque}</span>
        </div>`
    )
    .join("");
  box.classList.remove("hidden");
  box.querySelectorAll(".sug-item").forEach((item) => {
    item.onmousedown = (e) => {
      e.preventDefault();
      const p = lista[Number(item.dataset.idx)];
      addProductFromJson(p);
      document.getElementById("busca_produto").value = "";
      hideSugestoes();
      document.getElementById("busca_produto").focus();
    };
  });
}

function selectSuggestionByIndex(idx) {
  if (!sugestoesLista.length) return;
  selectedSugIndex = Math.max(0, Math.min(idx, sugestoesLista.length - 1));
  renderSugestoes(sugestoesLista);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function buscarSugestoes(q) {
  if (q.length === 0) {
    hideSugestoes();
    if (activeSearchController) {
      activeSearchController.abort();
      activeSearchController = null;
    }
    return;
  }
  if (activeSearchController) activeSearchController.abort();
  activeSearchController = new AbortController();
  const ld = document.getElementById("busca_loading");
  if (ld) ld.classList.remove("hidden");
  try {
    const res = await fetch(`/vendas/api/produtos?q=${encodeURIComponent(q)}`, {
      signal: activeSearchController.signal
    });
    if (!res.ok) {
      showToast("Não foi possível buscar produtos.", "error");
      return;
    }
    const data = await res.json();
    selectedSugIndex = data.length ? 0 : -1;
    renderSugestoes(data);
  } catch (e) {
    if (e?.name === "AbortError") return;
    showToast("Erro de rede. Verifique a conexão.", "error");
    hideSugestoes();
  } finally {
    if (ld) ld.classList.add("hidden");
  }
}

async function tryProdutoPorCodigoExato(code) {
  try {
    const res = await fetch(`/vendas/produto/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function tryAddFromInput() {
  const input = document.getElementById("busca_produto");
  const text = input.value.trim();
  if (!text) return;

  let porCodigo;
  try {
    porCodigo = await tryProdutoPorCodigoExato(text);
  } catch (e) {
    showToast("Erro de rede.", "error");
    return;
  }
  if (porCodigo) {
    addProductFromJson(porCodigo);
    input.value = "";
    hideSugestoes();
    return;
  }

  if (sugestoesLista.length === 1) {
    addProductFromJson(sugestoesLista[0]);
    input.value = "";
    hideSugestoes();
    return;
  }

  if (sugestoesLista.length > 1) {
    const exato = sugestoesLista.find((p) => p.codigo_barras === text);
    if (exato) {
      addProductFromJson(exato);
      input.value = "";
      hideSugestoes();
      return;
    }
    showToast("Vários resultados — clique em um na lista.", "info");
    return;
  }

  try {
    const res = await fetch(`/vendas/api/produtos?q=${encodeURIComponent(text)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.length === 1) {
        addProductFromJson(data[0]);
        input.value = "";
        hideSugestoes();
        return;
      }
    }
  } catch (e) {
    showToast("Erro de rede.", "error");
    return;
  }
  showToast("Produto não encontrado. Use 1+ letra ou o código completo.", "error");
}

document.getElementById("busca_produto").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => buscarSugestoes(q), 140);
});

document.getElementById("busca_produto").addEventListener("keydown", (e) => {
  const listVisible = sugestoesLista.length > 0;
  if (e.key === "ArrowDown" && listVisible) {
    e.preventDefault();
    if (selectedSugIndex < 0) {
      selectSuggestionByIndex(0);
    } else {
      selectSuggestionByIndex(selectedSugIndex + 1);
    }
    return;
  }
  if (e.key === "ArrowUp" && listVisible) {
    e.preventDefault();
    if (selectedSugIndex < 0) {
      selectSuggestionByIndex(0);
    } else {
      selectSuggestionByIndex(selectedSugIndex - 1);
    }
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    hideSugestoes();
    return;
  }
  if (e.key === "Tab" && listVisible) {
    hideSugestoes();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (listVisible && selectedSugIndex >= 0) {
      addProductFromJson(sugestoesLista[selectedSugIndex]);
      e.currentTarget.value = "";
      hideSugestoes();
      return;
    }
    tryAddFromInput();
  }
});

document.getElementById("addBtn").addEventListener("click", tryAddFromInput);

document.addEventListener("click", (e) => {
  const wrap = document.querySelector(".relative.mb-2");
  if (wrap && !wrap.contains(e.target)) hideSugestoes();
});

document.getElementById("modo_pagamento").addEventListener("change", togglePainelPagamento);
document.getElementById("valor_recebido").addEventListener("input", updateTotals);
["parte_dinheiro", "parte_cartao", "parte_pix", "valor_recebido_dinheiro"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateTotals);
});

document.getElementById("btn_restante_cartao").addEventListener("click", () => {
  const total = getTotalVenda();
  const pd = round2(Number(document.getElementById("parte_dinheiro").value || 0));
  const pp = round2(Number(document.getElementById("parte_pix").value || 0));
  document.getElementById("parte_cartao").value = Math.max(0, round2(total - pd - pp)).toFixed(2);
  updateTotals();
});

togglePainelPagamento();

async function finalizeSale() {
  if (!items.length) {
    showToast("Adicione itens antes de finalizar.", "error");
    return;
  }
  const modo = document.getElementById("modo_pagamento").value;
  const total = getTotalVenda();

  const body = {
    cliente: {
      nome: document.getElementById("cliente_nome").value || "Consumidor Final",
      cpf: document.getElementById("cliente_cpf").value,
      telefone: document.getElementById("cliente_tel").value,
      email: document.getElementById("cliente_email").value,
      endereco: document.getElementById("cliente_endereco").value
    },
    items,
    modo_pagamento: modo
  };

  if (modo === "Dinheiro") {
    body.valor_recebido = document.getElementById("valor_recebido").value;
  } else if (modo === "Cartão") {
    body.parcelas = document.getElementById("parcelas_cartao").value;
  } else if (modo === "Misto") {
    body.parte_dinheiro = document.getElementById("parte_dinheiro").value;
    body.parte_cartao = document.getElementById("parte_cartao").value;
    body.parte_pix = document.getElementById("parte_pix").value;
    body.parcelas = document.getElementById("parcelas_misto").value;
    body.valor_recebido_dinheiro = document.getElementById("valor_recebido_dinheiro").value;
    const pd = round2(Number(body.parte_dinheiro || 0));
    const pc = round2(Number(body.parte_cartao || 0));
    const pp = round2(Number(body.parte_pix || 0));
    if (Math.abs(pd + pc + pp - total) > 0.03) {
      showToast(`A soma das partes deve ser ${currency(total)}.`, "error");
      return;
    }
  }

  try {
    const response = await fetch("/vendas/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let result = {};
    try {
      result = await response.json();
    } catch (e) {
      showToast("Resposta inválida do servidor.", "error");
      return;
    }
    if (!response.ok) {
      showToast(result.error || "Erro ao finalizar venda.", response.status === 409 ? "error" : "error");
      return;
    }
    window.location.href = `/vendas/recibo/${result.saleId}`;
  } catch (e) {
    showToast("Erro de rede. Tente novamente.", "error");
  }
}

document.getElementById("finishBtn").addEventListener("click", finalizeSale);

document.addEventListener("keydown", (e) => {
  if (e.key === "F2") {
    e.preventDefault();
    const el = document.getElementById("busca_produto");
    if (el) el.focus();
  } else if (e.key === "F4") {
    e.preventDefault();
    finalizeSale();
  } else if (e.key === "Escape") {
    hideSugestoes();
  }
});
