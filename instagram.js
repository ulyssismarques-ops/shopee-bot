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

// Hashtags base fixas (aparecem em todos os posts)
const HASHTAGS_BASE_BELEZA =
  '#beleza #skincare #maquiagem #dicasdebeleza #cuidadospessoais ' +
  '#achadinhosdaroh #shopeebrasil #ofertasdodia #cosméticos ' +
  '#pele #cabelo #promoção #belezabarata #autocuidado #dicasdecompras';

const HASHTAGS_BASE_GERAL =
  '#achadinhos #shopee #shopeebrasil #ofertasdodia #promoção ' +
  '#desconto #achadinhosdaroh #comprasonline #ofertarelampago ' +
  '#economize #dicasdecompras #achados #comprinhas #modabarata';

// Hashtags extras por categoria (adicionadas dinamicamente conforme o produto)
const HASHTAGS_EXTRAS = {
  beleza:  '#makeupbrasil #skincarebr #rotinadebeleza #beautytips #skincaredicas',
  cozinha: '#cozinhabr #kitchenbr #airfryerrecipes #receitasfaceis #cozinhando',
  casa:    '#decoracaobr #homedecor #casabonita #organizacaocasa #decoração',
  moda:    '#modabr #modafeminina #lookdodia #ootdbrasil #fashion',
  tech:    '#tecnologia #gadgets #techbr #eletrônicos #techreview',
  pet:     '#petbr #cachorro #gato #petlovers #pets',
  bebe:    '#maternidade #bebê #maebr #gravidez #mamãe',
  fitness: '#fitness #academia #treinoem casa #fitnessbr #saudeebemestar',
  auto:    '#carros #autopeças #carrobr #automóveis #carro',
};

// Retorna hashtags base + extras por categoria do produto
function gerarHashtags(produto, perfil) {
  const base = perfil === 'beleza' ? HASHTAGS_BASE_BELEZA : HASHTAGS_BASE_GERAL;
  const nome  = (produto.nome || '').toLowerCase();
  const cat   = [produto.categoria1, produto.categoria2, produto.categoria3]
    .filter(Boolean).join(' ').toLowerCase();
  const texto = nome + ' ' + cat;

  // Detecta qual categoria bate com o produto
  const categoriaMap = {
    beleza:  ['beleza', 'cosmétic', 'maquiagem', 'skincare', 'cabelo', 'perfume', 'creme'],
    cozinha: ['cozinha', 'kitchen', 'panela', 'air fryer', 'utensílio', 'culinária', 'alimentação'],
    casa:    ['casa', 'decoração', 'home', 'organização', 'cama', 'banho', 'tapete', 'cortina'],
    moda:    ['moda', 'roupa', 'vestido', 'blusa', 'calça', 'tênis', 'bolsa', 'fashion', 'acessório'],
    tech:    ['tech', 'eletrônico', 'fone', 'celular', 'computador', 'gadget', 'carregador'],
    pet:     ['pet', 'cachorro', 'gato', 'animal', 'pata', 'felino', 'canino'],
    bebe:    ['bebê', 'baby', 'infantil', 'criança', 'maternidade', 'kids'],
    fitness: ['fitness', 'academia', 'treino', 'exercício', 'yoga', 'musculação'],
    auto:    ['carro', 'veículo', 'automotivo', 'automóvel'],
  };

  for (const [cat, palavras] of Object.entries(categoriaMap)) {
    if (palavras.some(p => texto.includes(p))) {
      return base + '\n' + HASHTAGS_EXTRAS[cat];
    }
  }
  return base;
}

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
    ? formatarLegendaBeleza(produto, chamada)
    : formatarLegendaGeral(produto, chamada);

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
// v3.8 — linha "🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias" pra produto nacional
// Links (produto + WhatsApp) ficam na landing page apontada pela bio,
// porque Instagram nunca torna links clicáveis em captions.
function formatarLegendaBeleza(produto, chamada) {
  const { nome, precoAtual, precoOriginal, crossBorder } = produto;
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';
  const linhaEnvio = crossBorder === false
    ? `🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias\n\n`
    : '';

  return (
    `${chamada}\n\n` +
    `${nome}\n\n` +
    `💰 ${linhaOrig}R$ ${preco}\n\n` +
    `${linhaEnvio}` +
    `👆 Toca no link da BIO pra comprar\n` +
    `   (e pra entrar no grupo VIP do WhatsApp 💬)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Achados de tudo? Segue a @achadinhosdaroh01 🛒\n\n` +
    `${gerarHashtags(produto, 'beleza')}`
  );
}

// Legenda para @achadinhosdaroh01 — estilo promoção
function formatarLegendaGeral(produto, chamada) {
  const { nome, precoAtual, precoOriginal, crossBorder } = produto;
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';
  const linhaEnvio = crossBorder === false
    ? `🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias\n\n`
    : '';

  return (
    `${chamada}\n\n` +
    `🎁 ${nome}\n\n` +
    `💥 ${linhaOrig}R$ ${preco}\n\n` +
    `${linhaEnvio}` +
    `👆 Toca no link da BIO pra comprar\n` +
    `   (e pra entrar no grupo VIP do WhatsApp 💬)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Dicas de beleza? Segue a @byrosanamatias 💄\n\n` +
    `${gerarHashtags(produto, 'geral')}`
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

/**
 * Posta um Story no Instagram (v3.16).
 * Usa o mesmo endpoint da feed, mas com media_type=STORIES.
 * O story aparece por 24h e fica no topo do feed dos seguidores.
 * Nao tem caption visivel — a imagem fala por si.
 */
async function postarStory(produto, perfil) {
  const userId = perfil === 'beleza' ? IG_BELEZA_USER_ID : IG_GERAL_USER_ID;
  const token  = perfil === 'beleza' ? IG_BELEZA_TOKEN   : IG_GERAL_TOKEN;

  if (!userId || !token || !produto.imagem) return;

  try {
    const { data: container } = await axios.post(
      `${BASE_URL}/${userId}/media`,
      null,
      { params: { image_url: produto.imagem, media_type: 'STORIES', access_token: token } }
    );

    await new Promise(r => setTimeout(r, 5000));

    await axios.post(
      `${BASE_URL}/${userId}/media_publish`,
      null,
      { params: { creation_id: container.id, access_token: token } }
    );

    console.log(`  📖 Story Instagram [${perfil}]: publicado.`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.warn(`  Story [${perfil}] nao postado: ${msg}`);
  }
}

module.exports = { postarNoInstagram, postarStory, selecionarDestaque };
