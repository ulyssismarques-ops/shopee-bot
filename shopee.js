const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

// ─── Credenciais (Railway env vars) ──────────────────────────────────────────
const USERNAME = process.env.SHOPEE_USERNAME || '';
const PASSWORD = process.env.SHOPEE_PASSWORD || '';
const AF_ID    = process.env.SHOPEE_AF_ID    || '';

// ─── Endpoints ───────────────────────────────────────────────────────────────
const AFFILIATE_BASE = 'https://affiliate.shopee.com.br';
const SHOPEE_BASE    = 'https://shopee.com.br';

// ─── Cliente HTTP com cookies (essencial para o anti-bot) ─────────────────────
const jar = new CookieJar();
const http = wrapper(axios.create({
  jar,
  withCredentials: true,
  timeout: 15000,
  validateStatus: (s) => s < 500, // não joga erro em 403, queremos tratar
}));

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer':         'https://shopee.com.br/',
  'Origin':          'https://shopee.com.br',
  'X-Requested-With':'XMLHttpRequest',
  'X-Shopee-Language':'pt-BR',
  'sec-ch-ua':       '"Chromium";v="121", "Not A(Brand";v="99", "Google Chrome";v="121"',
  'sec-ch-ua-mobile':'?0',
  'sec-ch-ua-platform':'"Windows"',
  'sec-fetch-dest':  'empty',
  'sec-fetch-mode':  'cors',
  'sec-fetch-site':  'same-origin',
};

// ─── Aquece cookies (visita home + categoria antes de bater na API) ──────────
let cookiesAquecidos = false;
async function aquecerCookies() {
  if (cookiesAquecidos) return;

  try {
    await http.get(SHOPEE_BASE + '/', { headers: HEADERS });
    await http.get(SHOPEE_BASE + '/api/v4/pages/get_homepage_category_list', { headers: HEADERS });
    cookiesAquecidos = true;
    console.log('🍪 Cookies Shopee aquecidos');
  } catch (err) {
    console.warn('Aviso: aquecimento de cookies falhou:', err.message);
  }
}

// ─── Cache de sessão afiliada ────────────────────────────────────────────────
let cachedToken  = null;
let tokenExpiry  = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const resp = await http.post(
    `${AFFILIATE_BASE}/api/v2/account/login`,
    { username: USERNAME, password: PASSWORD },
    { headers: { ...HEADERS, Referer: AFFILIATE_BASE + '/', Origin: AFFILIATE_BASE, 'Content-Type': 'application/json' } }
  );

  const data  = resp.data?.data || resp.data || {};
  const token = data.token || data.access_token || data.jwt || data.session_token;

  if (!token) {
    console.error('Login afiliado: resposta sem token:', JSON.stringify(resp.data).slice(0, 200));
    throw new Error('Token não encontrado');
  }

  cachedToken = token;
  tokenExpiry = Date.now() + 3 * 60 * 60 * 1000; // 3h
  console.log('🔑 Login afiliado Shopee OK');
  return token;
}

// ─── Gerar link de afiliado ───────────────────────────────────────────────────
async function gerarLinkAfiliado(urlOriginal) {
  if (USERNAME && PASSWORD) {
    try { return await gerarLinkPortal(urlOriginal); }
    catch (err) { console.warn('⚠️  Link portal falhou:', err.message); }
  }
  if (AF_ID) return `${urlOriginal}?af_id=${AF_ID}&channel_id=0`;
  return urlOriginal;
}

async function gerarLinkPortal(urlOriginal) {
  const token = await getToken();
  const resp = await http.post(
    `${AFFILIATE_BASE}/api/v2/link/generate`,
    { origin_url: urlOriginal, channel_id: '0' },
    { headers: { ...HEADERS, Authorization: `Bearer ${token}`, Referer: AFFILIATE_BASE + '/', Origin: AFFILIATE_BASE, 'Content-Type': 'application/json' } }
  );
  const data = resp.data?.data || resp.data || {};
  const link = data.short_link || data.shortLink || data.link || data.url;
  if (!link) throw new Error('Sem short_link: ' + JSON.stringify(data).slice(0, 150));
  return link;
}

// ─── Busca de produtos — múltiplas estratégias ───────────────────────────────
const KEYWORDS = [
  'kit', 'combo', 'camiseta', 'shorts', 'tênis', 'fone', 'carregador',
  'ventilador', 'panela', 'mochila', 'relógio', 'perfume',
  'meia', 'chinelo', 'top', 'blusinha', 'saia', 'moletom', 'legging',
];
let kwIdx = 0;

