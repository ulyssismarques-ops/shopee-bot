const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const { pontuarProduto, descreverContexto, CALENDARIO_BR, palavraEstaNoNome } = require('./tendencias');

const FEED_URL = process.env.SHOPEE_FEED_URL || '';
const CACHE_PATH = '/data/feed_cache.csv';
const CACHE_META = '/data/feed_meta.json';
const CACHE_TTL_HORAS = 6;

const MIN_AVALIACAO   = 4.5;   // antes 4.0 — filtros mais rigorosos (v3.3)
const MIN_SHOP_RATING = 4.7;   // exigido quando feed informa shop_rating > 0
const MIN_AVAL_SEM_SHOP = 4.7; // v3.20 — exigido como compensação quando shop_rating=0 no feed
const MIN_PRECO       = 10;    // antes 5 — abaixo disso geralmente é tranqueirinha
const MAX_PRECO       = 150;   // antes 300 — foco em achadinho de impulso
const DESCONTO_BOM    = 20;    // antes 15 — só destaca quem tem oferta real

// Categorias bloqueadas — checa em global_category1/2/3 (case-insensitive, substring)
// IMPORTANTE: NÃO bloqueamos "automotive" mais — queremos acessórios universais de carro
// (suporte celular, aromatizador, capa volante). Modelos específicos são pegos pelas palavras.
const CATEGORIAS_BLOQUEADAS = [
  // Construção pesada (NÃO confundir com decoração)
  'home improvement', 'hardware', 'building supplies',
  // Industrial e profissional
  'industrial', 'commercial', 'office equipment', 'medical',
  // Informática / computação — nicho demais pra audiência da Rosana
  'computers', 'computer peripherals', 'networking', 'servers', 'storage',
  // Hobby muito nicho
  'cameras & drones', 'photography', 'pro audio',
  'musical instrument', 'collectibles', 'cosplay',
  // Adulto / erótico — NUNCA postar (v3.24)
  'adult', 'sex toys', 'intimate items', 'erotic', 'adult products',
];

