const express = require('express');
const { lerProdutosPostados } = require('./historico');

const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/IDkdxxWLoNm7jt2fvWQ7qc';

const PERFIS = {
  beleza: {
    handle:    '@byrosanamatias',
    titulo:    'Achados de Beleza da Roh',
    subtitulo: 'Skincare, maquiagem e cuidados — direto da Shopee',
    cor:       '#ec407a',
    corClara:  '#fff0f6',
    outroPerfil: { handle: '@achadinhosdaroh01', label: 'Achados de tudo', emoji: '🛒', path: '/geral' },
  },
  geral: {
    handle:    '@achadinhosdaroh01',
    titulo:    'Achadinhos da Roh',
    subtitulo: 'Os melhores preços da Shopee, todo dia',
    cor:       '#ee4d2d',
    corClara:  '#fff5f0',
    outroPerfil: { handle: '@byrosanamatias', label: 'Dicas de beleza', emoji: '💄', path: '/beleza' },
  },
};

// HTML escape — protege contra XSS em nomes de produto
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtBRL(valor) {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return '0,00';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calcularDesconto(precoAtual, precoOriginal) {
  if (!precoOriginal || precoOriginal <= precoAtual) return null;
  return Math.round(((precoOriginal - precoAtual) / precoOriginal) * 100);
}

function renderCardDestaque(p, cor) {
  const desconto = calcularDesconto(p.precoAtual, p.precoOriginal);
  const precoOrig = p.precoOriginal
    ? `<div class="featured-price-old">De R$ ${esc(fmtBRL(p.precoOriginal))}</div>`
    : '';
  const badgeDesc = desconto
    ? `<div class="desc-tag">-${desconto}%</div>`
    : '';
  // Badge "Envio rápido" só pra produto nacional (não cross-border)
  const badgeBR = p.crossBorder === false
    ? `<div class="badge-br">🇧🇷 ENVIO RÁPIDO</div>`
    : '';
  const stripBR = p.crossBorder === false
    ? `<div class="strip-br">🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias</div>`
    : '';
  return `
    <div class="featured-card">
      <div class="featured-photo">
        ${badgeDesc}
        ${badgeBR}
        <img src="${esc(p.imagem)}" alt="${esc(p.nome)}" onerror="this.style.display='none'">
      </div>
      <div class="featured-info">
        ${stripBR}
        <div class="featured-name">${esc(p.nome)}</div>
        ${precoOrig}
        <div class="featured-price-new" style="color:${cor}">R$ ${esc(fmtBRL(p.precoAtual))}</div>
        <a href="${esc(p.linkAfiliado)}" class="featured-btn" style="background:${cor}" target="_blank" rel="noopener">
          <span class="ico">🛒</span> COMPRAR NA SHOPEE
        </a>
      </div>
    </div>
  `;
}

function renderCardGrid(p, cor) {
  const desconto = calcularDesconto(p.precoAtual, p.precoOriginal);
  const badgeDesc = desconto
    ? `<div class="desc-sm">-${desconto}%</div>`
    : '';
  const flagBR = p.crossBorder === false
    ? `<div class="flag-sm" title="Envio rápido nacional">🇧🇷</div>`
    : '';
  return `
    <a href="${esc(p.linkAfiliado)}" class="grid-card" target="_blank" rel="noopener">
      <div class="grid-photo">
        ${badgeDesc}
        ${flagBR}
        <img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="grid-info">
        <div class="grid-name">${esc(p.nome)}</div>
        <div class="grid-price" style="color:${cor}">R$ ${esc(fmtBRL(p.precoAtual))}</div>
      </div>
    </a>
  `;
}

function renderPagina(categoria) {
  const cfg = PERFIS[categoria];
  if (!cfg) return '<h1>Perfil não encontrado</h1>';

  const produtos = lerProdutosPostados(categoria);
  const destaque = produtos[0];
  const restante = produtos.slice(1);

  const blocoDestaque = destaque
    ? `<div class="section-title">✨ Destaque de agora <span class="badge" style="background:${cfg.cor}">NOVO</span></div>
       ${renderCardDestaque(destaque, cfg.cor)}`
    : `<div class="empty-state">
         <div class="empty-icon">📦</div>
         <div class="empty-text">Em instantes os primeiros achados aparecem aqui.</div>
         <div class="empty-sub">Volta daqui a pouco ou entra no grupo VIP pra não perder nada.</div>
       </div>`;

  const blocoGrid = restante.length
    ? `<div class="section-title">📦 Últimos achados</div>
       <div class="grid-products">${restante.map(p => renderCardGrid(p, cfg.cor)).join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="${cfg.cor}">
<title>${esc(cfg.titulo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: linear-gradient(180deg, ${cfg.corClara} 0%, #fff 60%);
    color: #262626;
    min-height: 100vh;
    padding: 18px 16px 40px;
    max-width: 520px;
    margin: 0 auto;
  }
  .header { text-align: center; padding: 18px 0 26px; }
  .logo {
    width: 90px; height: 90px;
    border-radius: 50%;
    background: linear-gradient(135deg, ${cfg.cor}, #ff8a65);
    margin: 0 auto 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 42px;
    box-shadow: 0 8px 22px rgba(0,0,0,0.10);
  }
  .title { font-weight: 800; font-size: 26px; }
  .handle { color: ${cfg.cor}; font-size: 16px; font-weight: 600; margin: 4px 0 8px; }
  .subtitle { color: #555; font-size: 15px; }

  .wa-button {
    display: flex; align-items: center;
    background: linear-gradient(135deg, #25D366, #128C7E);
    color: white;
    padding: 20px 22px;
    border-radius: 18px;
    text-decoration: none;
    margin-bottom: 26px;
    box-shadow: 0 10px 24px rgba(37, 211, 102, 0.30);
    transition: transform 0.15s;
  }
  .wa-button:active { transform: scale(0.97); }
  .wa-button .ico { font-size: 34px; margin-right: 16px; }
  .wa-button .text-block .title-l { font-weight: 700; font-size: 19px; }
  .wa-button .text-block .sub-l { font-size: 14px; opacity: 0.92; margin-top: 3px; }
  .wa-button .arrow-r { margin-left: auto; font-size: 26px; }

  .section-title {
    font-weight: 700; font-size: 17px;
    margin: 8px 0 14px;
    display: flex; align-items: center;
  }
  .section-title .badge {
    color: white;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    margin-left: 10px;
    font-weight: 700;
  }

  .featured-card {
    background: white;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 8px 28px rgba(0,0,0,0.10);
    margin-bottom: 22px;
    border: 2px solid ${cfg.cor};
  }
  .featured-photo {
    width: 100%;
    aspect-ratio: 1.1;
    background: #fafafa;
    position: relative;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .featured-photo img { width: 100%; height: 100%; object-fit: cover; }
  .desc-tag {
    position: absolute; top: 12px; left: 12px;
    background: ${cfg.cor};
    color: white;
    padding: 6px 13px;
    border-radius: 14px;
    font-weight: 700;
    font-size: 15px;
    z-index: 2;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  }
  /* Badge "Envio Rápido" — produto nacional (não cross-border) */
  .badge-br {
    position: absolute; top: 12px; right: 12px;
    background: linear-gradient(135deg, #009b3a 0%, #ffd700 100%);
    color: white;
    padding: 7px 14px;
    border-radius: 14px;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.3px;
    z-index: 2;
    box-shadow: 0 4px 12px rgba(0, 155, 58, 0.4);
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  /* Faixa abaixo da foto, dentro do card de destaque */
  .strip-br {
    background: linear-gradient(90deg, #009b3a 0%, #ffd700 100%);
    color: white;
    padding: 8px 14px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 12px;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0,0,0,0.25);
    box-shadow: 0 2px 6px rgba(0, 155, 58, 0.25);
  }
  .featured-info { padding: 16px 18px 20px; }
  .featured-name { font-size: 17px; font-weight: 600; line-height: 1.35; margin-bottom: 10px; }
  .featured-price-old { text-decoration: line-through; color: #999; font-size: 14px; }
  .featured-price-new { font-size: 30px; font-weight: 800; margin: 6px 0 16px; }
  .featured-btn {
    display: flex; align-items: center; justify-content: center;
    color: white;
    padding: 16px;
    border-radius: 14px;
    text-decoration: none;
    font-weight: 700;
    font-size: 18px;
    box-shadow: 0 6px 16px rgba(0,0,0,0.18);
    transition: transform 0.15s;
  }
  .featured-btn:active { transform: scale(0.97); }
  .featured-btn .ico { margin-right: 8px; font-size: 22px; }

  .grid-products {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .grid-card {
    background: white;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0,0,0,0.06);
    text-decoration: none;
    color: inherit;
    transition: transform 0.15s;
  }
  .grid-card:active { transform: scale(0.97); }
  .grid-photo {
    aspect-ratio: 1;
    background: #fafafa;
    position: relative;
    overflow: hidden;
  }
  .grid-photo img { width: 100%; height: 100%; object-fit: cover; }
  .desc-sm {
    position: absolute; top: 8px; left: 8px;
    background: ${cfg.cor};
    color: white;
    padding: 3px 9px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    z-index: 2;
  }
  /* Bandeira pequena no grid (produto nacional) */
  .flag-sm {
    position: absolute; top: 8px; right: 8px;
    background: rgba(255, 255, 255, 0.95);
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 16px;
    z-index: 2;
    box-shadow: 0 2px 5px rgba(0,0,0,0.15);
    line-height: 1;
  }
  .grid-info { padding: 10px 12px 14px; }
  .grid-name {
    font-size: 14px; line-height: 1.35;
    height: 38px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    margin-bottom: 6px;
  }
  .grid-price { font-weight: 700; font-size: 16px; }

  .empty-state {
    text-align: center;
    background: white;
    padding: 42px 26px;
    border-radius: 18px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    margin-bottom: 26px;
  }
  .empty-icon { font-size: 56px; margin-bottom: 12px; }
  .empty-text { font-weight: 600; font-size: 17px; margin-bottom: 8px; }
  .empty-sub { color: #777; font-size: 15px; }

  .cross-promo {
    margin: 32px 0 14px;
    padding: 20px;
    background: white;
    border-radius: 14px;
    border: 1px dashed #ccc;
    text-align: center;
    text-decoration: none;
    color: #262626;
    display: block;
    font-size: 15px;
  }
  .cross-promo .emoji { font-size: 30px; display: block; margin-bottom: 6px; }
  .cross-promo .ph { font-weight: 700; color: ${cfg.cor}; }
  .cross-promo .desc { font-size: 13px; color: #666; margin-top: 4px; }

  footer {
    text-align: center;
    color: #999;
    font-size: 12px;
    margin-top: 32px;
    padding: 22px 0 12px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">🛍️</div>
    <div class="title">${esc(cfg.titulo)}</div>
    <div class="handle">${esc(cfg.handle)}</div>
    <div class="subtitle">${esc(cfg.subtitulo)}</div>
  </div>

  <a href="${esc(WHATSAPP_GROUP_LINK)}" class="wa-button" target="_blank" rel="noopener">
    <span class="ico">💬</span>
    <div class="text-block">
      <div class="title-l">Grupo VIP WhatsApp</div>
      <div class="sub-l">5 promoções por dia, direto no zap</div>
    </div>
    <span class="arrow-r">›</span>
  </a>

  ${blocoDestaque}
  ${blocoGrid}

  <a href="${esc(cfg.outroPerfil.path)}" class="cross-promo">
    <span class="emoji">${cfg.outroPerfil.emoji}</span>
    <div>${esc(cfg.outroPerfil.label)} no <span class="ph">${esc(cfg.outroPerfil.handle)}</span></div>
    <div class="desc">Toca aqui pra ver os achados de lá</div>
  </a>

  <footer>Achadinhos da Roh · Atualizado automaticamente</footer>
</body>
</html>`;
}

function renderIndex() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Achadinhos da Roh</title>
<style>
  body {
    font-family: -apple-system, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #fff0f6, #fff5f0);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    margin: 0;
  }
  .box {
    background: white;
    padding: 32px 28px;
    border-radius: 22px;
    max-width: 400px;
    width: 100%;
    text-align: center;
    box-shadow: 0 12px 36px rgba(0,0,0,0.10);
  }
  h1 { margin: 0 0 6px; font-size: 22px; }
  p  { color: #666; font-size: 14px; margin-bottom: 22px; }
  a {
    display: block;
    padding: 16px;
    border-radius: 14px;
    margin-bottom: 12px;
    color: white;
    text-decoration: none;
    font-weight: 700;
  }
  .b1 { background: linear-gradient(135deg, #ec407a, #ff8a65); }
  .b2 { background: linear-gradient(135deg, #ee4d2d, #ff7043); }
</style>
</head>
<body>
  <div class="box">
    <h1>🛍️ Achadinhos da Roh</h1>
    <p>Escolha por onde quer entrar</p>
    <a class="b1" href="/beleza">💄 Achados de Beleza<br><small>@byrosanamatias</small></a>
    <a class="b2" href="/geral">🛒 Achados Gerais<br><small>@achadinhosdaroh01</small></a>
  </div>
</body>
</html>`;
}

function iniciarServidor() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.disable('x-powered-by');

  app.get('/', (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.send(renderIndex());
  });

  app.get('/beleza', (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.send(renderPagina('beleza'));
  });

  app.get('/geral', (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.send(renderPagina('geral'));
  });

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use((req, res) => res.redirect('/'));

  const server = app.listen(PORT, () => {
    console.log(`🌐 Landing page online em http://0.0.0.0:${PORT}`);
    console.log(`   • /         → escolha de perfil`);
    console.log(`   • /beleza   → bio do @byrosanamatias`);
    console.log(`   • /geral    → bio do @achadinhosdaroh01`);
  });

  // Serve videos de Reels temporariamente (v3.18)
  // Instagram busca o video_url durante a criacao do container
  app.get('/reel/:file', (req, res) => {
    const fs = require('fs');
    const p = require('path');
    const filename = p.basename(req.params.file);  // seguranca: sem path traversal
    const filepath = `/data/${filename}`;
    if (!fs.existsSync(filepath)) return res.status(404).send('not found');
    res.setHeader('Content-Type', 'video/mp4');
    res.sendFile(filepath);
  });

  server.on('error', (err) => {
    console.error('❌ Servidor de landing page falhou:', err.message);
  });

  return server;
}

module.exports = { iniciarServidor };
