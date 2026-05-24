const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

// ─── URL do feed ─────────────────────────────────────────────────────────────
const FEED_URL = process.env.SHOPEE_FEED_URL || '';

// ─── Cache local ─────────────────────────────────────────────────────────────
const CACHE_PATH = '/data/feed_cache.csv';
const CACHE_META = '/data/feed_meta.json';
const CACHE_TTL_HORAS = 6;

// ─── Critérios de qualidade ───────────────────────────────────────────────────
const MIN_DESCONTO    = 10;
const MIN_AVALIACAO   = 4.3;
const MIN_PRECO       = 5;
const MAX_PRECO       = 500;
const MIN_SHOP_RATING = 4.5;

/**
 * Baixa o feed via STREAMING e salva direto em disco.
 * Evita carregar tudo na memória de uma vez (feed pode ter centenas de MB).
 */
async function baixarFeedStreaming() {
  if (!FEED_URL) {
    throw new Error('SHOPEE_FEED_URL não configurada no Railway');
  }

  // Garante diretório
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Arquivo temporário (caso baixe parcial e falhe)
  const tmpPath = CACHE_PATH + '.tmp';

  console.log('⬇️  Baixando feed da Shopee (streaming)...');
  const inicio = Date.now();

  const resp = await axios.get(FEED_URL, {
    timeout: 180000, // 3 minutos
    responseType: 'stream',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    },
  });

  // Pipe da resposta direto pro arquivo (não carrega na RAM)
  const writer = fs.createWriteStream(tmpPath);
  resp.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    resp.data.on('error', reject);
  });

  // Move tmp → final
  fs.renameSync(tmpPath, CACHE_PATH);
  fs.writeFileSync(CACHE_META, JSON.stringify({ baixadoEm: Date.now() }));

  const tamanho = fs.statSync(CACHE_PATH).size;
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`✅ Feed baixado: ${(tamanho / 1024 / 1024).toFixed(1)}MB em ${segundos}s`);
}

async function obterFeed() {
  // Tenta cache
  try {
    if (fs.existsSync(CACHE_PATH) && fs.existsSync(CACHE_META)) {
      const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
      const idadeHoras = (Date.now() - meta.baixadoEm) / (1000 * 60 * 60);
      if (idadeHoras < CACHE_TTL_HORAS) {
        const tamanho = fs.statSync(CACHE_PATH).size;
        console.log(`📂 Usando feed em cache (${idadeHoras.toFixed(1)}h, ${(tamanho/1024/1024).toFixed(1)}MB)`);
        return CACHE_PATH;
      }
    }
  } catch {}

  // Baixa fresco
  await baixarFeedStreaming();
  return CACHE_PATH;
}

function parsearFeedDeArquivo(filePath) {
  console.log('📖 Lendo e parseando CSV...');
  const csv = fs.readFileSync(filePath, 'utf8');

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

  const parsed = registros.map(parsearLinha).filter(Boolean);
  console.log(`📊 ${parsed.length} produtos no feed`);
  return parsed;
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
    vendidos:      0,
    url:           r.product_link,
    linkAfiliado:  link,
    categoria1:    r.global_category1,
  };
}

function filtrarQualidade(produtos) {
  return produtos.filter(p =>
    p.desconto    >= MIN_DESCONTO &&
    p.avaliacao   >= MIN_AVALIACAO &&
    p.precoAtual  >= MIN_PRECO &&
    p.precoAtual  <= MAX_PRECO &&
    p.shopRating  >= MIN_SHOP_RATING
  );
}

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
    const filePath = await obterFeed();
    const todos = parsearFeedDeArquivo(filePath);

    const filtrados = filtrarQualidade(todos);
    console.log(`✨ ${filtrados.length} produtos passaram nos critérios (desconto ≥${MIN_DESCONTO}%, nota ≥${MIN_AVALIACAO}, R$ ${MIN_PRECO}-${MAX_PRECO})`);

    return embaralhar(filtrados).slice(0, limite);
  } catch (err) {
    console.error('❌ Erro ao buscar produtos:', err.message);
    return [];
  }
}

async function gerarLinkAfiliado(urlOriginal, linkPronto) {
  return linkPronto || urlOriginal;
}

module.exports = { buscarProdutos, gerarLinkAfiliado };
