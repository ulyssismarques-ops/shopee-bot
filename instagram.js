const axios = require('axios');
const { salvarProdutoPostado } = require('./historico');
const { gerarChamada } = require('./tendencias');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// Perfil @byrosanamatias — beleza e estética
const IG_BELEZA_USER_ID = process.env.INSTAGRAM_BELEZA_USER_ID;
const IG_BELEZA_TOKEN   = process.env.INSTAGRAM_BELEZA_TOKEN;

// Perfil @achadinhosdaroh01 — produtos gerais
const IG_GERAL_USER_ID  = process.env.INSTAGRAM_GERAL_USER_ID;
const IG_GERAL_TOKEN    = process.env.INSTAGRAM_GERAL_TOKEN;

// ─── Hashtags rotativas (v3.23) ─────────────────────────────────────────────
// Instagram pune contas que repetem mesmas hashtags todo dia.
// Solução: 3 conjuntos por categoria, rotacionados por dia do mês.
// Dia 1, 4, 7, 10... → conjunto A
// Dia 2, 5, 8, 11... → conjunto B
// Dia 3, 6, 9, 12... → conjunto C
function rotacaoDoDia() {
  return new Date().getDate() % 3;  // 0, 1 ou 2
}

const HASHTAGS_BASE_BELEZA = [
  // Conjunto A — foco em beleza e skincare
  '#beleza #skincare #maquiagem #dicasdebeleza #cuidadospessoais #cosméticos #pele #cabelo #autocuidado',
  // Conjunto B — foco em achadinhos e ofertas
  '#achadinhosdaroh #shopeebrasil #ofertasdodia #promoção #belezabarata #dicasdecompras #beautyfinds #achadinhos',
  // Conjunto C — foco em rotina e dicas
  '#rotinadebeleza #skincarediario #maquiagemnatural #autoestima #vidasaudavel #autocuidadodiario #belezasemfiltro',
];

const HASHTAGS_BASE_GERAL = [
  // Conjunto A — foco em achadinhos
  '#achadinhos #shopee #shopeebrasil #ofertasdodia #achadinhosdaroh #comprasonline #ofertarelampago #comprinhas',
  // Conjunto B — foco em desconto e promoção
  '#promoção #desconto #economize #ofertaimperdivel #dicasdecompras #compraconsciente #achadododdia #pechinchando',
  // Conjunto C — foco em estilo de vida
  '#dicasdoshopee #achados #shopeefinds #organização #praticidade #qualidade #valeapena #recomendado',
];

// Hashtags extras por categoria (3 variações cada)
const HASHTAGS_EXTRAS = {
  beleza: [
    '#makeupbrasil #skincarebr #rotinadebeleza #beautytips #skincaredicas',
    '#beautyaddict #cosmeticstore #peleperfeita #peleradiante #glowup',
    '#beautyhacks #automaquiagem #produtocoreano #kbeauty #routine',
  ],
  cozinha: [
    '#cozinhabr #kitchenbr #airfryerrecipes #receitasfaceis #cozinhando',
    '#cozinhagourmet #utensiliosdecozinha #kitchengoals #fooddiary #lifehacks',
    '#donadecasa #cozinhapratica #cooking #cozinhaboraver #praticidade',
  ],
  casa: [
    '#decoracaobr #homedecor #casabonita #organizacaocasa #decoração',
    '#interiordesignbr #decoracaocriativa #casadossonhos #decorinspo #aestheticbedroom',
    '#minhacasa #saladestar #cozinhadecorada #quartocasal #ambientesbr',
  ],
  moda: [
    '#modabr #modafeminina #lookdodia #ootdbrasil #fashion',
    '#estilobr #modaplussize #modabasica #moda2026 #vistaisso',
    '#bazarbrasil #modaacessivel #ootdshop #achadinhosdemodelo #lookdetrabalho',
  ],
  tech: [
    '#tecnologia #gadgets #techbr #eletrônicos #techreview',
    '#gadgetslovers #techbrasil #produtividade #worksetup #setupgamer',
    '#cabosereumemoriadeam #gadgetsuteis #eletronicosbr #techachadinhos #fonebluetooth',
  ],
  pet: [
    '#petbr #cachorro #gato #petlovers #pets',
    '#dogsofbrazil #catsofbrazil #petfeliz #vidadepet #petlife',
    '#caoecia #cachorrofeliz #gatofeliz #cuidadocomopet #petmaiscarinho',
  ],
  bebe: [
    '#maternidade #bebê #maebr #gravidez #mamãe',
    '#maedeprimeiraviagem #bebedebrasil #produtosparabebe #maternidadeevida #amordemae',
    '#cuidadoscomoBebe #vidademae #bebezinho #mamaeebebe #babylove',
  ],
  fitness: [
    '#fitness #academia #treinoemcasa #fitnessbr #saudeebemestar',
    '#vidasaudavel #treinodiario #musculação #emagrecer #healthylife',
    '#fitnessmotivation #treinoinfra #personalfeminino #saudeprimeiro #disciplinacomamor',
  ],
  auto: [
    '#carros #automotivo #carrobr #carros2026 #acessoriosdecarro',
    '#carlovers #vidanaestrada #suporteveicular #carolife #automóveis',
    '#cuidardocarro #organizacaoautomotiva #aromatizadorcarro #carrolimpo #autoamigo',
  ],
};

