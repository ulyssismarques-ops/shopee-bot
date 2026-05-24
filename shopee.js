const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const FEED_URL = process.env.SHOPEE_FEED_URL || '';
const CACHE_PATH = '/data/feed_cache.csv';
const CACHE_META = '/data/feed_meta.json';
const CACHE_TTL_HORAS = 6;

const MIN_AVALIACAO   = 4.0;
const MIN_PRECO       = 5;
const MAX_PRECO       = 300;
const DESCONTO_BOM    = 15;

async function baixarFeedStreaming() {
  if (!FEED_URL) throw new Error('SHOPEE_FEED_URL não configurada no Railway');

  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = CACHE_PATH + '.tmp';
  console.log('⬇️  Baixando feed da Shopee (streaming)...');
  const inicio = Date.now();

  const resp = await axios.get(FEED_URL, {
    timeout: 300000,
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

  if (registros.length > 0) {
    const s = registros[0];
    console.log('🔍 TODAS as chaves:', JSON.stringify(Object.keys(s)));
    console.log('🔍 Primeira linha completa:', JSON.stringify(s).slice(0, 600));
  }

  const parsed = registros.map(parsearLinha).filter(Boolean);
  console.log(`✅ ${parsed.length} produtos parseados com sucesso`);

  // Mostra amostra do produto JÁ PARSEADO
  if (parsed.length > 0) {
    console.log('🔍 Primeiro produto parseado:', JSON.stringify(parsed[0]).slice(0, 400));
  }

  return parsed;
}

function parsearLinha(r) {
  const link = r.product_short_link || r['product_short link'] || r.product_link;
  const preco       = parseFloat(String(r.sale_price || r.price || '0').replace(',', '.'));
  const precoOrig   = parseFloat(String(r.price || '0').replace(',', '.'));
  const desconto    = parseInt(r.discount_percentage || '0', 10);
  const avaliacao   = parseFloat(String(r.item_rating || '0').replace(',', '.'));
  const shopRating  = parseFloat(String(r.shop_rating || '0').replace(',', '.'));

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
  // Conta quantos passam em CADA filtro individualmente (debug)
  const c = {
    nota:      produtos.filter(p => p.avaliacao >= MIN_AVALIACAO).length,
    preco:     produtos.filter(p => p.precoAtual >= MIN_PRECO && p.precoAtual <= MAX_PRECO).length,
    nome:      produtos.filter(p => p.nome && p.nome.length >= 10).length,
  };
  console.log(`   📈 Por filtro individual:`);
  console.log(`      • Nota ≥ ${MIN_AVALIACAO}:           ${c.nota}`);
  console.log(`      • Preço R$${MIN_PRECO}-${MAX_PRECO}:       ${c.preco}`);
  console.log(`      • Nome ≥ 10 caracteres:    ${c.nome}`);

  const base = produtos.filter(p =>
    p.avaliacao   >= MIN_AVALIACAO &&
    p.precoAtual  >= MIN_PRECO &&
    p.precoAtual  <= MAX_PRECO &&
    p.nome &&
    p.nome.length >= 10
  );

  console.log(`   ✓ Combinado: ${base.length} produtos`);

  const comDesconto = base.filter(p => p.desconto >= DESCONTO_BOM);
  const semDesconto = base.filter(p => p.desconto < DESCONTO_BOM);

  console.log(`   • Com desconto ≥${DESCONTO_BOM}%: ${comDesconto.length}`);
  console.log(`   • Sem desconto:           ${semDesconto.length}`);

  const emba = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  return [...emba(comDesconto), ...emba(semDesconto)];
}

async function buscarProdutos(limite = 30) {
  try {
    const filePath = await obterFeed();
    const todos = parsearFeedDeArquivo(filePath);

    console.log('🔎 Aplicando filtros:');
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
