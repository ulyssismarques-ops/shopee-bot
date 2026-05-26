/**
 * Mensagem do grupo WhatsApp.
 *
 * v3.5 — linha de abertura contextual via gerarChamada (Copa, Namorados, Inverno...)
 * v3.8 — linha extra "🇧🇷 Vendedor BR · Entrega em 3-7 dias" pra produto nacional
 */
const { gerarChamada } = require('./tendencias');

function formatarMensagem(produto) {
  const { nome, precoAtual, precoOriginal, linkAfiliado, url, crossBorder } = produto;

  const link    = linkAfiliado || url;
  const preco   = fmtBRL(precoAtual);
  const orig    = precoOriginal ? fmtBRL(precoOriginal) : null;
  const chamada = gerarChamada(produto, 'whatsapp');

  // Linha de preço original (riscado) — só aparece se houver desconto
  const linhaOrig = orig ? `~De: R$ ${orig}~\n` : '';

  // Linha "Envio Rápido" — só pra produto nacional
  const linhaEnvio = crossBorder === false
    ? `🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias\n`
    : '';

  return (
    `${chamada}\n` +
    `🎁 ${nome}\n` +
    `${linhaOrig}` +
    `💥 POR APENAS: R$ ${preco}\n` +
    `${linhaEnvio}` +
    `Oferta relâmpago: aproveite antes que suba o preço. 🔥\n` +
    `${link}`
  );
}

function fmtBRL(valor) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = { formatarMensagem };