// Retorna hashtags base + extras por categoria do produto
// Rotaciona conjuntos diariamente pra evitar shadowban do Instagram (v3.23)
function gerarHashtags(produto, perfil) {
  const idx = rotacaoDoDia();
  const basePool = perfil === 'beleza' ? HASHTAGS_BASE_BELEZA : HASHTAGS_BASE_GERAL;
  const base = basePool[idx];
  const nome  = (produto.nome || '').toLowerCase();
  const cat   = [produto.categoria1, produto.categoria2, produto.categoria3]
    .filter(Boolean).join(' ').toLowerCase();
  const texto = nome + ' ' + cat;

  // Detecta qual categoria bate com o produto
  const categoriaMap = {
    beleza:  ['beleza', 'cosmétic', 'maquiagem', 'skincare', 'cabelo', 'perfume', 'creme'],
    cozinha: ['cozinha', 'kitchen', 'panela', 'air fryer', 'utensílio', 'culinária', 'alimentação'],
    casa:    ['casa', 'decoração', 'home', 'organização', 'cama', 'banho', 'tapete', 'cortina'],
    moda:    ['moda', 'roupa', 'vestido', 'blusa', 'calça', 'tênis', 'bolsa', 'fashion', 'acessório'],
    tech:    ['tech', 'eletrônico', 'fone', 'celular', 'computador', 'gadget', 'carregador'],
    pet:     ['pet', 'cachorro', 'gato', 'animal', 'pata', 'felino', 'canino'],
    bebe:    ['bebê', 'baby', 'infantil', 'criança', 'maternidade', 'kids'],
    fitness: ['fitness', 'academia', 'treino', 'exercício', 'yoga', 'musculação'],
    auto:    ['carro', 'veículo', 'automotivo', 'automóvel'],
  };

  for (const [c, palavras] of Object.entries(categoriaMap)) {
    if (palavras.some(p => texto.includes(p))) {
      const extras = HASHTAGS_EXTRAS[c][idx];
      return base + '\n' + extras;
    }
  }
  return base;
}

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

  const chamada = gerarChamada(produto, perfil);
  const caption = perfil === 'beleza'
    ? formatarLegendaBeleza(produto, chamada)
    : formatarLegendaGeral(produto, chamada);

  try {
    const { data: container } = await axios.post(
      `${BASE_URL}/${userId}/media`,
      null,
      { params: { image_url: produto.imagem, caption, access_token: token } }
    );

    // Aguarda 5s fixos pro Instagram processar a imagem.
    // Page Tokens não fazem GET no /{container_id} (Authorization Error code 100 subcode 33),
    // então polling de status não funciona — mas 5s é suficiente pra imagens JPEG da Shopee.
    await new Promise(r => setTimeout(r, 5000));

    const publishResp = await axios.post(
      `${BASE_URL}/${userId}/media_publish`,
      null,
      { params: { creation_id: container.id, access_token: token } }
    );

    console.log(`  📸 Instagram [${perfil}]: publicado "${produto.nome.slice(0, 50)}..."`);
    console.log(`     Media ID: ${publishResp.data?.id}`);
    console.log(`     Response: ${JSON.stringify(publishResp.data)}`);

    // Guarda metadados pra alimentar a landing page
    salvarProdutoPostado(produto, perfil);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const code = err.response?.data?.error?.code;
    console.error(`  ❌ Instagram [${perfil}] erro: ${msg}${code ? ' (code ' + code + ')' : ''}`);
  }
}

