const EPS = 0.02;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function clampParcelas(n) {
  const p = parseInt(n, 10);
  if (Number.isNaN(p)) return 1;
  return Math.min(12, Math.max(1, p));
}

/**
 * Calcula forma/valores de pagamento para venda já quitada (não inclui "A receber").
 * `body` segue o mesmo formato do POST /vendas/finalizar.
 */
function computePaidBreakdown(modo, body, total) {
  const modoNorm = modo || "Dinheiro";
  const isCartaoCredito = modoNorm === "Cartão" || modoNorm === "Cartão crédito";
  const isCartaoDebito = modoNorm === "Cartão débito";
  let formaPagamentoStr = modoNorm;
  let valorPagoNum = 0;
  let troco = 0;
  let parcelas = 1;
  let pd = 0;
  let pc = 0;
  let pp = 0;

  if (modoNorm === "Dinheiro") {
    pd = total;
    valorPagoNum = round2(Number(body.valor_recebido ?? body.valor_pago ?? 0));
    troco = Math.max(0, round2(valorPagoNum - total));
    formaPagamentoStr = "Dinheiro";
  } else if (modoNorm === "Pix") {
    pp = total;
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = "Pix";
  } else if (isCartaoCredito) {
    pc = total;
    parcelas = clampParcelas(body.parcelas);
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = modoNorm === "Cartão crédito" ? "Cartão crédito" : "Cartão";
  } else if (isCartaoDebito) {
    pc = total;
    parcelas = 1;
    valorPagoNum = total;
    troco = 0;
    formaPagamentoStr = "Cartão débito";
  } else if (modoNorm === "Misto") {
    pd = round2(Number(body.parte_dinheiro || 0));
    pc = round2(Number(body.parte_cartao || 0));
    pp = round2(Number(body.parte_pix || 0));
    parcelas = clampParcelas(body.parcelas);
    const soma = round2(pd + pc + pp);
    if (Math.abs(soma - total) > EPS) {
      return {
        ok: false,
        error: `A soma (Dinheiro + Cartão + Pix) deve ser R$ ${total.toFixed(2)}. Atual: R$ ${soma.toFixed(2)}.`
      };
    }
    const recebidoDinheiro = round2(Number(body.valor_recebido_dinheiro ?? pd));
    if (recebidoDinheiro + EPS < pd) {
      return { ok: false, error: "Valor recebido em dinheiro não cobre a parte em dinheiro." };
    }
    troco = Math.max(0, round2(recebidoDinheiro - pd));
    valorPagoNum = round2(recebidoDinheiro + pc + pp);
    formaPagamentoStr = "Misto";
  } else {
    return { ok: false, error: "Forma de pagamento inválida." };
  }

  return {
    ok: true,
    formaPagamentoStr,
    valorPagoNum,
    troco,
    parcelas,
    pagamentoDinheiro: pd,
    pagamentoCartao: pc,
    pagamentoPix: pp
  };
}

/**
 * Pagamento de venda pendente (a receber): abate até `saldoRestante`.
 * Opcional: `body.valor_destinatario` / `valor_parcela` / `valor_recebimento_agora` para valor deste recebimento (< saldo).
 */
function computeRecebimentoBreakdown(modo, body, saldoRestante) {
  const cap = round2(Number(saldoRestante));
  if (!(cap > EPS)) {
    return { ok: false, error: "Não há saldo em aberto para receber." };
  }

  const modoNorm = modo || "Dinheiro";
  const isCartaoCredito = modoNorm === "Cartão" || modoNorm === "Cartão crédito";
  const isCartaoDebito = modoNorm === "Cartão débito";

  const rawAlvo = body.valor_destinatario ?? body.valor_parcela ?? body.valor_recebimento_agora;
  let pagamentoAlvo = cap;
  if (rawAlvo !== undefined && rawAlvo !== null && String(rawAlvo).trim() !== "") {
    pagamentoAlvo = round2(Number(rawAlvo));
    if (pagamentoAlvo <= EPS) {
      return { ok: false, error: "Informe um valor maior que zero." };
    }
    if (pagamentoAlvo > cap + EPS) {
      return { ok: false, error: `O máximo para este recebimento é R$ ${cap.toFixed(2)}.` };
    }
  }
  const alvo = round2(pagamentoAlvo);

  if (modoNorm === "Dinheiro") {
    const recebido = round2(Number(body.valor_recebido ?? body.valor_pago ?? 0));
    const valorAbate = round2(Math.min(recebido, cap));
    if (valorAbate < EPS) {
      return { ok: false, error: "Informe quanto o cliente entregou em dinheiro." };
    }
    const troco = round2(Math.max(0, recebido - valorAbate));
    return {
      ok: true,
      valorAbate,
      formaPagamentoStr: "Dinheiro",
      valorPagoNum: recebido,
      troco,
      parcelas: 1,
      pagamentoDinheiro: valorAbate,
      pagamentoCartao: 0,
      pagamentoPix: 0
    };
  }

  if (modoNorm === "Pix") {
    return {
      ok: true,
      valorAbate: alvo,
      formaPagamentoStr: "Pix",
      valorPagoNum: alvo,
      troco: 0,
      parcelas: 1,
      pagamentoDinheiro: 0,
      pagamentoCartao: 0,
      pagamentoPix: alvo
    };
  }

  if (isCartaoCredito) {
    return {
      ok: true,
      valorAbate: alvo,
      formaPagamentoStr: modoNorm === "Cartão crédito" ? "Cartão crédito" : "Cartão",
      valorPagoNum: alvo,
      troco: 0,
      parcelas: clampParcelas(body.parcelas),
      pagamentoDinheiro: 0,
      pagamentoCartao: alvo,
      pagamentoPix: 0
    };
  }

  if (isCartaoDebito) {
    return {
      ok: true,
      valorAbate: alvo,
      formaPagamentoStr: "Cartão débito",
      valorPagoNum: alvo,
      troco: 0,
      parcelas: 1,
      pagamentoDinheiro: 0,
      pagamentoCartao: alvo,
      pagamentoPix: 0
    };
  }

  if (modoNorm === "Misto") {
    const pd = round2(Number(body.parte_dinheiro || 0));
    const pc = round2(Number(body.parte_cartao || 0));
    const pp = round2(Number(body.parte_pix || 0));
    const parcelas = clampParcelas(body.parcelas);
    const soma = round2(pd + pc + pp);
    if (Math.abs(soma - alvo) > EPS) {
      return {
        ok: false,
        error: `A soma (Dinheiro + Cartão + Pix) deve ser R$ ${alvo.toFixed(2)}. Atual: R$ ${soma.toFixed(2)}.`
      };
    }
    const recebidoDinheiro = round2(Number(body.valor_recebido_dinheiro ?? pd));
    if (recebidoDinheiro + EPS < pd) {
      return { ok: false, error: "Valor recebido em dinheiro não cobre a parte em dinheiro." };
    }
    const troco = Math.max(0, round2(recebidoDinheiro - pd));
    const valorPagoNum = round2(recebidoDinheiro + pc + pp);
    return {
      ok: true,
      valorAbate: alvo,
      formaPagamentoStr: "Misto",
      valorPagoNum,
      troco,
      parcelas,
      pagamentoDinheiro: pd,
      pagamentoCartao: pc,
      pagamentoPix: pp
    };
  }

  return { ok: false, error: "Forma de pagamento inválida." };
}

module.exports = { EPS, round2, clampParcelas, computePaidBreakdown, computeRecebimentoBreakdown };
