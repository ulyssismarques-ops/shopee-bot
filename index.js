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

// v3.29 — frequência reduzida pra 1x/dia em todos os canais (pico das 20h)
// Antes: WhatsApp 2x + IG geral 5x = 11 disparos diários (parecia spam)
// Agora: 3 canais juntos às 20h = 3 disparos no dia, todos no pico de engajamento
const HORARIOS_WHATSAPP = ['0 20 * * *'];
const HORARIOS_IG_BELEZA = ['0 20 * * *'];
const HORARIOS_IG_GERAL  = ['0 20 * * *'];

// Reels: 1x/dia por perfil, horario diferente do feed pra diversificar o dia
const HORARIOS_REELS_BELEZA = ['0 10 * * *'];
const HORARIOS_REELS_GERAL  = ['30 10 * * *']; // 10h30 — escalonado apos beleza (10h)

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

    // v3.27 — marca como enviados só os que de fato saíram (não os pulados)
    const enviadosOk = comLinks.slice(0, enviados);
    if (enviadosOk.length > 0) marcarEnviados(enviadosOk);
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
          responseType: 'arraybuf