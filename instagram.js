const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// Perfil @byrosanamatias — beleza e estética
const IG_BELEZA_USER_ID     = process.env.INSTAGRAM_BELEZA_USER_ID;
const IG_BELEZA_TOKEN       = process.env.INSTAGRAM_BELEZA_TOKEN;

// Perfil @achadinhosdaroh01 — produtos gerais
const IG_GERAL_USER_ID      = process.env.INSTAGRAM_GERAL_USER_ID;
const IG_GERAL_TOKEN        = process.env.INSTAGRAM_GERAL_TOKEN;

const HASHTAGS_BELEZA =
  '#beleza #skincare #maquiagem #dicasdebeleza #cuidadospessoais ' +
  '#achadinhosdaroh #shopeebrasil #ofertasdodia #cosméticos ' +
  '#pele #cabelo #promoção #belezabarata #autocuidado #dicasdecompras';

const HASHTAGS_GERAL =
  '#achadinhos #shopee #shopeebrasil #ofertasdodia #promoção ' +
  '#desconto #achadinhosdaroh #comprasonline #ofertarelampago ' +
  '#economize #dicasdecompras #achados #comprinhas #modabarata';

async function postarNoInstagram(produto, perfil = 'geral') {
  const userId = perfil === 'beleza' ? IG_BELEZA_USER_ID : IG_GERAL_USER_ID;
  const token  = perfil === 'beleza' ? IG_BELEZA_TOKEN   : IG_GERAL_TOKEN;

  if (!userId || !token) {
    console.log(`  ⚠️  Instagram [${perfil}] não configurado, pulando.`);
    return;
  }

  if (!produto.imagem) {
    console.log(`  ⚠️  Produto sem imagem, pulando Instagram [${perfil}].`);
    return;
  }

  const link    = produto.linkAfiliado || produto.url;
  const caption = perfil === 'beleza'
    ? formatarLegendaBeleza(produto.nome, produto.precoAtual, produto.precoOriginal, link)
    : formatarLegendaGeral(produto.nome, produto.precoAtual, produto.precoOriginal, link);

  try {
    const { data: container } = await axios.post(
      `${BASE_URL}/${userId}/media`,
      null,
      { params: { image_url: produto.imagem, caption, access_token: token } }
    );

    // Aguarda o container ficar pronto antes de publicar
    await aguardarContainerPronto(container.id, token);

    await axios.post(
      `${BASE_URL}/${userId}/media_publish`,
      null,
      { params: { creation_id: container.id, access_token: token } }
    );

    console.log(`  📸 Instagram [${perfil}]: publicado "${produto.nome.slice(0, 50)}..."`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`  ❌ Instagram [${perfil}] erro: ${msg}`);
  }
}

async function aguardarContainerPronto(containerId, token, maxTentativas = 10) {
  for (let i = 0; i < maxTentativas; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const { data } = await axios.get(`${BASE_URL}/${containerId}`, {
        params: { fields: 'status_code', access_token: token },
      });
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(`Container falhou: ${data.status_code}`);
      }
    } catch (err) {
      if (i === maxTentativas - 1) throw err;
    }
  }
  throw new Error('Container não ficou pronto após 30s');
}

// Legenda sutil para @byrosanamatias — combina com o estilo de beleza dela
function formatarLegendaBeleza(nome, precoAtual, precoOriginal, link) {
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';

  return (
    `✨ Achado do dia!\n\n` +
    `${nome}\n\n` +
    `💰 ${linhaOrig}R$ ${preco}\n\n` +
    `👇 Link para comprar:\n${link}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤩 Mais promoções exclusivas no meu grupo VIP do WhatsApp!\n` +
    `Entra lá — link na bio 👆\n` +
    `(Também tem o @achadinhosdaroh01 com achados de tudo!)\n\n` +
    `${HASHTAGS_BELEZA}`
  );
}

// Legenda animada para @achadinhosdaroh01 — estilo promoção
function formatarLegendaGeral(nome, precoAtual, precoOriginal, link) {
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';

  return (
    `🔥 OFERTA IMPERDÍVEL!\n\n` +
    `🎁 ${nome}\n\n` +
    `💥 ${linhaOrig}R$ ${preco}\n\n` +
    `👇 Compre aqui:\n${link}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤩 Quer receber promoções EXCLUSIVAS antes de todo mundo?\n` +
    `Entre no meu grupo VIP do WhatsApp! Link na bio 👆\n` +
    `(Dicas de beleza? Segue a @byrosanamatias 💄)\n\n` +
    `${HASHTAGS_GERAL}`
  );
}

// Seleciona o produto com maior desconto para destaque no Instagram
function selecionarDestaque(produtos) {
  if (!produtos.length) return null;
  return produtos.reduce((melhor, p) => {
    const descMelhor = melhor.precoOriginal
      ? (melhor.precoOriginal - melhor.precoAtual) / melhor.precoOriginal
      : 0;
    const descAtual = p.precoOriginal
      ? (p.precoOriginal - p.precoAtual) / p.precoOriginal
      : 0;
    return descAtual > descMelhor ? p : melhor;
  });
}

function fmtBRL(valor) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = { postarNoInstagram, selecionarDestaque };
