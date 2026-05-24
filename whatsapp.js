const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');

const AUTH_PATH = process.env.AUTH_PATH || '/data/baileys_auth';

let sock = null;
let isConnected = false;

async function conectarWhatsApp() {
  return new Promise(async (resolve) => {
    // Garante diretório de sessão
    if (!fs.existsSync(AUTH_PATH)) {
      fs.mkdirSync(AUTH_PATH, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    let version;
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
    } catch {
      version = [2, 3000, 1017531287]; // fallback conhecido
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,       // QR aparece nos logs do Railway
      logger: pino({ level: 'silent' }),
      browser: ['ShopeeBot', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n' + '═'.repeat(55));
        console.log('📱  ESCANEIE O QR CODE COM O WHATSAPP DA ROSANA');
        console.log('    (o QR acima — use o WhatsApp do celular dela)');
        console.log('═'.repeat(55) + '\n');
      }

      if (connection === 'open') {
        isConnected = true;
        console.log('✅  WhatsApp conectado!\n');

        // Lista grupos nos logs para pegar o ID
        setTimeout(async () => {
          await listarGrupos();
          resolve(sock);
        }, 3000);
      }

      if (connection === 'close') {
        isConnected = false;
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          console.error('\n❌  Sessão encerrada (logout). Delete a pasta /data/baileys_auth e reinicie o serviço.\n');
          process.exit(1);
        }

        console.log(`🔄  Conexão perdida (código ${code}) — reconectando em 8s...`);
        setTimeout(() => reconectar(), 8000);
      }
    });
  });
}

// Reconecta sem sobrescrever a Promise inicial (só atualiza sock e isConnected)
async function reconectar() {
  try {
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
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }),
      browser: ['ShopeeBot', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        isConnected = true;
        console.log('✅  WhatsApp reconectado!');
      }

      if (connection === 'close') {
        isConnected = false;
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          console.error('❌  Logout detectado. Reinicie o serviço e escaneie o QR novamente.');
          process.exit(1);
        }

        console.log(`🔄  Reconectando novamente em 8s... (código ${code})`);
        setTimeout(() => reconectar(), 8000);
      }
    });
  } catch (err) {
    console.error('Erro ao reconectar:', err.message);
    setTimeout(() => reconectar(), 15000);
  }
}

async function enviarMensagem(grupoId, texto) {
  if (!sock || !isConnected) {
    throw new Error('WhatsApp não está conectado');
  }
  await sock.sendMessage(grupoId, { text: texto });
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
    console.log('    Formato esperado: 1203630XXXXXXXXX@g.us\n');
  } catch (err) {
    console.error('Erro ao listar grupos:', err.message);
  }
}

module.exports = { conectarWhatsApp, enviarMensagem, listarGrupos };
