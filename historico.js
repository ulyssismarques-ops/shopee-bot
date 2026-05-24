const fs   = require('fs');
const path = require('path');

const HISTORICO_PATH = process.env.HISTORICO_PATH || '/data/historico.json';
const MAX_IDS = 300; // mantém os últimos 300 IDs

function ler() {
  try {
    if (fs.existsSync(HISTORICO_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf8'));
    }
  } catch {}
  return { enviados: [] };
}

function salvar(obj) {
  const dir = path.dirname(HISTORICO_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORICO_PATH, JSON.stringify(obj, null, 2));
}

/** Retorna os primeiros `qtd` produtos que ainda não foram enviados */
function filtrarNovos(produtos, qtd) {
  const { enviados } = ler();
  return produtos.filter((p) => !enviados.includes(p.id)).slice(0, qtd);
}

/** Marca os produtos como enviados no histórico */
function marcarEnviados(produtos) {
  const hist = ler();
  const novosIds = produtos.map((p) => p.id);
  hist.enviados = [...hist.enviados, ...novosIds];

  // Gira o buffer para não crescer indefinidamente
  if (hist.enviados.length > MAX_IDS) {
    hist.enviados = hist.enviados.slice(-MAX_IDS);
  }

  salvar(hist);
}

/** Zera o histórico (chamado quando não há produtos novos) */
function resetarHistorico() {
  salvar({ enviados: [] });
  console.log('♻️  Histórico resetado.');
}

module.exports = { filtrarNovos, marcarEnviados, resetarHistorico };
