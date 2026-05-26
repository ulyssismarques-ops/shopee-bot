const axios = require('axios');
const { salvarProdutoPostado } = require('./historico');
const { gerarChamada } = require('./tendencias');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// Perfil @byrosanamatias — beleza e estética
const IG_BELEZA_USER_ID = process.env.INSTAGRAM_BELEZA_USER_ID;
const IG_BELEZA_TOKEN   = process.env.INSTAGRAM_BELEZA_TOKEN;

// Perfil @achadinhosdaroh01 — produtos gerais
const IG_GERAL_USER_ID  = process.env.INSTAGRAM_GERAL_USER_ID;
const IG_GERAL_TOKEN    = process.env.INSTAGRAM_GERAL_TOKEN;

const HASHTAGS_BELEZA =
  '#beleza #skincare #maquiagem #dicasdebeleza #cuidadospessoais ' +
  '#achadinhosdaroh #shopeebrasil #ofertasdodia #cosméticos ' +
  '#pele #cabelo #promoção #belezabarata #autocuidado #dicasdecompras';

const HASHTAGS_GERAL =
  '#achadinhos #shopee #shopeebrasil #ofertasdodia #promoção ' +
  '#desconto #achadinhosdaroh #comprasonline #ofertarelampago ' +
  '#economize #dicasdecompras #achados #comprinhas #modabarata';

async function postarNoInstagram(produto, perfil = 'geral') {
  const userId = perfil === 'beleza' ? IG_BELEZA_USER_ID : IG_GERAL_USER_ID;
  const token  = perfil === 'beleza' ? IG_BELEZA_TOKEN   : IG_GERAL_TOKEN;

  if (!userId || !token) {
    console.log(`  ⚠️  Instagram [${perfil}] não configurado, pulando.`);
    return;
  }

  if (!produto.imagem) {
    console.log(`  ⚠️  Produto sem imagem, pulando Instagram [${perfil}].`);
    return;
  }

  const chamada = gerarChamada(produto, perfil);
  const caption = perfil === 'beleza'
    ? formatarLegendaBeleza(produto.nome, produto.precoAtual, produto.precoOriginal, chamada)
    : formatarLegendaGeral(produto.nome, produto.precoAtual, produto.precoOriginal, chamada);

  try {
    const { data: container } = await axios.post(
      `${BASE_URL}/${userId}/media`,
      null,
      { params: { image_url: produto.imagem, caption, access_token: token } }
    );

    // Aguarda 5s fixos pro Instagram processar a imagem.
    // Page Tokens não fazem GET no /{container_id} (Authorization Error code 100 subcode 33),
    // então polling de status não funciona — mas 5s é suficiente pra imagens JPEG da Shopee.
    await new Promise(r => setTimeout(r, 5000));

    await axios.post(
      `${BASE_URL}/${userId}/media_publish`,
      null,
      { params: { creation_id: container.id, access_token: token } }
    );

    console.log(`  📸 Instagram [${perfil}]: publicado "${produto.nome.slice(0, 50)}..."`);

    // Guarda metadados pra alimentar a landing page
    salvarProdutoPostado(produto, perfil);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`  ❌ Instagram [${perfil}] erro: ${msg}`);
  }
}

// Legenda para @byrosanamatias — estilo beleza
// Linha de abertura é a "chamada" contextual (Copa, Namorados, estação, etc).
// Links (produto + WhatsApp) ficam na landing page apontada pela bio,
// porque Instagram nunca torna links clicáveis em captions.
function formatarLegendaBeleza(nome, precoAtual, precoOriginal, chamada) {
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';

  return (
    `${chamada}\n\n` +
    `${nome}\n\n` +
    `💰 ${linhaOrig}R$ ${preco}\n\n` +
    `👆 Toca no link da BIO pra comprar\n` +
    `   (e pra entrar no grupo VIP do WhatsApp 💬)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Achados de tudo? Segue a @achadinhosdaroh01 🛒\n\n` +
    `${HASHTAGS_BELEZA}`
  );
}

// Legenda para @achadinhosdaroh01 — estilo promoção
function formatarLegendaGeral(nome, precoAtual, precoOriginal, chamada) {
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';

  return (
    `${chamada}\n\n` +
    `🎁 ${nome}\n\n` +
    `💥 ${linhaOrig}R$ ${preco}\n\n` +
    `👆 Toca no link da BIO pra comprar\n` +
    `   (e pra entrar no grupo VIP do WhatsApp 💬)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Dicas de beleza? Segue a @byrosanamatias 💄\n\n` +
    `${HASHTAGS_GERAL}`
  );
}

function selecionarDestaque(produtos) {
  if (!produtos.length) return null;
  return produtos.reduce((melhor, p) => {
    const descMelhor = melhor.precoOriginal
      ? (melhor.precoOriginal - melhor.precoAtual) / melhor.precoOriginal
      : 0;
    const descAtual = p.precoOriginal
      ? (p.precoOriginal - p.precoAtual) / p.precoOriginal
      : 0;
    return descAtual > descMelhor ? p : melhor;
  });
}

function fmtBRL(valor) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = { postarNoInstagram, selecionarDestaque };