// Palavras bloqueadas no nome do produto (case-insensitive, substring)
// Foco principal: MODELOS específicos de veículo (Spin 2013, etc) — acessórios
// universais (suporte celular, aromatizador) PASSAM e podem ser anunciados.
const PALAVRAS_BLOQUEADAS = [
  // Modelos de carro brasileiros — bloqueia "para Spin 2013", "compatível Onix", etc.
  // Note o espaço no fim — evita falsos positivos tipo "kit" (bloqueado por "ka ")
  ' spin ', ' onix ', ' civic ', ' corolla ', ' palio ', ' siena ',
  'gol g4', 'gol g5', 'gol g6', ' hb20 ', ' creta ', ' tracker ',
  ' compass ', ' kicks ', ' duster ', ' ecosport ', ' fiesta ',
  ' uno ', ' celta ', ' prisma ',
  // Modelos de moto
  'cb 500', 'cb 600', 'cg 125', 'cg 150', 'cg 160', 'biz 125', 'biz 110',
  'gs 650', 'f800', ' cbr ', ' twister ',
  // Padrão "ano modelo" tipo 2013/2014 indica peça específica
  // (não bloqueamos só o ano — pode ser "kit ferramenta 2024")
  // Peças específicas de moto/carro (NÃO universais)
  'pastilha freio', 'pastilha de freio', 'rolamento roda',
  'amortecedor traseiro', 'amortecedor dianteiro',
  'mola suspensão', 'bomba óleo', 'embreagem',
  // Foto/hobby super nicho (acessório de fotógrafo profissional)
  'fundo fotográfico', 'fundo fotografico', 'tripé profissional',
  'softbox', 'ringlight profissional', 'cosplay', 'figure action',
  // Componentes de PC — nicho demais pra audiência geral
  'processador intel', 'processador amd', 'placa-mãe', 'placa mae',
  'placa de vídeo', 'placa de video', 'placa video', ' gpu ', 'rtx ', 'gtx ',
  'memória ram', 'memoria ram', ' ram ddr', 'ddr4 ', 'ddr5 ',
  'ssd m.2', 'nvme ', 'm2 nvme', 'hd sata', 'fonte atx', 'fonte psu',
  'gabinete gamer', 'gabinete pc', 'cooler cpu', 'water cooler cpu',
  'pasta térmica', 'pasta termica', 'dissipador cpu',
  'switch 8 portas', 'switch 16 portas', 'cabo de rede cat',
  // Utilitários domésticos pesados — jamais são presente ou impulso de compra
  'botijão', 'bujão', 'mangueira gás', 'regulador gás', 'válvula gás',
  'caixa d agua', 'caixa dagua', 'reservatório', 'bomba d agua', 'bomba dagua',
  'calha ', 'telha ', 'tijolo', 'cimento', 'argamassa',
  'furadeira', 'parafusadeira', 'marreta', 'enxada', 'foice',
  'tela mosquiteiro', 'grade de ferro', 'porta de ferro',
  'vaso sanitário', 'vaso sanitario', 'sifão ', 'tampa vaso', 'assento sanitário',
  'cabo de vassoura', 'cabo de rodo',
  // Peças elétricas e hidráulicas (não acessórios, peças brutas)
  'disjuntor', 'quadro de luz', 'eletroduto', 'conduíte',
  'cano pvc', 'joelho pvc', 'luva pvc', 'registro de água',
  // Marcas chinesas obscuras
  'laikou', 'yesop', 'bamoer', 'kaukko', 'rolanstar',
  // Termos estrangeiros que não vendem bem no BR
  'whitening', 'estilo chinês', 'estilo chines',
  'estilo japonês', 'estilo japones', 'estilo coreano',
  // Adulto / erótico — NUNCA postar (v3.24)
  // Bloqueia produtos com qualquer uma dessas palavras no nome
  'vibrador', 'consolo', 'consolador', 'dildo', 'sex toy', 'sextoy',
  'masturbador', 'masturbadora', 'plug anal', 'anel peniano',
  'lubrificante íntimo', 'lubrificante intimo', 'gel lubrificante',
  'gel íntimo', 'gel intimo', 'estimulador clitoriano', 'estimulador',
  'fantasia erótica', 'fantasia erotica', 'fantasia sensual',
  'fantasia sexy', 'lingerie sexy', 'lingerie sensual',
  'calcinha fio dental', 'tanga sexy', 'sutiã sexy', 'sutia sexy',
  'baby doll sensual', 'baby doll sexy', 'cueca sexy',
  'kit sexy', 'kit erótico', 'kit erotico', 'kit sensual',
  'fetiche', 'bondage', 'algema sexy', 'venda dos olhos',
  'óleo sensual', 'oleo sensual', 'óleo afrodisíaco',
  'massageador íntimo', 'massageador intimo', 'massageador g',
  'preservativo', 'camisinha', 'lubrificante',
  'pênis', 'penis ', 'vagina ', 'clitóris', 'clitoris',
  'erotic', 'sex shop', 'sexshop',
];

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

// Mutex: evita race condition quando multiplos ciclos disparam simultaneamente
let _feedDownloadPromise = null;

async function obterFeed() {
  try {
    if (fs.existsSync(CACHE_PATH) && fs.existsSync(CACHE_META)) {
      const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
      const idadeHoras = (Date.now() - meta.baixadoEm) / (1000 * 60 * 60);
      if (idadeHoras < CACHE_TTL_HORAS) {
        const tamanho = fs.statSync(CACHE_PATH).size;
        console.log(`Usando feed em cache (${idadeHoras.toFixed(1)}h, ${(tamanho/1024/1024).toFixed(1)}MB)`);
        return CACHE_PATH;
      }
    }
  } catch {}
  if (_feedDownloadPromise) {
    console.log('Feed ja sendo baixado por outro ciclo, aguardando...');
    await _feedDownloadPromise;
    return CACHE_PATH;
  }
  _feedDownloadPromise = baixarFeedStreaming().finally(() => { _feedDownloadPromise = null; });
  await _feedDownloadPromise;
  return CACHE_PATH;
}

