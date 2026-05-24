require('dotenv').config();
const { CronJob } = require('cron');
const { conectarWhatsApp, enviarMensagem } = require('./whatsapp');
const { buscarProdutos, gerarLinkAfiliado } = require('./shopee');
const { formatarMensagem } = require('./mensagem');
const { filtrarNovos, marcarEnviados, resetarHistorico } = require('./historico');

const GRUPO_ID       = process.env.WHATSAPP_GROUP_ID;
const TESTAR_AGORA   = process.env.TESTAR_AGORA === 'true';
const QTD_PRODUTOS   = 5;
const DELAY_ENTRE_MSGS = 4000;

const HORARIOS = [
  '0 8 * * *',
  '0 10 * * *',
  '0 12 * * *',
  '0 14 * * *',
  '0 16 * * *',
  '0 18 * * *',
  '0 20 * * *',
];

async function cicloEnvio() {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n[${hora}] ▶ Iniciando ciclo de envio...`);

  if (!GRUPO_ID) {
    console.error('❌ WHATSAPP_GROUP_ID não configurado.');
    return;
  }

  try {
    const produtos = await buscarProdutos(50);
    if (!produtos.length) {
      console.log('⚠️  Nenhum produto disponível. Pulando ciclo.');
      return;
    }

    let novos = filtrarNovos(produtos, QTD_PRODUTOS);
    if (!novos.length) {
      console.log('♻️  Histórico esgotado — resetando.');
      resetarHistorico();
      novos = produtos.slice(0, QTD_PRODUTOS);
    }

    // Resolve cada link feio para a versão curta (shope.ee/XXXX) — habilita preview no WhatsApp
    const comLinks = await Promise.all(novos.map(async (p) => ({
      ...p,
      linkAfiliado: await gerarLinkAfiliado(p.url, p.linkAfiliado),
    })));

    for (const produto of comLinks) {
      const mensagem = formatarMensagem(produto);
      await enviarMensagem(GRUPO_ID, mensagem);
      console.log(`  📤 Enviado: ${produto.nome.slice(0, 50)}...`);
      await sleep(DELAY_ENTRE_MSGS);
    }

    marcarEnviados(comLinks);
    console.log(`✅ Ciclo concluído — ${comLinks.length} produtos enviados.\n`);

  } catch (err) {
    console.error('❌ Erro no ciclo de envio:', err.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('🤖 Shopee Bot v2.0 iniciando (modo feed)...');

  await conectarWhatsApp();

  HORARIOS.forEach((cron) => {
    new CronJob(cron, cicloEnvio, null, true, 'America/Sao_Paulo');
  });

  console.log('\n✅ Scheduler ativo. Disparos: 8h · 10h · 12h · 14h · 16h · 18h · 20h (SP)');

  if (TESTAR_AGORA) {
    console.log('\n🧪 MODO TESTE ATIVO — disparando envio em 10 segundos...');
    console.log('   ⚠️  Lembre de remover TESTAR_AGORA depois do teste!\n');
    setTimeout(() => cicloEnvio(), 10000);
  }
}

main().catch((err) => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
