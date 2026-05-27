#!/usr/bin/env node
/**
 * test.js — Validador local do bot SEM disparar pra produção.
 *
 * Uso:
 *   node test.js                          # usa produtos sintéticos
 *   node test.js --csv=/data/feed.csv     # usa feed real (copie do Railway)
 *   node test.js --data=2026-07-15        # simula data específica
 *   node test.js --top=20                 # mostra top N (default 10)
 *
 * O que faz:
 *   1. Carrega feed (CSV real ou sintético)
 *   2. Aplica filtros (categoria, palavra, qualidade)
 *   3. Mostra top N com score, chamada, categoria
 *   4. Exemplo de mensagem WhatsApp + legenda Instagram pro top 1
 *   5. Sumário: nacionais/internacionais, palavras bloqueadas, etc.
 *
 * Permite validar mudanças nos filtros antes de pushar pra produção.
 */
const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const flag = (n, def) => {
  const v = args.find(a => a.startsWith(`--${n}=`));
  return v ? v.slice(n.length + 3) : def;
};

const CSV_PATH = flag('csv', null);
const DATA_STR = flag('data', null);
const TOP_N   = parseInt(flag('top', '10'), 10);

const HOJE = DATA_STR ? new Date(DATA_STR + 'T12:00:00') : new Date();
if (Number.isNaN(HOJE.getTime())) {
  console.error('❌ Data inválida (use YYYY-MM-DD)');
  process.exit(1);
}

// Lazy-require pra permitir mock de data via override
const { pontuarProduto, gerarChamada, descreverContexto, palavraEstaNoNome } = require('./tendencias');

// ─── Carregamento de produtos ───────────────────────────────────────────────
function carregarProdutos() {
  if (CSV_PATH) {
    console.log(`📂 Lendo feed: ${CSV_PATH}`);
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`❌ Arquivo não encontrado: ${CSV_PATH}`);
      process.exit(1);
    }
    // Reaproveita parser do shopee.js
    const { parse } = require('csv-parse/sync');
    const csv = fs.readFileSync(CSV_PATH, 'utf8');
    const registros = parse(csv, {
      columns: true, skip_empty_lines: true,
      relax_quotes: true, relax_column_count: true, trim: true,
    });
    console.log(`   ${registros.length} linhas brutas`);
    return registros.map(parsearLinha).filter(Boolean);
  }

  console.log('📦 Usando produtos sintéticos (passe --csv= pra usar feed real)');
  return PRODUTOS_SINTETICOS;
}

// Réplica do parsearLinha de shopee.js
function parsearLinha(r) {
  const link = r.product_short_link || r['product_short link'] || r.product_link;
  const preco       = parseFloat(String(r.sale_price || r.price || '0').replace(',', '.'));
  const precoOrig   = parseFloat(String(r.price || '0').replace(',', '.'));
  const desconto    = parseInt(r.discount_percentage || '0', 10);
  const avaliacao   = parseFloat(String(r.item_rating || '0').replace(',', '.'));
  const shopRating  = parseFloat(String(r.shop_rating || '0').replace(',', '.'));
  if (!link || !r.title || preco <= 0) return null;
  return {
    id: r.itemid, nome: r.title.trim(),
    precoAtual: preco, precoOriginal: precoOrig > preco ? precoOrig : null,
    desconto, avaliacao, shopRating,
    url: r.product_link, linkAfiliado: link,
    imagem: r.image_link || r.image_link_3 || null,
    categoria1: r.global_category1, categoria2: r.global_category2, categoria3: r.global_category3,
    crossBorder: r.cb_option && !String(r.cb_option).toLowerCase().includes('non'),
  };
}