function parsearFeedDeArquivo(filePath) {
  console.log('📖 Lendo e parseando CSV...');
  // v3.25 — Strip BOM (UTF-8 byte order mark) que o feed da Shopee envia no início.
  // Sem isso a primeira coluna vira "﻿shop_rating" e r.shop_rating retorna undefined,
  // fazendo shopRating ser sempre 0 e quebrando o filtro de loja confiável.
  const csv = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');

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
    imagem:        r.image_link || r.image_link_3 || null,
    categoria1:    r.global_category1,
    categoria2:    r.global_category2,
    categoria3:    r.global_category3,
    crossBorder:   ehInternacional(r.cb_option),  // novo (v3.6) — true se internacional
    comissao:      parseFloat(String(r.commission_rate || r.seller_commission_rate || '0').replace(',', '.')),
  };
}

// Identifica se o produto é compra internacional (cross-border).
// Valores típicos do feed Shopee:
//   "Non-Cross border" → vendido por loja BR, chega em 3-7 dias  → NACIONAL (false)
//   "Cross-Border"     → vem da China/Ásia, chega em 30+ dias    → INTERNACIONAL (true)
function ehInternacional(cbOption) {
  if (!cbOption) return false;  // sem info, assume nacional
  const v = String(cbOption).toLowerCase().trim();
  if (v.includes('non')) return false;  // "non-cross border" = nacional
  return v.includes('cross');
}

// Verifica se alguma das 3 categorias do produto bate com a blocklist
function temCategoriaBloqueada(p) {
  const cats = [p.categoria1, p.categoria2, p.categoria3]
    .filter(Boolean)
    .map((c) => String(c).toLowerCase());
  return CATEGORIAS_BLOQUEADAS.some((bloqueada) =>
    cats.some((c) => c.includes(bloqueada))
  );
}

// Verifica se o nome do produto contém alguma palavra da blocklist
function temPalavraBloqueada(nome) {
  if (!nome) return false;
  const n = nome.toLowerCase();
  if (PALAVRAS_BLOQUEADAS.some((p) => n.includes(p))) return true;
  // Padrões spammy de vendedor — "Top 3 achados do dia", "Top 5 mais vendidos", etc.
  // Vendedores Shopee fazem isso pra gamificar a busca, geralmente é lixão
  if (PADROES_SPAM.some((re) => re.test(n))) return true;
  return false;
}

// Regex pra detectar nomes claramente artificiais (gaming de busca)
const PADROES_SPAM = [
  /^top \d+ achado/i,             // "Top 3 achados..."
  /^top \d+ do dia/i,             // "Top 5 do dia..."
  /^top \d+ mais/i,               // "Top 10 mais vendidos..."
  /^\d+\s*[°ºª]\s*lugar/i,        // "1° lugar em..."
  /^melhor[es]? \d+/i,            // "Melhores 5..."
];