// Legenda para @byrosanamatias — estilo beleza
// Linha de abertura é a "chamada" contextual (Copa, Namorados, estação, etc).
// v3.8 — linha "🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias" pra produto nacional
// Links (produto + WhatsApp) ficam na landing page apontada pela bio,
// porque Instagram nunca torna links clicáveis em captions.
function formatarLegendaBeleza(produto, chamada) {
  const { nome, precoAtual, precoOriginal, crossBorder } = produto;
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';
  const linhaEnvio = crossBorder === false
    ? `🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias\n\n`
    : '';

  return (
    `${chamada}\n\n` +
    `${nome}\n\n` +
    `💰 ${linhaOrig}R$ ${preco}\n\n` +
    `${linhaEnvio}` +
    `👆 Toca no link da BIO pra comprar\n` +
    `   (e pra entrar no grupo VIP do WhatsApp 💬)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Achados de tudo? Segue a @achadinhosdaroh01 🛒\n\n` +
    `${gerarHashtags(produto, 'beleza')}`
  );
}

// Legenda para @achadinhosdaroh01 — estilo promoção
function formatarLegendaGeral(produto, chamada) {
  const { nome, precoAtual, precoOriginal, crossBorder } = produto;
  const preco     = fmtBRL(precoAtual);
  const linhaOrig = precoOriginal
    ? `De R$ ${fmtBRL(precoOriginal)} por apenas `
    : 'Por apenas ';
  const linhaEnvio = crossBorder === false
    ? `🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias\n\n`
    : '';

  return (
    `${chamada}\n\n` +
    `🎁 ${nome}\n\n` +
    `💥 ${linhaOrig}R$ ${preco}\n\n` +
    `${linhaEnvio}` +
    `👆 Toca no link da BIO pra comprar\n` +
    `   (e pra entrar no grupo VIP do WhatsApp 💬)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Dicas de beleza? Segue a @byrosanamatias 💄\n\n` +
    `${gerarHashtags(produto, 'geral')}`
  );
}

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

/**
 * Posta um Story no Instagram (v3.16, ajustado em v3.20).
 *
 * Bug fixado: Meta API exige imagem 9:16 (1080x1920) pra Stories.
 * Imagens da Shopee são quadradas — ficavam recortadas feio ou rejeitadas.
 * Agora gera imagem 9:16 via ffmpeg (produto centralizado + fundo desfocado)
 * e serve via /story/:file pra Meta API buscar.
 *
 * O story aparece por 24h. Não tem caption visível — a imagem fala por si.
 */
