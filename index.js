require('dotenv').config();
const { CronJob } = require('cron');
const { conectarWhatsApp, enviarMensagem } = require('./whatsapp');
const { buscarProdutos, gerarLinkAfiliado } = require('./shopee');
const { formatarMensagem } = require('./mensagem');
const { filtrarNovos, marcarEnviados, resetarHistorico } = require('./historico');

const GRUPO_ID = process.env.WHATSAPP_GROUP_ID;
const QTD_PRODUTOS = 5;
const DELAY_ENTRE_MSGS = 4000; // 4s entre cada mensagem

// 7 disparos diários
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
    console.error('❌ WHATSAPP_GROUP_ID não configurado. Veja os logs após conectar para obter o ID do grupo.');
    return;
  }

  try {
    // 1. Busca produtos
    const produtos = await buscarProdutos(30);
    if (!produtos.length) {
      console.log('⚠️  Nenhum produto retornado pela Shopee. Pulando ciclo.');
      return;
    }

    // 2. Filtra já enviados
    let novos = filtrarNovos(produtos, QTD_PRODUTOS);
    if (!novos.length) {
      console.log('♻️  Histórico esgotado — resetando e reusando produtos.');
      resetarHistorico();
      novos = produtos.slice(0, QTD_PRODUTOS);
    }

    // 3. Gera links de afiliado
    const comLinks = await Promise.all(
      novos.map(async (p) => ({
        ...p,
        linkAfiliado: await gerarLinkAfiliado(p.url),
      }))
    );

    // 4. Envia mensagem por mensagem (com delay)
    for (const produto of comLinks) {
      const mensagem = formatarMensagem(produto);
      await enviarMensagem(GRUPO_ID, mensagem);
      console.log(`  📤 Enviado: ${produto.nome.slice(0, 50)}...`);
      await sleep(DELAY_ENTRE_MSGS);
    }

    // 5. Marca como enviados
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
  console.log('🤖 Shopee Bot v1.0 iniciando...');

  await conectarWhatsApp();

  // Agenda os jobs
  HORARIOS.forEach((cron) => {
    new CronJob(cron, cicloEnvio, null, true, 'America/Sao_Paulo');
  });

  console.log('\n✅ Scheduler ativo. Disparos: 8h · 10h · 12h · 14h · 16h · 18h · 20h (horário SP)');

  // Para testar imediatamente: descomente a linha abaixo
  // await cicloEnvio();
}

main().catch((err) => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