function filtrarQualidade(produtos) {
  // Conta quantos passam em CADA filtro individualmente (debug)
  const c = {
    nota:      produtos.filter(p => p.avaliacao >= MIN_AVALIACAO).length,
    loja:      produtos.filter(p => p.shopRating >= MIN_SHOP_RATING).length,
    preco:     produtos.filter(p => p.precoAtual >= MIN_PRECO && p.precoAtual <= MAX_PRECO).length,
    nome:      produtos.filter(p => p.nome && p.nome.length >= 10).length,
    naoBloq:   produtos.filter(p => !temPalavraBloqueada(p.nome) && !temCategoriaBloqueada(p)).length,
  };
  console.log(`   📈 Por filtro individual:`);
  console.log(`      • Nota ≥ ${MIN_AVALIACAO}:           ${c.nota}`);
  console.log(`      • Shop rating ≥ ${MIN_SHOP_RATING}:    ${c.loja}`);
  console.log(`      • Preço R$${MIN_PRECO}-${MAX_PRECO}:       ${c.preco}`);
  console.log(`      • Nome ≥ 10 caracteres:    ${c.nome}`);
  console.log(`      • Não bloqueados:          ${c.naoBloq}`);

  // v3.20: quando feed não informa shopRating (=0), compensamos exigindo
  // nota do produto mais alta (≥4.7 em vez de ≥4.5). Vendedor ruim que
  // omita o rating não passa de graça.
  const base = produtos.filter(p =>
    p.avaliacao   >= MIN_AVALIACAO &&
    (p.shopRating >= MIN_SHOP_RATING ||
     (p.shopRating === 0 && p.avaliacao >= MIN_AVAL_SEM_SHOP)) &&
    p.precoAtual  >= MIN_PRECO &&
    p.precoAtual  <= MAX_PRECO &&
    p.nome && p.nome.length >= 10 &&
    !temPalavraBloqueada(p.nome) &&
    !temCategoriaBloqueada(p)
  );

  console.log(`   ✓ Combinado: ${base.length} produtos`);

  // Contagem nacional vs internacional (v3.6)
  const nacionais = base.filter(p => !p.crossBorder).length;
  const internacionais = base.length - nacionais;
  console.log(`   🇧🇷 Nacionais (Non-Cross): ${nacionais}  |  🌏 Internacionais: ${internacionais}`);
  console.log(`   ${descreverContexto()}`);

  // Pontua cada produto com base em qualidade + tendência + evento próximo + estação
  // + penalidade pra produto internacional (v3.6)
  const pontuados = base.map(p => ({ ...p, score: pontuarProduto(p) }));
  pontuados.sort((a, b) => b.score - a.score);

  // Log dos top 5 pra debug
  console.log(`   🏆 Top 5 por score:`);
  pontuados.slice(0, 5).forEach((p, i) => {
    console.log(`      ${i + 1}. [${p.score}] ${p.nome.slice(0, 60)}`);
  });

  return pontuados;
}

// ─── DIVERSIFICAÇÃO POR SETOR ────────────────────────────────────────────────
// Garante que os 5 produtos enviados vêm de categorias distintas.
// A ordem dos setores define a prioridade quando o nome bate em mais de um.
const SETORES_KEYWORDS = {
  beleza:  ['beleza', 'maquiagem', 'skincare', 'sérum', 'serum', 'perfume', 'cabelo',
             'shampoo', 'condicionador', 'hidratante', 'batom', 'esmalte', 'protetor solar',
             'máscara facial', 'mascara facial', 'gloss', 'blush', 'pincel maquiagem',
             'iluminador', 'base maquiagem'],
  cozinha: ['air fryer', 'forma silicone', 'garrafa térmica', 'garrafa termica',
             'copo stanley', 'copo personalizado', 'squeeze', 'garrafinha',
             'pote hermético', 'pote hermetico', 'tupperware', 'lancheira térmica',
             'panela', 'frigideira', 'utensílio cozinha', 'utensilio cozinha',
             'liquidificador', 'batedeira', 'fritadeira', 'descascador'],
  casa:    ['luminária', 'luminaria', 'fita led', 'aromatizador ambiente', 'difusor',
             'vaso decorativo', 'porta-retrato', 'quadro decorativo', 'cortina',
             'tapete sala', 'almofada', 'organizador', 'cesto organizador',
             'prateleira', 'gancho parede', 'cabide'],
  moda:    ['vestido', 'blusa cropped', 'cropped', 'calça jeans', 'jeans destroyed',
             'saia ', 'tênis branco', 'tenis branco', 'sandália', 'sandalia',
             'bolsa ', 'pochete', 'anel ', 'colar ', 'pulseira', 'brinco',
             'óculos de sol', 'oculos de sol', 'boné', 'bone aba reta', 'chapéu'],
  tech:    ['fone bluetooth', 'fone sem fio', 'smartwatch', 'carregador rápido',
             'carregador rapido', 'powerbank', 'cabo tipo c', 'cabo usb c',
             'suporte celular', 'caixa de som', 'projetor portátil', 'webcam', 'mouse sem fio'],
  pet:     ['cama pet', 'comedouro pet', 'bebedouro pet', 'arranhador', 'coleira',
             'brinquedo cachorro', 'brinquedo gato', 'caixa transporte', 'guia ',
             ' pet ', 'cachorro', ' gato '],
  bebe:    ['bebê', 'bebe', 'baby ', 'mordedor', 'tapete bebê', 'tapete bebe',
             'mochila escolar', 'lancheira infantil', 'boneca', 'pelúcia', 'pelucia',
             'brinquedo infantil', 'carrinho bebe'],
  fitness: ['elástico fitness', 'elastico fitness', 'colchonete', 'tapete yoga',
             'halter ', 'caneleira', 'corda de pular', 'roller '],
  auto:    ['suporte celular carro', 'carregador veicular', 'aromatizador automotivo',
             'organizador porta-malas', 'capa de volante', 'almofada pescoço carro'],
};