async function postarStory(produto, perfil) {
  const userId = perfil === 'beleza' ? IG_BELEZA_USER_ID : IG_GERAL_USER_ID;
  const token  = perfil === 'beleza' ? IG_BELEZA_TOKEN   : IG_GERAL_TOKEN;

  if (!userId || !token || !produto.imagem) return;

  const railwayUrl = process.env.RAILWAY_PUBLIC_URL || 'https://shopee-bot-production-e39e.up.railway.app';

  try {
    // Gera imagem 9:16 (1080x1920) com produto centralizado e fundo desfocado
    const { gerarImagemStory } = require('./reels');
    await gerarImagemStory(produto.imagem, perfil);

    const imageUrl = `${railwayUrl}/story/story_${perfil}.jpg`;

    const { data: container } = await axios.post(
      `${BASE_URL}/${userId}/media`,
      null,
      { params: { image_url: imageUrl, media_type: 'STORIES', access_token: token } }
    );

    await new Promise(r => setTimeout(r, 8000));  // 8s pra processar imagem 9:16

    const publishResp = await axios.post(
      `${BASE_URL}/${userId}/media_publish`,
      null,
      { params: { creation_id: container.id, access_token: token } }
    );

    console.log(`  📖 Story Instagram [${perfil}]: publicado.`);
    console.log(`     Media ID: ${publishResp.data?.id}`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const code = err.response?.data?.error?.code;
    console.error(`  ❌ Story [${perfil}] FALHOU: ${msg}${code ? ' (code ' + code + ')' : ''}`);
  }
}

/**
 * Seleciona os top N produtos por desconto percentual.
 */
function selecionarTopN(produtos, n = 3) {
  return [...produtos]
    .sort((a, b) => {
      const dA = a.precoOriginal ? (a.precoOriginal - a.precoAtual) / a.precoOriginal : 0;
      const dB = b.precoOriginal ? (b.precoOriginal - b.precoAtual) / b.precoOriginal : 0;
      return dB - dA;
    })
    .slice(0, n)
    .filter(p => p.imagem);
}

/**
 * Posta um carrossel com 2-3 produtos (v3.17, ajustado em v3.20).
 *
 * Aceita seja uma lista crua (vai filtrar/selecionar top 3) seja uma lista
 * já preparada — se receber array de até 10 produtos com .imagem todos,
 * usa direto sem re-selecionar (evita re-resolver links de afiliado).
 */
async function postarCarrossel(produtos, perfil) {
  const userId = perfil === 'beleza' ? IG_BELEZA_USER_ID : IG_GERAL_USER_ID;
  const token  = perfil === 'beleza' ? IG_BELEZA_TOKEN   : IG_GERAL_TOKEN;

  if (!userId || !token) return;

  // Se chamador já passou top N preparado (até 10), usa direto;
  // senão, re-seleciona top 3 do array bruto.
  const top = (produtos.length <= 10 && produtos.every(p => p.imagem))
    ? produtos.slice(0, 10)
    : selecionarTopN(produtos, 3);

  if (top.length < 2) {
    console.log(`  Poucos produtos com imagem para carrossel [${perfil}], pulando.`);
    return null;
  }

  try {
    // Passo 1: cria container individual pra cada imagem
    const itemIds = [];
    for (const p of top) {
      const { data } = await axios.post(`${BASE_URL}/${userId}/media`, null, {
        params: { image_url: p.imagem, is_carousel_item: true, access_token: token }
      });
      itemIds.push(data.id);
      await new Promise(r => setTimeout(r, 1000));
    }

    // Passo 2: monta caption geral do carrossel
    const chamada = gerarChamada(top[0], perfil);
    const linhas = top.map((p, i) => {
      const preco = fmtBRL(p.precoAtual);
      const desc  = p.desconto ? ` (-${p.desconto}%)` : '';
      return `${i + 1}. ${p.nome.slice(0, 60)} — R$ ${preco}${desc}`;
    }).join('\n');

    const caption = perfil === 'beleza'
      ? `${chamada}\n\nTop 3 achados de beleza hoje:\n\n${linhas}\n\n` +
        `👆 Toca no link da BIO pra comprar\n\n` +
        `Achados de tudo? Segue a @achadinhosdaroh01 🛒\n\n${gerarHashtags(top[0], 'beleza')}`
      : `${chamada}\n\nTop 3 achados do dia:\n\n${linhas}\n\n` +
        `👆 Toca no link da BIO pra comprar\n\n` +
        `Dicas de beleza? Segue a @byrosanamatias 💄\n\n${gerarHashtags(top[0], 'geral')}`;

    // Passo 3: cria container do carrossel
    const { data: carousel } = await axios.post(`${BASE_URL}/${userId}/media`, null, {
      params: {
        media_type: 'CAROUSEL',
        children: itemIds.join(','),
        caption,
        access_token: token
      }
    });

    await new Promise(r => setTimeout(r, 5000));

    // Passo 4: publica e captura o media_id pra debug
    const publishResp = await axios.post(`${BASE_URL}/${userId}/media_publish`, null, {
      params: { creation_id: carousel.id, access_token: token }
    });
    const publishedMediaId = publishResp.data?.id;

    console.log(`  🎠 Carrossel Instagram [${perfil}]: ${top.length} produtos publicados.`);
    console.log(`     Media ID: ${publishedMediaId}`);
    console.log(`     Response: ${JSON.stringify(publishResp.data)}`);
    top.forEach(p => salvarProdutoPostado(p, perfil));
    return top[0];
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const code = err.response?.data?.error?.code;
    console.error(`  ❌ Carrossel [${perfil}] FALHOU: ${msg}${code ? ' (code ' + code + ')' : ''}`);
    return null;
  }
}

/**
 * Posta um Reel no Instagram (v3.18).
 * Gera um MP4 de 7s com zoom suave a partir da imagem do produto (ffmpeg).
 * Serve o video temporariamente via Express e posta como REELS na Meta API.
 * railwayUrl: URL publica do servico (ex: shopee-bot-production-e39e.up.railway.app)
 */
async function postarReel(produto, perfil) {
  const userId = perfil === 'beleza' ? IG_BELEZA_USER_ID : IG_GERAL_USER_ID;
  const token  = perfil === 'beleza' ? IG_BELEZA_TOKEN   : IG_GERAL_TOKEN;

  if (!userId || !token || !produto.imagem) return;

  const railwayUrl = process.env.RAILWAY_PUBLIC_URL || 'https://shopee-bot-production-e39e.up.railway.app';

  try {
    const { gerarVideoReel } = require('./reels');
    await gerarVideoReel(produto.imagem, perfil);

    const videoUrl = `${railwayUrl}/reel/reel_${perfil}.mp4`;
    const chamada  = gerarChamada(produto, perfil);
    const preco    = fmtBRL(produto.precoAtual);
    const desc     = produto.desconto ? ` (-${produto.desconto}%)` : '';
    const caption  = perfil === 'beleza'
      ? `${chamada}\n\n${produto.nome}\n\nR$ ${preco}${desc}\n\n👆 Link na BIO pra comprar\n\n${gerarHashtags(produto, 'beleza')}`
      : `${chamada}\n\n${produto.nome}\n\nR$ ${preco}${desc}\n\n👆 Link na BIO pra comprar\n\n${gerarHashtags(produto, 'geral')}`;

    // Cria container de video (Instagram busca o video_url assincronamente)
    const { data: container } = await axios.post(`${BASE_URL}/${userId}/media`, null, {
      params: { video_url: videoUrl, media_type: 'REELS', caption, access_token: token }
    });

    // Video demora mais pra processar — aguarda 90s fixos (9007 fix)
    console.log(`  Aguardando processamento do Reel [${perfil}]...`);
    await new Promise(r => setTimeout(r, 90000));

    const publishResp = await axios.post(`${BASE_URL}/${userId}/media_publish`, null, {
      params: { creation_id: container.id, access_token: token }
    });

    console.log(`  🎬 Reel Instagram [${perfil}]: publicado com sucesso.`);
    console.log(`     Media ID: ${publishResp.data?.id}`);
    console.log(`     Response: ${JSON.stringify(publishResp.data)}`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const code = err.response?.data?.error?.code;
    console.error(`  ❌ Reel [${perfil}] FALHOU: ${msg}${code ? ' (code ' + code + ')' : ''}`);
  }
}

module.exports = { postarNoInstagram, postarCarrossel, postarStory, postarReel, selecionarDestaque, selecionarTopN };