// Produtos sintéticos — casos de teste comuns
const PRODUTOS_SINTETICOS = [
  // Bons exemplos
  { id: '1', nome: 'Cooler Térmico 24L Bandeira Brasil Copa do Mundo', precoAtual: 130, precoOriginal: 220, desconto: 41, avaliacao: 4.8, shopRating: 4.9, crossBorder: false, comissao: 8 },
  { id: '2', nome: 'Kit Pijama Casal Coração Algodão Inverno', precoAtual: 79, precoOriginal: 160, desconto: 51, avaliacao: 4.7, shopRating: 4.8, crossBorder: false, comissao: 6 },
  { id: '3', nome: 'Manta Cobertor Sherpa Macia 2,20x2,40m', precoAtual: 85, precoOriginal: 170, desconto: 50, avaliacao: 4.8, shopRating: 4.7, crossBorder: false, comissao: 5 },
  { id: '4', nome: 'Fone Bluetooth TWS Cancelamento Ruído', precoAtual: 89, precoOriginal: 190, desconto: 53, avaliacao: 4.6, shopRating: 4.8, crossBorder: false, comissao: 8 },
  { id: '5', nome: 'Sérum Facial Vitamina C Ácido Hialurônico 30ml', precoAtual: 35, precoOriginal: 89, desconto: 60, avaliacao: 4.8, shopRating: 4.9, crossBorder: false, comissao: 12 },
  { id: '6', nome: 'Air Fryer Mondial 4L Digital Touch', precoAtual: 149, precoOriginal: 280, desconto: 47, avaliacao: 4.7, shopRating: 4.8, crossBorder: false, comissao: 5 },
  // Bordas / casos de bug histórico
  { id: 'b1', nome: 'Forma Silicone Chocolate Ovo Coelho Rosto 811 BWB', precoAtual: 16, precoOriginal: 23, desconto: 33, avaliacao: 4.7, shopRating: 4.8, crossBorder: false, comissao: 4 },
  { id: 'b2', nome: 'Luzes de Natal Cordão LED 110v Decoração Natal', precoAtual: 35, precoOriginal: 75, desconto: 53, avaliacao: 4.7, shopRating: 4.8, crossBorder: false, comissao: 5 },
  { id: 'b3', nome: 'Kit 3 Cooler Fan ARGB 120mm Para Gabinete CPU Gamer', precoAtual: 99, precoOriginal: 180, desconto: 45, avaliacao: 4.7, shopRating: 4.8, crossBorder: false, comissao: 5, categoria1: 'Computers' },
  { id: 'b4', nome: 'Top 3 Achados Do Dia Kit Caneta Esferográfica', precoAtual: 12, precoOriginal: 30, desconto: 60, avaliacao: 4.6, shopRating: 4.7, crossBorder: false, comissao: 3 },
  { id: 'b5', nome: 'YESOP Chuveiro Manual Inox Luxo Estilo Céu Estrelado', precoAtual: 89, precoOriginal: 250, desconto: 64, avaliacao: 4.5, shopRating: 4.3, crossBorder: true, comissao: 10 },
  // Genéricos (devem aparecer no fundo)
  { id: 'g1', nome: 'Caneta esferográfica preta pacote 12 unidades', precoAtual: 12, precoOriginal: null, desconto: 0, avaliacao: 4.5, shopRating: 4.7, crossBorder: false, comissao: 3 },
];

// ─── Filtros (simulação do shopee.js) ───────────────────────────────────────
const MIN_AVALIACAO   = 4.5;
const MIN_SHOP_RATING = 4.7;
const MIN_AVAL_SEM_SHOP = 4.7;
const MIN_PRECO       = 10;
const MAX_PRECO       = 150;

const CATEGORIAS_BLOQUEADAS = [
  'home improvement', 'hardware', 'building supplies',
  'industrial', 'commercial', 'office equipment', 'medical',
  'computers', 'computer peripherals', 'networking', 'servers', 'storage',
  'cameras & drones', 'photography', 'pro audio',
  'musical instrument', 'collectibles', 'cosplay',
];

const PADROES_SPAM = [
  /^top \d+ achado/i, /^top \d+ do dia/i, /^top \d+ mais/i,
  /^\d+\s*[°ºª]\s*lugar/i, /^melhor[es]? \d+/i,
];

function temCategoriaBloqueada(p) {
  const cats = [p.categoria1, p.categoria2, p.categoria3]
    .filter(Boolean).map(c => String(c).toLowerCase());
  return CATEGORIAS_BLOQUEADAS.some(b => cats.some(c => c.includes(b)));
}

function temPadraoSpam(nome) {
  return PADROES_SPAM.some(re => re.test(nome));
}