function classificarSetor(produto) {
  const nome = (produto.nome || '').toLowerCase();
  const cat  = [produto.categoria1, produto.categoria2, produto.categoria3]
    .filter(Boolean).join(' ').toLowerCase();
  for (const [setor, kws] of Object.entries(SETORES_KEYWORDS)) {
    if (kws.some(kw => nome.includes(kw) || cat.includes(kw))) return setor;
  }
  return 'outros';
}

/**
 * Seleciona `quantidade` produtos com duas estratégias:
 *
 * MODO CAMPANHA (evento ≤ 14 dias):
 *   - 3 slots: melhores produtos da campanha (por score — scoring já os priorizou)
 *   - 2 slots: produtos de setores distintos NÃO cobertos pelos 3 de campanha
 *   Garante que a lista seja dominada pela data comemorativa sem ser monótona.
 *
 * MODO NORMAL (sem evento próximo):
 *   - 5 slots: 1 por setor, completa com melhores restantes se faltar variedade.
 *
 * Pressupõe que `produtos` já está ordenado por score decrescente.
 */
function diversificarSelecao(produtos, quantidade = 5) {
  const hoje = new Date();

  // Descobre eventos com campanha ativa (≤ 14 dias)
  const eventosCampanha = CALENDARIO_BR.filter(ev => {
    const ano = hoje.getFullYear();
    let d = new Date(ano, ev.mes - 1, ev.dia);
    if (d < hoje) d = new Date(ano + 1, ev.mes - 1, ev.dia);
    return Math.floor((d - hoje) / 86400000) <= 14;
  });

  const selecionados = [];

  if (eventosCampanha.length > 0) {
    // ── MODO CAMPANHA ──────────────────────────────────────────────────────
    const kwsCampanha = eventosCampanha.flatMap(ev => ev.palavras);
    // v3.20: usa palavra inteira (não substring) — evita "coração" em "decoração"
    const ehCampanha  = p => kwsCampanha.some(kw => palavraEstaNoNome(kw, (p.nome || '').toLowerCase()));

    const deCampanha = produtos.filter(ehCampanha);
    const gerais     = produtos.filter(p => !ehCampanha(p));

    // Slot 1-3: melhores produtos da campanha (score já os ordenou)
    const maxCampanha = Math.min(3, deCampanha.length, quantidade);
    for (const p of deCampanha) {
      if (selecionados.length >= maxCampanha) break;
      selecionados.push({ ...p, _setor: classificarSetor(p) });
    }

    // Slot 4-5: setores distintos dos já usados (complementa com diversidade)
    const setoresUsados = new Set(selecionados.map(p => p._setor));
    const usados        = new Set(selecionados.map(p => p.id));
    for (const p of gerais) {
      if (selecionados.length >= quantidade) break;
      const s = classificarSetor(p);
      if (!setoresUsados.has(s)) {
        selecionados.push({ ...p, _setor: s });
        setoresUsados.add(s);
        usados.add(p.id);
      }
    }

    // Completa sem restrição se ainda faltar (feed pequeno)
    const usados2 = new Set(selecionados.map(p => p.id));
    for (const p of produtos) {
      if (selecionados.length >= quantidade) break;
      if (!usados2.has(p.id)) {
        selecionados.push({ ...p, _setor: classificarSetor(p) });
        usados2.add(p.id);
      }
    }

    const nomeEventos  = eventosCampanha.map(e => e.nome).join(' + ');
    const qtdCampanha  = selecionados.filter(ehCampanha).length;
    console.log(`   🎯 Modo campanha [${nomeEventos}]: ${qtdCampanha} campanha + ${selecionados.length - qtdCampanha} diversidade`);

  } else {
    // ── MODO NORMAL ────────────────────────────────────────────────────────
    const setoresUsados = new Set();
    for (const p of produtos) {
      if (selecionados.length >= quantidade) break;
      const s = classificarSetor(p);
      if (!setoresUsados.has(s)) {
        selecionados.push({ ...p, _setor: s });
        setoresUsados.add(s);
      }
    }
    // Completa slots restantes com os melhores não usados
    const usados = new Set(selecionados.map(p => p.id));
    for (const p of produtos) {
      if (selecionados.length >= quantidade) break;
      if (!usados.has(p.id)) {
        selecionados.push({ ...p, _setor: classificarSetor(p) });
        usados.add(p.id);
      }
    }

    console.log(`   🎨 Modo normal — setores: ${selecionados.map(p => p._setor).join(', ')}`);
  }

  return selecionados;
}

