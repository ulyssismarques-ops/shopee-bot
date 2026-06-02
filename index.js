require('dotenv').config();
const { CronJob } = require('cron');
const { conectarWhatsApp, enviarMensagem, enviarImagemComLegenda, postarStatus, whatsappConectado, aguardarConexao } = require('./whatsapp');
const { buscarProdutos, buscarProdutosBeleza, buscarProdutosGerais, gerarLinkAfiliado, diversificarSelecao } = require('./shopee');
const { formatarMensagem } = require('./mensagem');
const { filtrarNovos, marcarEnviados, resetarHistorico, contarPostsRecentes } = require('./historico');
const { postarNoInstagram, postarCarrossel, postarStory, postarReel, selecionarDestaque, selecionarTopN, validarTokensInstagram } = require('./instagram');
const { iniciarServidor } = require('./landingpage');

const GRUPO_ID         = process.env.WHATSAPP_GROUP_ID;
const TESTAR_AGORA     = process.env.TESTAR_AGORA === 'true';
const QTD_PRODUTOS     = 5;
const DELAY_ENTRE_MSGS = 4000;
const TZ               = 'America/Sao_Paulo';

// v3.29 — frequência reduzida pra 1x/dia em todos os canais (pico das 20h)
// Antes: WhatsApp 2x + IG geral 5x = 11 disparos diários (parecia spam)
// Agora: 3 canais juntos às 20h = 3 disparos no dia, todos no pico de engajamento
const HORARIOS_WHATSAPP = ['0 20 * * *'];
const HORARIOS_IG_BELEZA = ['0 20 * * *'];
const HORARIOS_IG_GERAL  = ['0 20 * * *'];

// Reels: 1x/dia por perfil, horario diferente do feed pra diversificar o dia
const HORARIOS_REELS_BELEZA = ['0 10 * * *'];
const HORARIOS_REELS_GERAL  = ['30 10 * * *']; // 10h30 — escalonado apos beleza

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

    // v3.27 — retry mid-ciclo. Se conexão cair durante os envios (vimos
    // código 408 às 20:00:41 ontem), espera até 30s pra reconectar antes
    // de tentar o próximo envio. Assim sobrevive a drops de até 30s no meio.
    let enviados = 0;
    let pulados = 0;
    const idsEnviados = [];
    for (const produto of comLinks) {
      const mensagem = formatarMensagem(produto);
      // Se a conexão caiu desde o envio anterior, espera reconectar
      if (!whatsappConectado()) {
        console.warn(`  🔄  WhatsApp caiu mid-ciclo — aguardando reconexão antes de "${produto.nome.slice(0,40)}"...`);
        const reconectou = await aguardarConexao(30000);
        if (!reconectou) {
          console.error(`  ❌  WhatsApp não reconectou em 30s — pulando "${produto.nome.slice(0,40)}"`);
          pulados++;
          continue;
        }
        console.log(`  ✅  Reconectou! Continuando...`);
      }
      try {
        if (produto.imagem) {
          await enviarImagemComLegenda(GRUPO_ID, produto.imagem, mensagem);
        } else {
          await enviarMensagem(GRUPO_ID, mensagem);
        }
        console.log(`  Enviado: ${produto.nome.slice(0, 50)}...`);
        enviados++;
        idsEnviados.push(produto.id);
      } catch (sendErr) {
        // Erro no send pode ser drop momentâneo. Tenta reconectar e refazer 1x.
        console.warn(`  ⚠️  Falha no envio: ${sendErr.message}. Tentando reconectar...`);
        const reconectou = await aguardarConexao(30000);
        if (reconectou) {
          try {
            if (produto.imagem) {
              await enviarImagemComLegenda(GRUPO_ID, produto.imagem, mensagem);
            } else {
              await enviarMensagem(GRUPO_ID, mensagem);
            }
            console.log(`  ✅  Reenviado após reconexão: ${produto.nome.slice(0, 50)}...`);
            enviados++;
            idsEnviados.push(produto.id);
          } catch (retryErr) {
            console.error(`  ❌  Pulando após 2 falhas: ${retryErr.message}`);
            pulados++;
          }
        } else {
          console.error(`  ❌  Sem reconexão — pulando "${produto.nome.slice(0,40)}"`);
          pulados++;
        }
      }
      await sleep(DELAY_ENTRE_MSGS);
    }
    if (pulados > 0) {
      console.warn(`  ⚠️  ${pulados} de ${comLinks.length} produtos pulados por instabilidade WhatsApp`);
    }

    // v3.31 — usa idsEnviados pra marcar exatamente os que saíram (fix: slice era bugado com skips mid-lista)
    if (idsEnviados.length > 0) marcarEnviados(comLinks.filter(p => idsEnviados.includes(p.id)));
    console.log(`WhatsApp concluido: ${enviados}/${comLinks.length} produtos enviados.\n`);

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
    // v3.38: usa buscarProdutosBeleza/Gerais (fix: top50 geral em Copa nao tem beleza)
    const filtrado = perfil === 'beleza'
      ? await buscarProdutosBeleza(50)
      : await buscarProdutosGerais(50);
    if (!filtrado.length) { console.log(`Nenhum produto para ${perfil}.`); return; }

    // Resolve links dos top 3 antes de postar (v3.17 — carrossel)
    const top3 = selecionarTopN(filtrado, 3);
    if (!top3.length) { console.log(`Sem produtos para ${perfil}.`); return; }
    for (const p of top3) {
      p.linkAfiliado = await gerarLinkAfiliado(p.url, p.linkAfiliado);
    }

    // Posta carrossel com os 3 melhores (se houver 2+), senao post simples
    // v3.20: passa top3 já preparado (com links resolvidos) — não re-selecionar
    const destaque = top3[0];
    let postOk = false;
    if (top3.length >= 2) {
      const result = await postarCarrossel(top3, perfil);
      postOk = result !== null;
    } else {
      await postarNoInstagram(destaque, perfil);
      postOk = true;
    }

    // Story só posta se o feed/carrossel foi bem-sucedido — v3.33
    if (postOk) {
      await postarStory(destaque, perfil);
    } else {
      console.log(`  Story [${perfil}] pulado — carrossel falhou.`);
    }

    console.log(`Instagram [${perfil}] concluido.\n`);
  } catch (err) {
    console.error(`Erro no ciclo Instagram [${perfil}]:`, err.message);
  }
}

