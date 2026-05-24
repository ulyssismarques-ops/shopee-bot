const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');

const AUTH_PATH = process.env.AUTH_PATH || '/data/baileys_auth';

let sock = null;
let isConnected = false;
let initialResolve = null;

async function conectarWhatsApp() {
  return new Promise((resolve) => {
    initialResolve = resolve;
    iniciarSocket();
  });
}

async function iniciarSocket() {
  if (!fs.existsSync(AUTH_PATH)) {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
  } catch {
    version = [2, 3000, 1017531287];
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['ShopeeBot', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60_000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // 1) URL pra renderizar QR como IMAGEM grande no navegador
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=20&data=${encodeURIComponent(qr)}`;

      console.log('\n' + '█'.repeat(70));
      console.log('📱  ESCANEIE O QR CODE — DUAS OPÇÕES:');
      console.log('█'.repeat(70));
      console.log('\n✨ OPÇÃO 1 (recomendada): abra esta URL no navegador');
      console.log('   ' + qrUrl);
      console.log('\n   → vai aparecer um QR grande');
      console.log('   → escaneie com o WhatsApp da Rosana');
      console.log('     (WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho)');
      console.log('\n' + '─'.repeat(70));
      console.log('✨ OPÇÃO 2: tente escanear direto desta tela (abaixo):');
      console.log('─'.repeat(70) + '\n');

      // 2) QR ASCII pequeno (caso a opção 1 não funcione por algum motivo)
      qrcode.generate(qr, { small: true });

      console.log('\n' + '█'.repeat(70) + '\n');
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('✅  WhatsApp conectado!\n');

      setTimeout(async () => {
        await listarGrupos();
        if (initialResolve) {
          initialResolve(sock);
          initialResolve = null;
        }
      }, 3000);
    }

    if (connection === 'close') {
      isConnected = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (code === DisconnectReason.loggedOut) {
        console.error('\n❌  Sessão encerrada (logout). Delete /data/baileys_auth no Railway e reinicie.\n');
        process.exit(1);
      }

      console.log(`🔄  Conexão perdida (código ${code}) — reconectando em 8s...`);
      setTimeout(() => iniciarSocket(), 8000);
    }
  });
}

async function enviarMensagem(grupoId, texto) {
  if (!sock || !isConnected) {
    throw new Error('WhatsApp não está conectado');
  }
  await sock.sendMessage(grupoId, { text: texto });
}

/**
 * Envia uma imagem (baixada da URL) com legenda.
 * Se a imagem falhar, faz fallback para mensagem só de texto.
 */
async function enviarImagemComLegenda(grupoId, imageUrl, legenda) {
  if (!sock || !isConnected) {
    throw new Error('WhatsApp não está conectado');
  }

  try {
    // Baixa a imagem como buffer
    const axios = require('axios');
    const resp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Referer': 'https://shopee.com.br/',
      },
      maxContentLength: 10 * 1024 * 1024, // 10MB
    });

    const buffer = Buffer.from(resp.data);
    await sock.sendMessage(grupoId, {
      image: buffer,
      caption: legenda,
    });
    return true;
  } catch (err) {
    console.warn(`  ⚠️  Falha ao enviar imagem (${err.message}) — enviando só texto`);
    await sock.sendMessage(grupoId, { text: legenda });
    return false;
  }
}

async function listarGrupos() {
  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista = Object.entries(grupos);

    console.log('\n' + '═'.repeat(60));
    console.log('📋  GRUPOS QUE O BOT PARTICIPA:');
    console.log('═'.repeat(60));
    lista.forEach(([id, g]) => {
      console.log(`  • ${g.subject}`);
      console.log(`    ID: ${id}`);
    });
    console.log('═'.repeat(60));
    console.log('\n👆  Copie o ID do grupo "GRUPO EXCLUSIVO - Achadinhos da Roh #1"');
    console.log('    e adicione como WHATSAPP_GROUP_ID nas variáveis do Railway.');
    console.log('    Formato: 1203630XXXXXXXXX@g.us\n');
  } catch (err) {
    console.error('Erro ao listar grupos:', err.message);
  }
}

module.exports = { conectarWhatsApp, enviarMensagem, enviarImagemComLegenda, listarGrupos };
