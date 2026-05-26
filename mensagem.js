/**
 * Mensagem do grupo WhatsApp.
 *
 * Linha de abertura é contextual (v3.5):
 *  - Bate com evento próximo (Copa, Namorados, Mães...) → "Copa do Mundo vem aí!"
 *  - Bate com estação atual/próxima → "INVERNO VEM AÍ!"
 *  - Bate com tendência geral → "Achadinho que tá BOMBANDO"
 *  - Senão → padrão "🔥 OFERTA IMPERDÍVEL 🔥"
 *
 * Resto da mensagem mantém formato Rosana original.
 */
const { gerarChamada } = require('./tendencias');

function formatarMensagem(produto) {
  const { nome, precoAtual, precoOriginal, linkAfiliado, url } = produto;

  const link   = linkAfiliado || url;
  const preco  = fmtBRL(precoAtual);
  const orig   = precoOriginal ? fmtBRL(precoOriginal) : null;
  const chamada = gerarChamada(produto, 'whatsapp');

  // Linha de preço original (riscado) — só aparece se houver desconto
  const linhaOrig = orig ? `~De: R$ ${orig}~\n` : '';

  return (
    `${chamada}\n` +
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
