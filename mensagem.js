/**
 * Mensagem do grupo WhatsApp.
 *
 * v3.5 — linha de abertura contextual via gerarChamada (Copa, Namorados, Inverno...)
 * v3.8 — linha extra "🇧🇷 Vendedor BR · Entrega em 3-7 dias" pra produto nacional
 * v3.15 — PS rotativo com convite pro grupo (aparece 1 em cada 3 mensagens)
 */
const { gerarChamada } = require('./tendencias');

// PS rotativo — aparece a cada 3 mensagens pra não saturar
// Configure WHATSAPP_GROUP_INVITE_URL no Railway com o link de convite do grupo
let _contadorMensagem = 0;
const PS_CONVITE = [
  `\n💬 Ainda não é do grupo? Entre grátis: ${process.env.WHATSAPP_GROUP_INVITE_URL || ''}`,
  `\n👥 Chama um amigo pro grupo! Link de convite: ${process.env.WHATSAPP_GROUP_INVITE_URL || ''}`,
  `\n🔗 Quer receber achados todo dia? Entra no grupo: ${process.env.WHATSAPP_GROUP_INVITE_URL || ''}`,
];

function gerarPS() {
  _contadorMensagem++;
  if (_contadorMensagem % 3 !== 0) return '';
  const idx = Math.floor(_contadorMensagem / 3) % PS_CONVITE.length;
  return PS_CONVITE[idx];
}

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
    `${link}` +
    `${gerarPS()}`
  );
}

function fmtBRL(valor) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = { formatarMensagem };