async function buscarProdutos(limite = 30) {
  await aquecerCookies();

  // Estratégia 1: API de recomendação (menos agressiva)
  try {
    const recs = await buscarRecommend(limite);
    if (recs.length >= 5) {
      console.log(`🛍️  ${recs.length} produtos (Recommend)`);
      return recs;
    }
  } catch (err) {
    console.warn('Recommend falhou:', err.response?.status || err.message);
  }

  // Estratégia 2: Flash sale
  try {
    const flash = await buscarFlashSale(limite);
    if (flash.length >= 5) {
      console.log(`🛍️  ${flash.length} produtos (Flash Sale)`);
      return flash;
    }
  } catch (err) {
    console.warn('Flash sale falhou:', err.response?.status || err.message);
  }

  // Estratégia 3: Busca por keyword
  try {
    const prods = await buscarPorKeyword(limite);
    console.log(`🛍️  ${prods.length} produtos (busca)`);
    return prods;
  } catch (err) {
    console.error('Busca falhou:', err.response?.status || err.message);
    return [];
  }
}

async function buscarRecommend(limite) {
  const resp = await http.get(`${SHOPEE_BASE}/api/v4/recommend/recommend`, {
    params: {
      bundle: 'daily_discover_main',
      item_card: 2,
      limit: limite,
      offset: Math.floor(Math.random() * 100),
    },
    headers: HEADERS,
  });

  if (resp.status === 403) throw new Error('403 Forbidden');
  const sections = resp.data?.data?.sections || [];
  const items = sections.flatMap(s => s.data?.item || []);
  return items.map(parseItem).filter(validar);
}

async function buscarPorKeyword(limite) {
  const keyword = KEYWORDS[kwIdx % KEYWORDS.length];
  kwIdx++;

  const resp = await http.get(`${SHOPEE_BASE}/api/v4/search/search_items`, {
    params: {
      by: 'sales', order: 'desc', limit: limite, newest: 0,
      keyword, page_type: 'search',
      scenario: 'PAGE_GLOBAL_SEARCH', version: 2,
    },
    headers: HEADERS,
  });

  if (resp.status === 403) throw new Error('403 Forbidden');
  return (resp.data?.items || []).map(parseItem).filter(validar);
}

async function buscarFlashSale(limite) {
  const sessoes = await http.get(`${SHOPEE_BASE}/api/v4/flash_sale/get_all_sessions`, { headers: HEADERS });
  if (sessoes.status === 403) throw new Error('403 Forbidden');

  const ativa = (sessoes.data?.data?.sessions || []).find((s) => s.status === 1);
  if (!ativa) return [];

  const resp = await http.get(`${SHOPEE_BASE}/api/v4/flash_sale/flash_sale_batch_get_items`, {
    params: { batchid: ativa.batchid, limit: limite, offset: 0 },
    headers: HEADERS,
  });
  if (resp.status === 403) throw new Error('403 Forbidden');

  return (resp.data?.data?.items || []).map(parseFlashItem).filter(validar);
}

// ─── Parsers (lidam com formatos diferentes de cada API) ─────────────────────
function parseItem(item) {
  const i = item.item_basic || item;
  const shopId = i.shopid;
  const itemId = i.itemid;
  const preco  = (i.price || i.price_min || 0) / 100000;
  const orig   = (i.price_before_discount || i.price_max_before_discount || 0) / 100000;

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
  const preco = (item.price || 0) / 100000;
  const orig  = (item.price_before_discount || 0) / 100000;
  return {
    id:           `${item.shopid}_${item.itemid}`,
    nome:         item.name,
    precoAtual:   preco,
    precoOriginal: orig > preco ? orig : null,
    desconto:     orig > preco ? Math.round(((orig - preco) / orig) * 100) : 0,
    vendidos:     item.sold || 0,
    avaliacao:    Number(item.item_rating?.rating_star || 0).toFixed(1),
    url:          `https://shopee.com.br/product/${item.shopid}/${item.itemid}`,
    flashSale:    true,
  };
}

function validar(p) {
  return p && p.precoAtual > 0 && p.nome?.length > 3;
}

module.exports = { buscarProdutos, gerarLinkAfiliado };
