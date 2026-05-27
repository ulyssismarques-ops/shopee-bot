/**
 * reels.js — Gera video MP4 a partir de imagem JPEG usando ffmpeg (v3.18).
 *
 * Fluxo:
 *  1. Baixa imagem do CDN da Shopee para /data/tmp_reel_<perfil>.jpg
 *  2. Roda ffmpeg: zoom suave (Ken Burns) por 7s, output 1080x1080 H.264
 *  3. Salva em /data/reel_<perfil>.mp4  (servido pelo Express em /reel/:file)
 *  4. Retorna o path do video gerado
 *
 * Dependencia: ffmpeg instalado no container (ver Dockerfile).
 */
const { execSync } = require('child_process');
const axios = require('axios');
const fs = require('fs');

async function gerarVideoReel(imageUrl, perfil) {
  const inputPath  = `/data/tmp_reel_${perfil}.jpg`;
  const outputPath = `/data/reel_${perfil}.mp4`;

  // Baixa a imagem
  const resp = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'Referer': 'https://shopee.com.br/' },
  });
  fs.writeFileSync(inputPath, Buffer.from(resp.data));

  // Gera video: escala pra 1080x1080, aplica zoom suave por 7s (175 frames a 25fps)
  // -y: sobrescreve sem perguntar
  // zoompan: z cresce de 1.0 ate 1.3 ao longo de 175 frames
  const cmd = [
    'ffmpeg -y',
    `-loop 1 -framerate 25 -i "${inputPath}"`,
    `-vf "scale=1080:1080:force_original_aspect_ratio=increase,`,
    `crop=1080:1080,`,
    `zoompan=z='min(zoom+0.0015,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=175:s=1080x1080:fps=25,`,
    `format=yuv420p"`,
    `-c:v libx264 -preset fast -crf 23 -t 7 -movflags +faststart`,
    `"${outputPath}"`,
  ].join(' ');

  execSync(cmd, { timeout: 90000, stdio: 'pipe' });

  // Limpa imagem temporaria
  try { fs.unlinkSync(inputPath); } catch (_) {}

  return outputPath;
}

module.exports = { gerarVideoReel };
