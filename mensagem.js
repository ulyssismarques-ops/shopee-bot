/**
 * Formato idêntico ao usado pela Rosana no grupo.
 *
 * 🔥 OFERTA IMPERDÍVEL 🔥
 * 🎁 [nome do produto]
 * ~De: R$ XX,XX~
 * 💥 POR APENAS: R$ XX,XX
 * Oferta relâmpago: aproveite antes que suba o preço. 🔥
 * https://s.shopee.com.br/XXXXX
 */
function formatarMensagem(produto) {
  const { nome, precoAtual, precoOriginal, linkAfiliado, url } = produto;

  const link   = linkAfiliado || url;
  const preco  = fmtBRL(precoAtual);
  const orig   = precoOriginal ? fmtBRL(precoOriginal) : null;

  // Linha de preço original (riscado) — só aparece se houver desconto
  const linhaOrig = orig ? `~De: R$ ${orig}~\n` : '';

  return (
    `🔥 OFERTA IMPERDÍVEL 🔥\n` +
    `🎁 ${nome}\n` +
    `${linhaOrig}` +
    `💥 POR APENAS: R$ ${preco}\n` +
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