const PALAVRAS_BELEZA = [
  'beleza', 'cosméticos', 'cosmético', 'maquiagem', 'skincare',
  'perfumaria', 'perfume', 'cabelo', 'cuidados pessoais', 'pele',
  'hidratante', 'batom', 'protetor', 'shampoo', 'condicionador',
  'serum', 'sérum', 'creme', 'base ', 'iluminador', 'blush',
  'esmalte', 'manicure', 'depilação', 'limpeza facial',
];

function ehBeleza(produto) {
  const cat = (produto.categoria1 || '').toLowerCase();
  const nome = (produto.nome || '').toLowerCase();
  return PALAVRAS_BELEZA.some(p => cat.includes(p) || nome.includes(p));
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

async function buscarProdutosBeleza(limite = 30) {
  try {
    const filePath = await obterFeed();
    const todos = parsearFeedDeArquivo(filePath);
    const filtrados = filtrarQualidade(todos.filter(ehBeleza));
    console.log(`💄 ${filtrados.length} produtos de beleza no funil`);
    return filtrados.slice(0, limite);
  } catch (err) {
    console.error('❌ Erro ao buscar produtos de beleza:', err.message);
    return [];
  }
}

async function buscarProdutosGerais(limite = 30) {
  try {
    const filePath = await obterFeed();
    const todos = parsearFeedDeArquivo(filePath);
    const filtrados = filtrarQualidade(todos.filter(p => !ehBeleza(p)));
    console.log(`🛍️  ${filtrados.length} produtos gerais no funil`);
    return filtrados.slice(0, limite);
  } catch (err) {
    console.error('❌ Erro ao buscar produtos gerais:', err.message);
    return [];
  }
}

async function gerarLinkAfiliado(urlOriginal, linkPronto) {
  const link = linkPronto || urlOriginal;

  // Se já é shope.ee curto, retorna direto
  if (link.match(/shope\.ee\/[a-zA-Z0-9]{5,15}$/)) return link;

  // Encurta via TinyURL (WhatsApp consegue gerar preview de links TinyURL)
  try {
    const curto = await encurtarTinyURL(link);
    if (curto) return curto;
  } catch (err) {
    console.warn('  ⚠️  Encurtador falhou:', err.message);
  }

  return link;
}

/**
 * Encurta uma URL usando TinyURL (API pública, sem autenticação)
 * O WhatsApp consegue gerar preview de links tinyurl.com — diferente de shopee.com.br
 * que é bloqueado pelo anti-bot da Shopee
 */
async function encurtarTinyURL(url) {
  const resp = await axios.get('https://tinyurl.com/api-create.php', {
    params: { url },
    timeout: 6000,
  });
  const curto = (resp.data || '').toString().trim();
  if (curto.startsWith('http')) return curto;
  return null;
}

module.exports = { buscarProdutos, buscarProdutosBeleza, buscarProdutosGerais, gerarLinkAfiliado, ehBeleza, diversificarSelecao };
