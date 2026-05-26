require('dotenv').config();
const { CronJob } = require('cron');
const { conectarWhatsApp, enviarMensagem, enviarImagemComLegenda } = require('./whatsapp');
const { buscarProdutos, gerarLinkAfiliado, ehBeleza } = require('./shopee');
const { formatarMensagem } = require('./mensagem');
const { filtrarNovos, marcarEnviados, resetarHistorico } = require('./historico');
const { postarNoInstagram, selecionarDestaque } = require('./instagram');
const { iniciarServidor } = require('./landingpage');

const GRUPO_ID         = process.env.WHATSAPP_GROUP_ID;
const TESTAR_AGORA     = process.env.TESTAR_AGORA === 'true';
const QTD_PRODUTOS     = 5;
const DELAY_ENTRE_MSGS = 4000;
const TZ               = 'America/Sao_Paulo';

// ─── Horários separados por canal ────────────────────────────────────────────
// WhatsApp: 2x/dia (almoço + noite)
const HORARIOS_WHATSAPP = [
  '0 12 * * *',  // almoço
  '0 20 * * *',  // noite
];

// Instagram @byrosanamatias (beleza): 1x/dia no horário de pico
const HORARIOS_IG_BELEZA = [
  '0 20 * * *',  // pico de engajamento em beleza
];

// Instagram @achadinhosdaroh01 (geral): mantém 5x/dia
const HORARIOS_IG_GERAL = [
  '0 8 * * *',
  '0 11 * * *',
  '0 14 * * *',
  '0 17 * * *',
  '0 20 * * *',
];

// ─── Ciclo do WhatsApp ────────────────────────────────────────────────────────
async function cicloWhatsApp() {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  console.log(`\n[${hora}] 💬 Iniciando disparo WhatsApp...`);

  if (!GRUPO_ID) {
    console.error('❌ WHATSAPP_GROUP_ID não configurado.');
    return;
  }

  try {
    const produtos = await buscarProdutos(50);
    if (!produtos.length) {
      console.log('⚠️  Nenhum produto disponível. Pulando disparo WhatsApp.');
      return;
    }

    let novos = filtrarNovos(produtos, QTD_PRODUTOS);
    if (!novos.length) {
      console.log('♻️  Histórico esgotado — resetando.');
      resetarHistorico();
      novos = produtos.slice(0, QTD_PRODUTOS);
    }

    // Resolve cada link feio para a versão curta (shope.ee/XXXX)
    const comLinks = await Promise.all(novos.map(async (p) => ({
      ...p,
      linkAfiliado: await gerarLinkAfiliado(p.url, p.linkAfiliado),
    })));

    for (const produto of comLinks) {
      const mensagem = formatarMensagem(produto);
      if (produto.imagem) {
        await enviarImagemComLegenda(GRUPO_ID, produto.imagem, mensagem);
      } else {
        await enviarMensagem(GRUPO_ID, mensagem);
      }
      console.log(`  📤 Enviado: ${produto.nome.slice(0, 50)}...`);
      await sleep(DELAY_ENTRE_MSGS);
    }

    marcarEnviados(comLinks);
    console.log(`✅ WhatsApp concluído — ${comLinks.length} produtos enviados.\n`);
  } catch (err) {
    console.error('❌ Erro no ciclo WhatsApp:', err.message);
  }
}

// ─── Ciclo do Instagram (por perfil) ─────────────────────────────────────────
async function cicloInstagram(perfil) {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  const icone = perfil === 'beleza' ? '💄' : '🛍️';
  console.log(`\n[${hora}] ${icone} Iniciando disparo Instagram [${perfil}]...`);

  try {
    const produtos = await buscarProdutos(50);
    if (!produtos.length) {
      console.log(`⚠️  Nenhum produto disponível. Pulando Instagram [${perfil}].`);
      return;
    }

    const filtrado = perfil === 'beleza'
      ? produtos.filter(ehBeleza)
      : produtos.filter(p => !ehBeleza(p));

    console.log(`   ${icone} ${filtrado.length} produtos da categoria ${perfil}`);

    const destaque = selecionarDestaque(filtrado);
    if (!destaque) {
      console.log(`⚠️  Sem destaque pra ${perfil} (categoria vazia).`);
      return;
    }

    // Garante link curto também no Instagram (vai salvo no historico → landing)
    destaque.linkAfiliado = await gerarLinkAfiliado(destaque.url, destaque.linkAfiliado);

    await postarNoInstagram(destaque, perfil);
    console.log(`✅ Instagram [${perfil}] concluído.\n`);
  } catch (err) {
    console.error(`❌ Erro no ciclo Instagram [${perfil}]:`, err.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('🤖 Shopee Bot v3.2 iniciando (horários por canal)...');

  // Sobe primeiro o servidor HTTP — Railway precisa responder rápido pro healthcheck
  iniciarServidor();

  await conectarWhatsApp();

  HORARIOS_WHATSAPP.forEach((cron) => {
    new CronJob(cron, cicloWhatsApp, null, true, TZ);
  });

  HORARIOS_IG_BELEZA.forEach((cron) => {
    new CronJob(cron, () => cicloInstagram('beleza'), null, true, TZ);
  });

  HORARIOS_IG_GERAL.forEach((cron) => {
    new CronJob(cron, () => cicloInstagram('geral'), null, true, TZ);
  });

  console.log('\n✅ Scheduler ativo:');
  console.log('   💬 WhatsApp:        12h · 20h (2x/dia, 5 produtos cada)');
  console.log('   💄 IG beleza:       20h (1x/dia, 1 destaque)');
  console.log('   🛍️  IG geral:        8h · 11h · 14h · 17h · 20h (5x/dia, 1 destaque cada)');

  if (TESTAR_AGORA) {
    console.log('\n🧪 MODO TESTE ATIVO — disparando todos os canais em 10s...');
    console.log('   ⚠️  Lembre de remover TESTAR_AGORA depois do teste!\n');
    setTimeout(async () => {
      await cicloWhatsApp();
      await cicloInstagram('geral');
      await cicloInstagram('beleza');
    }, 10000);
  }
}

main().catch((err) => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