async function cicloReels(perfil) {
  const hora = new Date().toLocaleString('pt-BR', { timeZone: TZ });
  console.log(`\n[${hora}] Iniciando Reel Instagram [${perfil}]...`);
  try {
    // v3.38: usa buscarProdutosBeleza/Gerais (mesmo fix do cicloInstagram)
    const filtrado = perfil === 'beleza'
      ? await buscarProdutosBeleza(50)
      : await buscarProdutosGerais(50);
    if (!filtrado.length) { console.log(`Nenhum produto para Reel [${perfil}].`); return; }
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
  const okGeral  = c.geral  >= 1;   // v3.29 reduziu pra 1x/dia — espera >= 1 post
  const okBeleza = c.beleza >= 1;

  const status = (ok) => ok ? '✅' : '❌ FALHOU';
  const linhas = [
    '═'.repeat(60),
    `🏥 HEALTH CHECK — ${hora}`,
    '═'.repeat(60),
    `${status(okGeral)}  IG @achadinhosdaroh01 (geral): ${c.geral} posts em 24h (esperado: >=1)`,
    `${status(okBeleza)}  IG @byrosanamatias (beleza):   ${c.beleza} posts em 24h (esperado: >=1)`,
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
  console.log('Shopee Bot v3.39 iniciando (validação de token Instagram + cache parse + admin/disparo)...');
  // v3.34 — passa ciclos pra rota /admin/disparo poder dispará-los manualmente
  iniciarServidor({ cicloWhatsApp, cicloInstagram, cicloReels });
  await conectarWhatsApp();

  // v3.39 — valida tokens Instagram no boot pra detectar expiração cedo
  // (caso de 31/05/2026: tokens expiraram e ninguém viu até disparo das 20h)
  console.log('\n🔑 Validando tokens Instagram...');
  await validarTokensInstagram();

  HORARIOS_WHATSAPP.forEach((cron) => new CronJob(cron, cicloWhatsApp, null, true, TZ));
  HORARIOS_IG_BELEZA.forEach((cron) => new CronJob(cron, () => cicloInstagram('beleza'), null, true, TZ));
  HORARIOS_IG_GERAL.forEach((cron) => new CronJob(cron, () => cicloInstagram('geral'), null, true, TZ));

  HORARIOS_REELS_BELEZA.forEach((cron) => new CronJob(cron, () => cicloReels('beleza'), null, true, TZ));
  HORARIOS_REELS_GERAL.forEach((cron) => new CronJob(cron, () => cicloReels('geral'), null, true, TZ));

  new CronJob(HORARIO_HEALTH_CHECK, healthCheck, null, true, TZ);

  console.log('\nScheduler ativo (v3.29 — frequência reduzida):');
  console.log('   WhatsApp:         20h (1x/dia, 5 produtos) — era 12h+20h');
  console.log('   Status WA:        20h (1x/dia)');
  console.log('   IG beleza:        20h (1x/dia)');
  console.log('   IG geral:         20h (1x/dia) — era 5x/dia, reduzido pra evitar feed cheio');
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
