const items = [];
let debounceTimer = null;
let sugestoesLista = [];
let selectedSugIndex = -1;
let activeSearchController = null;
let finalizando = false;
let addInputBusy = false;
let printLastSaleBusy = false;
let lastReceiptPageUrl = "";
let lastReceiptPdfUrl = "";

const RECEIPT_FRAGMENT_SPINNER = `<div class="flex flex-col items-center justify-center gap-3 py-10 text-slate-500 text-sm">
  <div class="h-8 w-8 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin"></div>
  <span>Carregando recibo…</span>
</div>`;

function setPdvLoadingText(title, detail) {
  const t = document.getElementById("pdv_loading_title");
  const d = document.getElementById("pdv_loading_detail");
  if (t) t.textContent = title;
  if (d) d.textContent = detail;
}

function setPdvOverlayVisible(visible) {
  const overlay = document.getElementById("pdv_loading_overlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !visible);
  overlay.classList.toggle("flex", visible);
}

function showReceiptModalEl() {
  const modal = document.getElementById("receipt_modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.style.display = "flex";
  modal.style.visibility = "visible";
  modal.style.opacity = "1";
}

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

function getSubtotalItens() {
  return round2(items.reduce((sum, i) => sum + i.subtotal, 0));
}

function getDesconto() {
  const subtotal = getSubtotalItens();
  const descontoInput = round2(Number(document.getElementById("desconto_valor")?.value || 0));
  if (descontoInput <= 0) return 0;
  return Math.min(descontoInput, subtotal);
}

function getTotalVenda() {
  return round2(getSubtotalItens() - getDesconto());
}

function togglePainelPagamento() {
  const modo = document.getElementById("modo_pagamento").value;
  const fiado = modo === "A receber";
  const painelFiado = document.getElementById("painel_a_receber");
  if (painelFiado) painelFiado.classList.toggle("hidden", !fiado);
  document.getElementById("painel_dinheiro").classList.toggle("hidden", modo !== "Dinheiro" || fiado);
  document.getElementById("painel_pix").classList.toggle("hidden", modo !== "Pix" || fiado);
  document.getElementById("painel_cartao").classList.toggle("hidden", (modo !== "Cartão crédito" && modo !== "Cartão") || fiado);
  document.getElementById("painel_misto").classList.toggle("hidden", modo !== "Misto" || fiado);
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
  const subtotal = getSubtotalItens();
  const desconto = getDesconto();
  const total = getTotalVenda();
  const modo = document.getElementById("modo_pagamento").value;
  let troco = 0;

  if (modo === "A receber") {
    troco = 0;
  } else if (modo === "Dinheiro") {
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

  const subtotalEl = document.getElementById("subtotal");
  const descontoEl = document.getElementById("desconto");
  if (subtotalEl) subtotalEl.innerText = currency(subtotal);
  if (descontoEl) descontoEl.innerText = currency(desconto);
  document.getElementById("total").innerText = currency(total);
  document.getElementById("troco").innerText = currency(troco);
}

function setFinalizandoState(isLoading) {
  finalizando = isLoading;
  const finishBtn = document.getElementById("finishBtn");
  const addBtn = document.getElementById("addBtn");
  const busca = document.getElementById("busca_produto");
  const printLast = document.getElementById("print_last_sale_btn");
  if (finishBtn) finishBtn.disabled = isLoading;
  if (addBtn) addBtn.disabled = isLoading || addInputBusy;
  if (busca) busca.disabled = isLoading;
  if (printLast) printLast.disabled = isLoading || printLastSaleBusy;
  setPdvOverlayVisible(isLoading);
  if (isLoading) {
    setPdvLoadingText("Finalizando venda", "Enviando dados ao servidor…");
  } else {
    setPdvLoadingText("Aguarde", "Processando no servidor.");
    if (addBtn) addBtn.disabled = addInputBusy;
    if (printLast) printLast.disabled = printLastSaleBusy;
  }
}

async function openReceiptModal(saleId, options = {}) {
  const deferModalUntilLoaded = options.deferModalUntilLoaded !== false;
  const modal = document.getElementById("receipt_modal");
  const content = document.getElementById("receipt_modal_content");
  const yesBtn = document.getElementById("receipt_yes_btn");
  const downloadBtn = document.getElementById("receipt_download_btn");
  if (!modal || !content) {
    throw new Error("Modal do recibo não encontrado na tela.");
  }

  lastReceiptPageUrl = "";
  lastReceiptPdfUrl = "";
  if (yesBtn) yesBtn.disabled = true;
  if (downloadBtn) downloadBtn.disabled = true;

  if (!deferModalUntilLoaded) {
    content.innerHTML = RECEIPT_FRAGMENT_SPINNER;
    showReceiptModalEl();
  }

  try {
    const res = await fetch(`/vendas/recibo/${saleId}/fragment`, { credentials: "same-origin" });
    if (!res.ok) {
      throw new Error("Não foi possível carregar o recibo.");
    }
    const html = await res.text();
    content.innerHTML = html;
    lastReceiptPageUrl = `/vendas/recibo/${saleId}`;
    lastReceiptPdfUrl = `/vendas/recibo/${saleId}.pdf`;
    if (deferModalUntilLoaded) {
      showReceiptModalEl();
    }
  } catch (err) {
    if (!deferModalUntilLoaded) {
      content.innerHTML = `<p class="text-red-600 text-sm p-4 text-center">${escapeHtml(err?.message || "Erro ao carregar recibo.")}</p>`;
      showReceiptModalEl();
    }
    throw err;
  } finally {
    if (yesBtn) yesBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = false;
  }
}

function closeReceiptModal() {
  const modal = document.getElementById("receipt_modal");
  const content = document.getElementById("receipt_modal_content");
  if (!modal) return;
  modal.classList.remove("flex");
  modal.classList.add("hidden");
  modal.style.display = "";
  modal.style.visibility = "";
  modal.style.opacity = "";
  if (content) content.innerHTML = "";
}

function openReceiptInNewTab() {
  if (!lastReceiptPageUrl) {
    showToast("Recibo ainda não está pronto.", "error");
    return;
  }
  const w = window.open(lastReceiptPageUrl, "_blank", "noopener,noreferrer");
  if (!w) {
    showToast("Permita pop-ups para abrir o recibo.", "error");
    return;
  }
  closeReceiptModal();
}

async function downloadReceiptPdf() {
  if (!lastReceiptPdfUrl) {
    showToast("PDF do recibo ainda não está pronto.", "error");
    return;
  }
  const btn = document.getElementById("receipt_download_btn");
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(lastReceiptPdfUrl, { credentials: "same-origin" });
    if (!res.ok) {
      showToast("Não foi possível baixar o PDF.", "error");
      return;
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("pdf")) {
      showToast("O servidor não retornou um PDF.", "error");
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    const idMatch = lastReceiptPdfUrl.match(/\/(\d+)\.pdf(?:\?|$)/);
    let filename = idMatch ? `recibo-${idMatch[1]}.pdf` : "recibo.pdf";
    const dispo = res.headers.get("content-disposition") || "";
    const m = /filename\*=UTF-8''([^;\n]+)|filename="?([^";\n]+)"?/i.exec(dispo);
    if (m) {
      try {
        filename = decodeURIComponent((m[1] || m[2] || filename).trim());
      } catch {
        filename = m[2] || filename;
      }
    }
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    closeReceiptModal();
  } catch (e) {
    showToast("Erro de rede ao baixar o PDF.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function refreshUltimaVendaResumo() {
  const el = document.getElementById("ultima_venda_resumo");
  if (!el) return;
  try {
    const res = await fetch("/vendas/ultima-venda/sessao", { credentials: "same-origin" });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      el.textContent = "Resposta inválida ao buscar última venda.";
      return;
    }
    if (!res.ok) {
      el.textContent = data.error || "Nenhuma venda nesta sessão ainda.";
      return;
    }
    const r = data.resumo;
    if (!r) {
      el.textContent = `Última nesta sessão: venda #${data.saleId}.`;
      return;
    }
    const dt = new Date(r.createdAt).toLocaleString("pt-BR");
    const pend = r.recebimentoStatus === "pendente" ? " · Pendente a receber" : "";
    el.textContent = `Última nesta sessão: #${r.id} — ${r.clienteNome} — R$ ${Number(r.total).toFixed(2)} — ${r.formaPagamento} — ${dt}${pend}`;
  } catch (e) {
    el.textContent = "Não foi possível carregar a última venda.";
  }
}

async function openLastSessionSaleReceipt() {
  if (printLastSaleBusy || finalizando) return;
  printLastSaleBusy = true;
  const btn = document.getElementById("print_last_sale_btn");
  const savedLabel = btn?.dataset.defaultLabel || btn?.textContent || "Imprimir última venda";
  if (btn && !btn.dataset.defaultLabel) btn.dataset.defaultLabel = savedLabel;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Carregando…";
  }

  setPdvOverlayVisible(true);
  setPdvLoadingText("Última venda", "Consultando a sessão no servidor…");

  try {
    const response = await fetch("/vendas/ultima-venda/sessao", { credentials: "same-origin" });
    let result = {};
    try {
      result = await response.json();
    } catch (e) {
      throw new Error("Resposta inválida ao buscar última venda.");
    }
    if (!response.ok) {
      throw new Error(result.error || "Nenhuma venda nesta sessão ainda.");
    }
    setPdvOverlayVisible(false);
    setPdvLoadingText("Aguarde", "Processando no servidor.");
    await openReceiptModal(result.saleId, { deferModalUntilLoaded: false });
  } catch (e) {
    showToast(e?.message || "Não foi possível abrir a última venda.", "error");
  } finally {
    printLastSaleBusy = false;
    setPdvOverlayVisible(false);
    if (btn) {
      btn.textContent = btn.dataset.defaultLabel || savedLabel;
      btn.disabled = finalizando;
    }
  }
}

function resetCurrentSale() {
  items.splice(0, items.length);
  renderTable();
  document.getElementById("desconto_valor").value = "0";
  document.getElementById("modo_pagamento").value = "Dinheiro";
  document.getElementById("valor_recebido").value = "0";
  document.getElementById("parte_dinheiro").value = "0";
  document.getElementById("parte_cartao").value = "0";
  document.getElementById("parte_pix").value = "0";
  document.getElementById("valor_recebido_dinheiro").value = "0";
  hideSugestoes();
  togglePainelPagamento();
  const busca = document.getElementById("busca_produto");
  if (busca) busca.focus();
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
      signal: activeSearchController.signal,
      credentials: "same-origin"
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
    const res = await fetch(`/vendas/produto/${encodeURIComponent(code)}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function tryAddFromInput() {
  if (addInputBusy || finalizando) return;
  const input = document.getElementById("busca_produto");
  const text = input.value.trim();
  if (!text) return;

  const addBtn = document.getElementById("addBtn");
  const prevLabel = addBtn?.textContent;
  addInputBusy = true;
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.textContent = "…";
  }

  try {
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
      const res = await fetch(`/vendas/api/produtos?q=${encodeURIComponent(text)}`, { credentials: "same-origin" });
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
  } finally {
    addInputBusy = false;
    if (addBtn) {
      addBtn.textContent = prevLabel || "Adicionar";
      addBtn.disabled = finalizando;
    }
  }
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
document.getElementById("desconto_valor").addEventListener("input", updateTotals);
["parte_dinheiro", "parte_cartao", "parte_pix", "valor_recebido_dinheiro"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateTotals);
});
document.querySelectorAll(".modo-rapido").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("modo_pagamento").value = btn.dataset.modo;
    togglePainelPagamento();
  });
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
  if (finalizando) return;
  if (addInputBusy) {
    showToast("Aguarde a busca do produto terminar.", "info");
    return;
  }
  if (!items.length) {
    showToast("Adicione itens antes de finalizar.", "error");
    return;
  }
  const subtotal = getSubtotalItens();
  const desconto = getDesconto();
  if (desconto - subtotal > 0.02) {
    showToast("Desconto não pode ser maior que o subtotal.", "error");
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
    modo_pagamento: modo,
    desconto
  };

  if (modo === "Dinheiro") {
    body.valor_recebido = document.getElementById("valor_recebido").value;
  } else if (modo === "Cartão" || modo === "Cartão crédito") {
    body.parcelas = document.getElementById("parcelas_cartao").value;
  } else if (modo === "Cartão débito") {
    body.parcelas = 1;
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
  } else if (modo === "A receber") {
    /* sem campos extras no corpo */
  }

  try {
    setFinalizandoState(true);
    const response = await fetch("/vendas/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
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
    const saleIdSaved = result.saleId;
    setPdvLoadingText("Carregando recibo", "Buscando visualização do recibo…");
    let receiptOk = false;
    try {
      await openReceiptModal(saleIdSaved, { deferModalUntilLoaded: true });
      receiptOk = true;
    } catch (recErr) {
      showToast(
        "Venda registrada. Abra o recibo em Histórico ou em «Última venda» se não aparecer aqui.",
        "warning"
      );
      closeReceiptModal();
    }
    resetCurrentSale();
    if (receiptOk) {
      showToast("Venda finalizada com sucesso.", "success");
    }
    refreshUltimaVendaResumo();
  } catch (e) {
    showToast(e?.message || "Erro de rede. Tente novamente.", "error");
  } finally {
    setFinalizandoState(false);
  }
}

refreshUltimaVendaResumo();

document.getElementById("finishBtn").addEventListener("click", finalizeSale);
document.getElementById("print_last_sale_btn")?.addEventListener("click", openLastSessionSaleReceipt);
document.getElementById("receipt_no_btn")?.addEventListener("click", closeReceiptModal);
document.getElementById("receipt_close_btn")?.addEventListener("click", closeReceiptModal);
document.getElementById("receipt_yes_btn")?.addEventListener("click", openReceiptInNewTab);
document.getElementById("receipt_download_btn")?.addEventListener("click", downloadReceiptPdf);

document.addEventListener("keydown", (e) => {
  if (e.key === "F2") {
    e.preventDefault();
    const el = document.getElementById("busca_produto");
    if (el) el.focus();
  } else if (e.key === "F4") {
    e.preventDefault();
    finalizeSale();
  } else if (e.key === "Escape") {
    closeReceiptModal();
    hideSugestoes();
  }
});
