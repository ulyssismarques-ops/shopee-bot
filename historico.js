const fs   = require('fs');
const path = require('path');

const HISTORICO_PATH = process.env.HISTORICO_PATH || '/data/historico.json';
const MAX_IDS = 300;          // ring buffer de IDs (anti-repetição)
const MAX_POSTADOS = 25;      // últimos N produtos por categoria (landing page)

function ler() {
  try {
    if (fs.existsSync(HISTORICO_PATH)) {
      const obj = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf8'));
      // Compatibilidade: campos novos podem não existir em arquivos antigos
      if (!Array.isArray(obj.enviados))        obj.enviados = [];
      if (!Array.isArray(obj.postadosBeleza))  obj.postadosBeleza = [];
      if (!Array.isArray(obj.postadosGeral))   obj.postadosGeral  = [];
      return obj;
    }
  } catch (err) {
    console.warn('  ⚠️  Histórico corrompido, recriando:', err.message);
  }
  return { enviados: [], postadosBeleza: [], postadosGeral: [] };
}

// Escrita atômica: temp + rename. Evita corromper o arquivo se cair no meio.
function salvar(obj) {
  const dir = path.dirname(HISTORICO_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = HISTORICO_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, HISTORICO_PATH);
}

function filtrarNovos(produtos, qtd) {
  const { enviados } = ler();
  return produtos.filter((p) => !enviados.includes(p.id)).slice(0, qtd);
}

function marcarEnviados(produtos) {
  const hist = ler();
  const novosIds = produtos.map((p) => p.id);
  hist.enviados = [...hist.enviados, ...novosIds];
  if (hist.enviados.length > MAX_IDS) {
    hist.enviados = hist.enviados.slice(-MAX_IDS);
  }
  salvar(hist);
}

function resetarHistorico() {
  const hist = ler();
  hist.enviados = [];
  salvar(hist);
  console.log('♻️  Histórico de IDs resetado (metadados de Instagram preservados).');
}

// Salva o produto postado no Instagram (mantém últimos MAX_POSTADOS por categoria)
// `categoria` deve ser 'beleza' ou 'geral'
function salvarProdutoPostado(produto, categoria) {
  if (categoria !== 'beleza' && categoria !== 'geral') {
    console.warn(`  ⚠️  categoria inválida: ${categoria}`);
    return;
  }
  const hist = ler();
  const chave = categoria === 'beleza' ? 'postadosBeleza' : 'postadosGeral';

  const metadados = {
    id:            produto.id,
    nome:          produto.nome,
    precoAtual:    produto.precoAtual,
    precoOriginal: produto.precoOriginal,
    desconto:      produto.desconto,
    imagem:        produto.imagem,
    linkAfiliado:  produto.linkAfiliado || produto.url,
    crossBorder:   produto.crossBorder === true,  // v3.7 — pra mostrar badge "Envio rápido" na landing
    postadoEm:     new Date().toISOString(),
  };

  // Remove duplicata pelo id (se postar de novo, atualiza no topo)
  hist[chave] = hist[chave].filter(p => p.id !== produto.id);
  hist[chave].unshift(metadados);

  if (hist[chave].length > MAX_POSTADOS) {
    hist[chave] = hist[chave].slice(0, MAX_POSTADOS);
  }

  salvar(hist);
}

function lerProdutosPostados(categoria) {
  const hist = ler();
  if (categoria === 'beleza') return hist.postadosBeleza;
  if (categoria === 'geral')  return hist.postadosGeral;
  return [];
}

// v3.24 — Conta posts feitos nas últimas N horas, por canal.
// Usado pelo health check diário às 23h.
function contarPostsRecentes(horas = 24) {
  const hist = ler();
  const limite = Date.now() - horas * 60 * 60 * 1000;
  const recentes = (arr) => arr.filter(p => {
    const t = new Date(p.postadoEm).getTime();
    return !Number.isNaN(t) && t >= limite;
  }).length;
  return {
    beleza:    recentes(hist.postadosBeleza),
    geral:     recentes(hist.postadosGeral),
    waEnviados: (hist.enviados || []).length,  // ring buffer, não temos timestamps individuais
  };
}

module.exports = {
  filtrarNovos,
  marcarEnviados,
  resetarHistorico,
  salvarProdutoPostado,
  lerProdutosPostados,
  contarPostsRecentes,
};
