require('dotenv').config();
const { CronJob } = require('cron');
const { conectarWhatsApp, enviarMensagem, enviarImagemComLegenda, postarStatus } = require('./whatsapp');
const { buscarProdutos, gerarLinkAfiliado, ehBeleza, diversificarSelecao } = require('./shopee');
const { formatarMensagem } = require('./mensagem');
const { filtrarNovos, marcarEnviados, resetarHistorico } = require('./historico');
const { postarNoInstagram, postarCarrossel, postarStory, postarReel, selecionarDestaque, selecionarTopN } = require('./instagram');
const { iniciarServidor } = require('./landingpage');

const GRUPO_ID         = process.env.WHATSAPP_GROUP_ID;
const TESTAR_AGORA     = process.env.TESTAR_AGORA === 'true';
const QTD_PRODUTOS     = 5;
const DELAY_ENTRE_MSGS = 4000;
const TZ               = 'America/Sao_Paulo';

const HORARIOS_WHATSAPP = ['0 12 * * *', '0 20 * * *'];
const HORARIOS_IG_BELEZA = ['0 20 * * *'];
const HORARIOS_IG_GERAL = ['0 8 * * *', '0 11 * * *', '0 14 * * *', '0 17 * * *', '0 20 * * *'];

// Reels: 1x/dia por perfil, horario diferente do feed pra diversificar o dia
const HORARIOS_REELS_BELEZA = ['0 10 * * *'];
const HORARIOS_REELS_GERAL  = ['0 10 * * *'];

async function cicloWhatsApp() {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  console.log(`\n[${hora}] Iniciando disparo WhatsApp...`);

  if (!GRUPO_ID) { console.error('WHATSAPP_GROUP_ID nao configurado.'); return; }

  try {
    const produtos = await buscarProdutos(50);
    if (!produtos.length) { console.log('Nenhum produto disponivel.'); return; }

    let pool = filtrarNovos(produtos, 100);
    if (!pool.length) { resetarHistorico(); pool = produtos; }
    const novos = diversificarSelecao(pool, QTD_PRODUTOS);

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
      console.log(`  Enviado: ${produto.nome.slice(0, 50)}...`);
      await sleep(DELAY_ENTRE_MSGS);
    }

    marcarEnviados(comLinks);
    console.log(`WhatsApp concluido: ${comLinks.length} produtos enviados.\n`);

    // Posta destaque no WhatsApp Status (v3.15)
    const destaque = comLinks[0];
    if (destaque && destaque.imagem) {
      try {
        const axios = require('axios');
        const resp = await axios.get(destaque.imagem, {
          responseType: 'arraybuffer', timeout: 10000,
          headers: { 'Referer': 'https://shopee.com.br/' },
        });
        const buffer = Buffer.from(resp.data);
        const preco = destaque.precoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const desc = destaque.desconto ? ` (-${destaque.desconto}%)` : '';
        const textoStatus = `ACHADO DO DIA\n\n${destaque.nome}\n\nR$ ${preco}${desc}\n\nEntre no grupo:\n${process.env.WHATSAPP_GROUP_INVITE_URL || ''}`;
        await postarStatus(buffer, textoStatus);
      } catch (err) {
        console.warn(`  Status WA nao postado: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('Erro no ciclo WhatsApp:', err.message);
  }
}

async function cicloInstagram(perfil) {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  console.log(`\n[${hora}] Iniciando disparo Instagram [${perfil}]...`);
  try {
    const produtos = await buscarProdutos(50);
    if (!produtos.length) { console.log(`Nenhum produto para ${perfil}.`); return; }

    const filtrado = perfil === 'beleza'
      ? produtos.filter(ehBeleza)
      : produtos.filter(p => !ehBeleza(p));

    // Resolve links dos top 3 antes de postar (v3.17 — carrossel)
    const top3 = selecionarTopN(filtrado, 3);
    if (!top3.length) { console.log(`Sem produtos para ${perfil}.`); return; }
    for (const p of top3) {
      p.linkAfiliado = await gerarLinkAfiliado(p.url, p.linkAfiliado);
    }

    // Posta carrossel com os 3 melhores (se houver 2+), senao post simples
    const destaque = top3[0];
    if (top3.length >= 2) {
      await postarCarrossel(filtrado, perfil);
    } else {
      await postarNoInstagram(destaque, perfil);
    }

    // Story com o produto destaque (v3.16)
    await postarStory(destaque, perfil);

    console.log(`Instagram [${perfil}] concluido.\n`);
  } catch (err) {
    console.error(`Erro no ciclo Instagram [${perfil}]:`, err.message);
  }
}

async function cicloReels(perfil) {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  console.log(`\n[${hora}] Iniciando Reel Instagram [${perfil}]...`);
  try {
    const produtos = await buscarProdutos(50);
    if (!produtos.length) { console.log('Nenhum produto para Reel.'); return; }
    const filtrado = perfil === 'beleza' ? produtos.filter(ehBeleza) : produtos.filter(p => !ehBeleza(p));
    const destaque = selecionarDestaque(filtrado);
    if (!destaque) { console.log(`Sem destaque para Reel [${perfil}].`); return; }
    destaque.linkAfiliado = await gerarLinkAfiliado(destaque.url, destaque.linkAfiliado);
    await postarReel(destaque, perfil);
    console.log(`Reel [${perfil}] concluido.\n`);
  } catch (err) {
    console.error(`Erro no ciclo Reel [${perfil}]:`, err.message);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('Shopee Bot v3.15 iniciando...');
  iniciarServidor();
  await conectarWhatsApp();

  HORARIOS_WHATSAPP.forEach((cron) => new CronJob(cron, cicloWhatsApp, null, true, TZ));
  HORARIOS_IG_BELEZA.forEach((cron) => new CronJob(cron, () => cicloInstagram('beleza'), null, true, TZ));
  HORARIOS_IG_GERAL.forEach((cron) => new CronJob(cron, () => cicloInstagram('geral'), null, true, TZ));

  HORARIOS_REELS_BELEZA.forEach((cron) => new CronJob(cron, () => cicloReels('beleza'), null, true, TZ));
  HORARIOS_REELS_GERAL.forEach((cron) => new CronJob(cron, () => cicloReels('geral'), null, true, TZ));

  console.log('\nScheduler ativo:');
  console.log('   WhatsApp + Status WA: 12h e 20h');
  console.log('   IG beleza: 20h');
  console.log('   IG geral:  8h 11h 14h 17h 20h');
  console.log('   Reels:     10h (1x/dia por perfil, ffmpeg zoom suave 7s)');

  if (TESTAR_AGORA) {
    console.log('\nMODO TESTE — disparando em 10s...');
    setTimeout(async () => {
      await cicloWhatsApp();
      await cicloInstagram('geral');
      await cicloInstagram('beleza');
    }, 10000);
  }
}

main().catch((err) => { console.error('Erro fatal:', err); process.exit(1); });
