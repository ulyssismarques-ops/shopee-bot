const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const FEED_URL = process.env.SHOPEE_FEED_URL || '';
const CACHE_PATH = '/data/feed_cache.csv';
const CACHE_META = '/data/feed_meta.json';
const CACHE_TTL_HORAS = 6;

// ─── Critérios mais permissivos ───────────────────────────────────────────────
// Estratégia: produtos com bom desconto OU bem avaliados E baratos
const MIN_AVALIACAO   = 4.0;
const MIN_PRECO       = 5;
const MAX_PRECO       = 300;
const MIN_SHOP_RATING = 4.0;
const DESCONTO_BOM    = 15; // produtos com 15%+ desconto têm prioridade

async function baixarFeedStreaming() {
  if (!FEED_URL) throw new Error('SHOPEE_FEED_URL não configurada no Railway');

  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = CACHE_PATH + '.tmp';
  console.log('⬇️  Baixando feed da Shopee (streaming)...');
  const inicio = Date.now();

  const resp = await axios.get(FEED_URL, {
    timeout: 300000, // 5 minutos
    responseType: 'stream',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    },
  });

  const writer = fs.createWriteStream(tmpPath);
  resp.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    resp.data.on('error', reject);
  });

  fs.renameSync(tmpPath, CACHE_PATH);
  fs.writeFileSync(CACHE_META, JSON.stringify({ baixadoEm: Date.now() }));

  const tamanho = fs.statSync(CACHE_PATH).size;
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`✅ Feed baixado: ${(tamanho / 1024 / 1024).toFixed(1)}MB em ${segundos}s`);
}

async function obterFeed() {
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

  console.log(`📊 ${registros.length} linhas brutas no feed`);

  // Log de DEBUG: mostra a 1ª linha pra ver os campos reais
  if (registros.length > 0) {
    const sample = registros[0];
    console.log('🔍 Campos detectados:', Object.keys(sample).slice(0, 15).join(', '));
    console.log(`🔍 Amostra: title="${(sample.title || '').slice(0, 40)}..." price=${sample.price} sale_price=${sample.sale_price} discount=${sample.discount_percentage} rating=${sample.item_rating} shop=${sample.shop_rating}`);
  }

  const parsed = registros.map(parsearLinha).filter(Boolean);
  console.log(`✅ ${parsed.length} produtos parseados com sucesso`);
  return parsed;
}

function parsearLinha(r) {
  // Shopee pode usar tanto "product_short link" (com espaço) quanto "product_short_link"
  const link = r.product_short_link || r['product_short link'] || r.product_link;
  const preco       = parseFloat((r.sale_price || r.price || '0').toString().replace(',', '.'));
  const precoOrig   = parseFloat((r.price || '0').toString().replace(',', '.'));
  const desconto    = parseInt(r.discount_percentage || '0', 10);
  const avaliacao   = parseFloat((r.item_rating || '0').toString().replace(',', '.'));
  const shopRating  = parseFloat((r.shop_rating || '0').toString().replace(',', '.'));

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
  // Filtros básicos (todos devem passar)
  const base = produtos.filter(p =>
    p.avaliacao   >= MIN_AVALIACAO &&
    p.shopRating  >= MIN_SHOP_RATING &&
    p.precoAtual  >= MIN_PRECO &&
    p.precoAtual  <= MAX_PRECO &&
    p.nome &&
    p.nome.length >= 10
  );

  console.log(`   • ${base.length} passaram nos filtros básicos (preço R$${MIN_PRECO}-${MAX_PRECO}, nota ≥${MIN_AVALIACAO}, loja ≥${MIN_SHOP_RATING})`);

  // Prioridade: tem desconto bom? Vai pro topo
  const comDesconto = base.filter(p => p.desconto >= DESCONTO_BOM);
  const semDesconto = base.filter(p => p.desconto < DESCONTO_BOM);

  console.log(`   • ${comDesconto.length} com desconto ≥${DESCONTO_BOM}%`);
  console.log(`   • ${semDesconto.length} sem desconto significativo (fallback)`);

  // Embaralha cada grupo separadamente
  const emba = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Retorna primeiro os com desconto, depois os sem
  return [...emba(comDesconto), ...emba(semDesconto)];
}

async function buscarProdutos(limite = 30) {
  try {
    const filePath = await obterFeed();
    const todos = parsearFeedDeArquivo(filePath);

    console.log('🔎 Aplicando filtros de qualidade:');
    const filtrados = filtrarQualidade(todos);
    console.log(`✨ ${filtrados.length} produtos no funil final`);

    return filtrados.slice(0, limite);
  } catch (err) {
    console.error('❌ Erro ao buscar produtos:', err.message);
    return [];
  }
}

async function gerarLinkAfiliado(urlOriginal, linkPronto) {
  return linkPronto || urlOriginal;
}

module.exports = { buscarProdutos, gerarLinkAfiliado };
