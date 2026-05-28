require('dotenv').config();
const { CronJob } = require('cron');
const { conectarWhatsApp, enviarMensagem, enviarImagemComLegenda, postarStatus, whatsappConectado, aguardarConexao } = require('./whatsapp');
const { buscarProdutos, gerarLinkAfiliado, ehBeleza, diversificarSelecao } = require('./shopee');
const { formatarMensagem } = require('./mensagem');
const { filtrarNovos, marcarEnviados, resetarHistorico, contarPostsRecentes } = require('./historico');
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

// Health check diário (v3.24 — M1): verifica se posts saíram nas últimas 24h
const HORARIO_HEALTH_CHECK = '0 23 * * *';

async function cicloWhatsApp() {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  console.log(`\n[${hora}] Iniciando disparo WhatsApp...`);

  if (!GRUPO_ID) { console.error('WHATSAPP_GROUP_ID nao configurado.'); return; }

  // v3.26 — checagem explícita de conexão WhatsApp antes de tentar enviar.
  // Se cair, aguarda até 30s pela reconexão automática do Baileys.
  if (!whatsappConectado()) {
    console.error('\n' + '⚠️ '.repeat(20));
    console.error('⚠️  ATENÇÃO: WhatsApp DESCONECTADO no momento do cron!');
    console.error('⚠️  Aguardando até 30s pela reconexão automática...');
    console.error('⚠️ '.repeat(20));
    const reconectou = await aguardarConexao(30000);
    if (!reconectou) {
      console.error('\n' + '❌'.repeat(40));
      console.error('❌  WhatsApp NÃO RECONECTOU em 30s. Disparo PERDIDO.');
      console.error('❌  Causas possíveis:');
      console.error('❌   1. Sessão deslogada (alguém saiu de "Aparelhos conectados")');
      console.error('❌   2. Conexão instável');
      console.error('❌   3. WhatsApp do número da Rosana foi bloqueado/banido');
      console.error('❌  Ação: Railway → Deployments → View Logs → buscar "Sessão encerrada"');
      console.error('❌  Se logout: deletar /data/baileys_auth e rescanear QR');
      console.error('❌'.repeat(40) + '\n');
      return;
    }
    console.log('✅  WhatsApp reconectou a tempo!');
  }

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

    // Posta destaque no WhatsApp Status (v3.15, ajustado em v3.24)
    // SÓ posta às 20h pra não saturar os contatos com 2 status/dia (M3 feedback)
    const horaAgora = new Date().toLocaleString('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false });
    const horaInt = parseInt(horaAgora.split(' ')[0] || horaAgora, 10);
    const destaque = comLinks[0];
    if (horaInt === 20 && destaque && destaque.imagem) {
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
        console.error(`❌ Status WA nao postado: ${err.message}`);
      }
    } else if (horaInt !== 20) {
      console.log(`   (Status WA pulado — só posta às 20h, hora atual: ${horaInt}h)`);
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
    // v3.20: passa top3 já preparado (com links resolvidos) — não re-selecionar
    const destaque = top3[0];
    if (top3.length >= 2) {
      await postarCarrossel(top3, perfil);
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

/**
 * Health check diário (v3.24 — M1).
 * Roda às 23h e verifica se os canais postaram nas últimas 24h.
 *
 * Esperado:
 *  - Instagram geral: 5 posts (8h, 11h, 14h, 17h, 20h)
 *  - Instagram beleza: 1 post (20h)
 *  - Reels: 2 posts (1 geral + 1 beleza às 10h)
 *  - WhatsApp: tem ring buffer de 300 IDs, não tem timestamp individual
 *
 * Loga relatório DESTACADO. Se algum canal não postou nada, marca ❌.
 */
async function healthCheck() {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  const c = contarPostsRecentes(24);

  // Expectativas mínimas (Reels conta junto com IG no historico — não temos como separar)
  const okGeral  = c.geral  >= 4;   // 5 esperados, mas 1 a menos por sobrescrita Reel = 4 ok
  const okBeleza = c.beleza >= 1;

  const status = (ok) => ok ? '✅' : '❌ FALHOU';
  const linhas = [
    '═'.repeat(60),
    `🏥 HEALTH CHECK — ${hora}`,
    '═'.repeat(60),
    `${status(okGeral)}  IG @achadinhosdaroh01 (geral): ${c.geral} posts em 24h (esperado: ≥4)`,
    `${status(okBeleza)}  IG @byrosanamatias (beleza):   ${c.beleza} posts em 24h (esperado: ≥1)`,
    `📊  WhatsApp histórico: ${c.waEnviados} IDs no ring buffer (sem timestamp)`,
    '═'.repeat(60),
  ];

  if (okGeral && okBeleza) {
    linhas.push('🟢 TUDO OK — bot rodando saudável');
  } else {
    linhas.push('🔴 ALGO FALHOU — investigar logs do dia');
  }
  linhas.push('═'.repeat(60));
  console.log('\n' + linhas.join('\n') + '\n');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('Shopee Bot v3.24 iniciando (bloqueio erótico + Status WA 1x + health check)...');
  iniciarServidor();
  await conectarWhatsApp();

  HORARIOS_WHATSAPP.forEach((cron) => new CronJob(cron, cicloWhatsApp, null, true, TZ));
  HORARIOS_IG_BELEZA.forEach((cron) => new CronJob(cron, () => cicloInstagram('beleza'), null, true, TZ));
  HORARIOS_IG_GERAL.forEach((cron) => new CronJob(cron, () => cicloInstagram('geral'), null, true, TZ));

  HORARIOS_REELS_BELEZA.forEach((cron) => new CronJob(cron, () => cicloReels('beleza'), null, true, TZ));
  HORARIOS_REELS_GERAL.forEach((cron) => new CronJob(cron, () => cicloReels('geral'), null, true, TZ));

  new CronJob(HORARIO_HEALTH_CHECK, healthCheck, null, true, TZ);

  console.log('\nScheduler ativo:');
  console.log('   WhatsApp:         12h, 20h (5 produtos cada)');
  console.log('   Status WA:        20h (1x/dia, antes era 2x — feedback M3)');
  console.log('   IG beleza:        20h');
  console.log('   IG geral:         8h, 11h, 14h, 17h, 20h');
  console.log('   Reels (beleza+geral): 10h (ffmpeg 9:16 com audio)');
  console.log('   Health check:     23h (relatório diário no log)');

  if (TESTAR_AGORA) {
    console.log('\n🧪 MODO TESTE ATIVO — disparando TODOS os canais em 10s...');
    console.log('   ⚠️  IMPORTANTE: remova TESTAR_AGORA do Railway depois do teste!');
    setTimeout(async () => {
      await cicloWhatsApp();
      await cicloInstagram('geral');
      await cicloInstagram('beleza');
      // v3.20: TESTAR_AGORA agora cobre Reels também
      await cicloReels('geral');
      await cicloReels('beleza');
    }, 10000);
  }
}

main().catch((err) => { console.error('Erro fatal:', err); process.exit(1); });
