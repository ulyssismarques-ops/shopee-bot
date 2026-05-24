const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

// ─── URL do feed (vem das variáveis do Railway) ──────────────────────────────
const FEED_URL = process.env.SHOPEE_FEED_URL || '';

// ─── Cache local do feed (evita baixar várias vezes no mesmo dia) ────────────
const CACHE_PATH = '/data/feed_cache.csv';
const CACHE_META = '/data/feed_meta.json';
const CACHE_TTL_HORAS = 6; // baixa novamente após 6h

// ─── Critérios mínimos de qualidade ───────────────────────────────────────────
const MIN_DESCONTO    = 10;   // só produtos com 10%+ off
const MIN_AVALIACAO   = 4.3;  // só com nota ≥ 4.3
const MIN_PRECO       = 5;    // ignora produtos suspeitos (centavos)
const MAX_PRECO       = 500;  // foco em ticket médio do grupo (achadinhos)

async function baixarFeed() {
  // Verifica cache
  try {
    if (fs.existsSync(CACHE_PATH) && fs.existsSync(CACHE_META)) {
      const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
      const idadeHoras = (Date.now() - meta.baixadoEm) / (1000 * 60 * 60);
      if (idadeHoras < CACHE_TTL_HORAS) {
        console.log(`📂 Usando feed em cache (${idadeHoras.toFixed(1)}h de idade)`);
        return fs.readFileSync(CACHE_PATH, 'utf8');
      }
    }
  } catch {}

  // Baixa fresco
  if (!FEED_URL) {
    throw new Error('SHOPEE_FEED_URL não configurada nas variáveis do Railway');
  }

  console.log('⬇️  Baixando feed da Shopee...');
  const resp = await axios.get(FEED_URL, {
    timeout: 60000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    },
    maxContentLength: 100 * 1024 * 1024, // até 100MB
  });

  const csv = resp.data;

  // Salva no cache
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, csv);
    fs.writeFileSync(CACHE_META, JSON.stringify({ baixadoEm: Date.now() }));
  } catch (err) {
    console.warn('Aviso: não foi possível salvar cache:', err.message);
  }

  console.log(`✅ Feed baixado: ${(csv.length / 1024 / 1024).toFixed(1)}MB`);
  return csv;
}

function parsearFeed(csv) {
  let registros;
  try {
    registros = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (err) {
    console.error('Erro parseando CSV:', err.message);
    return [];
  }

  return registros.map(parsearLinha).filter(Boolean);
}

function parsearLinha(r) {
  const preco       = parseFloat(r.sale_price || r.price || '0');
  const precoOrig   = parseFloat(r.price || '0');
  const desconto    = parseInt(r.discount_percentage || '0', 10);
  const avaliacao   = parseFloat(r.item_rating || '0');
  const shopRating  = parseFloat(r.shop_rating || '0');
  const link        = r.product_short_link || r.product_link;

  if (!link || !r.title || preco <= 0) return null;

  return {
    id:            r.itemid,
    nome:          r.title.trim(),
    precoAtual:    preco,
    precoOriginal: precoOrig > preco ? precoOrig : null,
    desconto,
    avaliacao,
    shopRating,
    vendidos:      0, // não vem no feed
    url:           r.product_link,
    linkAfiliado:  link,  // já vem pronto!
    categoria1:    r.global_category1,
    categoria2:    r.global_category2,
  };
}

function filtrarQualidade(produtos) {
  return produtos.filter(p =>
    p.desconto    >= MIN_DESCONTO &&
    p.avaliacao   >= MIN_AVALIACAO &&
    p.precoAtual  >= MIN_PRECO &&
    p.precoAtual  <= MAX_PRECO &&
    p.shopRating  >= 4.5
  );
}

// Embaralha array (variedade nos envios)
function embaralhar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function buscarProdutos(limite = 30) {
  try {
    const csv = await baixarFeed();
    const todos = parsearFeed(csv);
    console.log(`📊 ${todos.length} produtos no feed`);

    const filtrados = filtrarQualidade(todos);
    console.log(`✨ ${filtrados.length} produtos passaram nos critérios (desconto ≥${MIN_DESCONTO}%, nota ≥${MIN_AVALIACAO}, R$ ${MIN_PRECO}-${MAX_PRECO})`);

    const embaralhados = embaralhar(filtrados);
    return embaralhados.slice(0, limite);
  } catch (err) {
    console.error('❌ Erro ao buscar produtos:', err.message);
    return [];
  }
}

// Link já vem pronto no feed — função existe só pra manter compatibilidade com index.js
async function gerarLinkAfiliado(urlOriginal, linkPronto) {
  return linkPronto || urlOriginal;
}

module.exports = { buscarProdutos, gerarLinkAfiliado };
