const axios = require('axios');
const crypto = require('crypto');

// ─── Credenciais (via Railway env vars — NUNCA no código) ────────────────────
const USERNAME = process.env.SHOPEE_USERNAME || '';
const PASSWORD = process.env.SHOPEE_PASSWORD || '';
const AF_ID    = process.env.SHOPEE_AF_ID    || ''; // fallback manual

// ─── Endpoints ───────────────────────────────────────────────────────────────
const AFFILIATE_BASE = 'https://affiliate.shopee.com.br';
const SEARCH_URL     = 'https://shopee.com.br/api/v4/search/search_items';
const FLASH_URL      = 'https://shopee.com.br/api/v4/flash_sale';

const HEADERS_SHOPEE = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer':         'https://shopee.com.br/',
  'Origin':          'https://shopee.com.br',
};

const HEADERS_AFFILIATE = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'application/json',
  'Content-Type':    'application/json',
  'Referer':         `${AFFILIATE_BASE}/`,
  'Origin':          AFFILIATE_BASE,
};

// ─── Cache de sessão (evita login a cada link) ────────────────────────────────
let cachedToken  = null;
let tokenExpiry  = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const resp = await axios.post(
    `${AFFILIATE_BASE}/api/v2/account/login`,
    { username: USERNAME, password: PASSWORD },
    { headers: HEADERS_AFFILIATE, timeout: 12000 }
  );

  // Shopee pode retornar o token em locais diferentes — tentamos os mais comuns
  const data  = resp.data?.data || resp.data || {};
  const token = data.token || data.access_token || data.jwt || data.session_token;

  if (!token) {
    console.error('Login afiliado: resposta sem token:', JSON.stringify(resp.data).slice(0, 200));
    throw new Error('Token não encontrado na resposta de login');
  }

  cachedToken = token;
  tokenExpiry = Date.now() + 3 * 60 * 60 * 1000; // 3h
  console.log('🔑 Login afiliado Shopee OK');
  return token;
}

// ─── Gerar link de afiliado ───────────────────────────────────────────────────
async function gerarLinkAfiliado(urlOriginal) {
  // Opção 1: API interna do portal (gera s.shopee.com.br/XXXXX)
  if (USERNAME && PASSWORD) {
    try {
      return await gerarLinkPortal(urlOriginal);
    } catch (err) {
      console.warn('⚠️  Link via portal falhou:', err.message, '— usando fallback');
    }
  }

  // Opção 2: af_id simples (URL longa mas rastreável)
  if (AF_ID) {
    return `${urlOriginal}?af_id=${AF_ID}&channel_id=0`;
  }

  // Opção 3: URL direta (sem rastreamento)
  console.warn('⚠️  Nenhuma credencial de afiliado configurada. Usando URL sem rastreamento.');
  return urlOriginal;
}

async function gerarLinkPortal(urlOriginal) {
  const token = await getToken();

  const resp = await axios.post(
    `${AFFILIATE_BASE}/api/v2/link/generate`,
    { origin_url: urlOriginal, channel_id: '0' },
    {
      headers: { ...HEADERS_AFFILIATE, Authorization: `Bearer ${token}` },
      timeout: 10000,
    }
  );

  const data      = resp.data?.data || resp.data || {};
  const shortLink = data.short_link || data.shortLink || data.link || data.url;

  if (!shortLink) {
    throw new Error('Resposta sem short_link: ' + JSON.stringify(data).slice(0, 150));
  }

  return shortLink; // → https://s.shopee.com.br/XXXXX
}

// ─── Busca de produtos ────────────────────────────────────────────────────────
const KEYWORDS = [
  'kit', 'combo', 'camiseta', 'shorts', 'tênis', 'fone', 'carregador',
  'ventilador', 'panela', 'protetor solar', 'mochila', 'relógio', 'perfume',
  'meia', 'chinelo', 'top', 'blusinha', 'saia', 'moletom', 'legging',
];
let kwIdx = 0;

async function buscarProdutos(limite = 30) {
  // Tenta flash sale primeiro (maior desconto = melhor pra grupo de achadinhos)
  try {
    const flash = await buscarFlashSale(limite);
    if (flash.length >= 5) {
      console.log(`🛍️  ${flash.length} produtos (Flash Sale)`);
      return flash;
    }
  } catch (err) {
    console.warn('Flash sale indisponível:', err.message);
  }

  // Fallback: busca por keyword rotativa
  try {
    const prods = await buscarPorKeyword(limite);
    console.log(`🛍️  ${prods.length} produtos (busca: "${KEYWORDS[(kwIdx - 1) % KEYWORDS.length]}")`);
    return prods;
  } catch (err) {
    console.error('Erro na busca Shopee:', err.message);
    return [];
  }
}

async function buscarPorKeyword(limite) {
  const keyword = KEYWORDS[kwIdx % KEYWORDS.length];
  kwIdx++;

  const resp = await axios.get(SEARCH_URL, {
    params: {
      by: 'sales', order: 'desc',
      limit: limite, newest: 0,
      keyword, page_type: 'search',
      scenario: 'PAGE_GLOBAL_SEARCH', version: 2,
    },
    headers: HEADERS_SHOPEE,
    timeout: 12000,
  });

  return (resp.data?.items || []).map(parseItem).filter(validar);
}

async function buscarFlashSale(limite) {
  const sessoes = await axios.get(`${FLASH_URL}/get_all_sessions`, {
    headers: HEADERS_SHOPEE, timeout: 10000,
  });

  const ativa = (sessoes.data?.data?.sessions || []).find((s) => s.status === 1);
  if (!ativa) return [];

  const resp = await axios.get(`${FLASH_URL}/flash_sale_batch_get_items`, {
    params: { batchid: ativa.batchid, limit: limite, offset: 0 },
    headers: HEADERS_SHOPEE, timeout: 12000,
  });

  return (resp.data?.data?.items || []).map(parseFlashItem).filter(validar);
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseItem(item) {
  const i       = item.item_basic;
  const shopId  = i.shopid;
  const itemId  = i.itemid;
  const preco   = (i.price || i.price_min || 0) / 100000;
  const orig    = (i.price_before_discount || i.price_max_before_discount || 0) / 100000;

  return {
    id:           `${shopId}_${itemId}`,
    nome:         i.name,
    precoAtual:   preco,
    precoOriginal: orig > preco ? orig : null,
    desconto:     orig > preco ? Math.round(((orig - preco) / orig) * 100) : 0,
    vendidos:     i.sold || 0,
    avaliacao:    Number(i.item_rating?.rating_star || 0).toFixed(1),
    url:          `https://shopee.com.br/product/${shopId}/${itemId}`,
  };
}

function parseFlashItem(item) {
  const shopId  = item.shopid;
  const itemId  = item.itemid;
  const preco   = (item.price || 0) / 100000;
  const orig    = (item.price_before_discount || 0) / 100000;

  return {
    id:           `${shopId}_${itemId}`,
    nome:         item.name,
    precoAtual:   preco,
    precoOriginal: orig > preco ? orig : null,
    desconto:     orig > preco ? Math.round(((orig - preco) / orig) * 100) : 0,
    vendidos:     item.sold || 0,
    avaliacao:    Number(item.item_rating?.rating_star || 0).toFixed(1),
    url:          `https://shopee.com.br/product/${shopId}/${itemId}`,
    flashSale:    true,
  };
}

function validar(p) {
  return p.precoAtual > 0 && p.nome?.length > 3;
}

module.exports = { buscarProdutos, gerarLinkAfiliado };