function passaFiltros(p) {
  if (!p.nome || p.nome.length < 10) return { ok: false, motivo: 'nome curto' };
  if (p.avaliacao < MIN_AVALIACAO)    return { ok: false, motivo: `nota ${p.avaliacao} < ${MIN_AVALIACAO}` };
  const lojaOk = p.shopRating >= MIN_SHOP_RATING ||
                 (p.shopRating === 0 && p.avaliacao >= MIN_AVAL_SEM_SHOP);
  if (!lojaOk) return { ok: false, motivo: `shopRating ${p.shopRating} insuficiente` };
  if (p.precoAtual < MIN_PRECO || p.precoAtual > MAX_PRECO) {
    return { ok: false, motivo: `preço R$${p.precoAtual} fora de R$${MIN_PRECO}-${MAX_PRECO}` };
  }
  if (temPadraoSpam(p.nome)) return { ok: false, motivo: 'padrão spam (Top N achados)' };
  if (temCategoriaBloqueada(p)) return { ok: false, motivo: 'categoria bloqueada' };
  return { ok: true };
}

// ─── Execução ────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exemploCaption(produto) {
  const chamada = gerarChamada(produto, 'whatsapp', HOJE);
  const linhaOrig = produto.precoOriginal ? `~De: R$ ${fmtBRL(produto.precoOriginal)}~\n` : '';
  const envio = produto.crossBorder === false ? `🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias\n` : '';
  return `${chamada}\n🎁 ${produto.nome}\n${linhaOrig}💥 POR APENAS: R$ ${fmtBRL(produto.precoAtual)}\n${envio}Oferta relâmpago...\nhttps://shope.ee/...`;
}

const produtos = carregarProdutos();
console.log(`\n📊 Total: ${produtos.length} produtos carregados`);
console.log(`🗓️  Simulando data: ${HOJE.toLocaleDateString('pt-BR')}`);
console.log(`   ${descreverContexto(HOJE)}`);
console.log('');

// Aplica filtros
const aprovados = [];
const rejeitados = {};
for (const p of produtos) {
  const r = passaFiltros(p);
  if (r.ok) aprovados.push(p);
  else rejeitados[r.motivo] = (rejeitados[r.motivo] || 0) + 1;
}

console.log(`✅ ${aprovados.length} aprovados / ❌ ${produtos.length - aprovados.length} rejeitados`);
if (Object.keys(rejeitados).length) {
  console.log('   Motivos:');
  Object.entries(rejeitados)
    .sort((a, b) => b[1] - a[1])
    .forEach(([m, c]) => console.log(`     • ${m}: ${c}`));
}

// Score e ordena
const ranking = aprovados
  .map(p => ({ ...p, _score: pontuarProduto(p, HOJE) }))
  .sort((a, b) => b._score - a._score);

// Contagens nacionais vs internacionais
const nacionais = aprovados.filter(p => !p.crossBorder).length;
const internacionais = aprovados.length - nacionais;
console.log(`🇧🇷 ${nacionais} nacionais · 🌏 ${internacionais} internacionais`);
console.log('');

// Top N
console.log(`🏆 Top ${Math.min(TOP_N, ranking.length)} por score:`);
console.log('═'.repeat(80));
ranking.slice(0, TOP_N).forEach((p, i) => {
  const flag = p.crossBorder === false ? '🇧🇷' : (p.crossBorder ? '🌏' : '❓');
  const desc = p.desconto ? ` (-${p.desconto}%)` : '';
  console.log(`${String(i + 1).padStart(2)}. [${String(p._score).padStart(3)}] ${flag} R$ ${fmtBRL(p.precoAtual)}${desc}`);
  console.log(`     ${p.nome.slice(0, 70)}`);
  console.log(`     📞 ${gerarChamada(p, 'whatsapp', HOJE)}`);
});

// Exemplo de mensagem WhatsApp do top 1
if (ranking[0]) {
  console.log('\n💬 Exemplo de mensagem WhatsApp do TOP 1:');
  console.log('─'.repeat(80));
  console.log(exemploCaption(ranking[0]));
  console.log('─'.repeat(80));
}
