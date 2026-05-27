/**
 * reels.js — Gera video MP4 9:16 (Reels) e imagem 9:16 (Stories) via ffmpeg.
 *
 * v3.20 — Corrige bugs críticos:
 *  B2: Reels eram 1080x1080 (square) → Meta API rejeita. Agora 1080x1920 (9:16).
 *  B3: Reels sem audio track → algoritmo Instagram pune. Agora com audio silencioso.
 *  B4: Stories enviavam imagem 1:1 → Meta API rejeita ou recorta. Agora 1080x1920.
 *
 * Fluxo Reel:
 *  1. Baixa imagem do CDN da Shopee
 *  2. ffmpeg: 9:16 (1080x1920), produto centralizado sobre fundo desfocado
 *     + audio silencioso AAC + zoom suave (Ken Burns) por 7s
 *  3. Salva em /data/reel_<perfil>.mp4 (servido em /reel/:file)
 *
 * Fluxo Story:
 *  1. Mesma imagem
 *  2. ffmpeg: gera 1 frame 1080x1920 (sem animação, sem audio — é foto)
 *  3. Salva em /data/story_<perfil>.jpg (servido em /story/:file)
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const fs = require('fs');

const execFileAsync = promisify(execFile);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36';

async function baixarImagem(imageUrl, destPath) {
  const resp = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'Referer': 'https://shopee.com.br/', 'User-Agent': UA },
  });
  fs.writeFileSync(destPath, Buffer.from(resp.data));
}

/**
 * Gera Reel MP4 1080x1920 (9:16) com zoom suave + audio silencioso.
 * Retorna o path do arquivo gerado.
 *
 * Filtro: usa a própria imagem como fundo desfocado pra preencher 9:16,
 * com o produto nítido centralizado. Bem mais atraente que faixas pretas.
 */
async function gerarVideoReel(imageUrl, perfil) {
  const inputPath  = `/data/tmp_reel_${perfil}.jpg`;
  const outputPath = `/data/reel_${perfil}.mp4`;

  await baixarImagem(imageUrl, inputPath);

  // Filter complex:
  //  [0:v]split=2[bg][fg]
  //  [bg] = imagem inteira escalada pra preencher 9:16 + blur pesado
  //  [fg] = produto nítido escalado pra caber dentro
  //  overlay centralizado
  //  zoompan = Ken Burns suave (z 1.0 → 1.15 em 7s a 30fps)
  const vf = [
    '[0:v]split=2[bg][fg]',
    '[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=-0.1[bg2]',
    '[fg]scale=1080:1080:force_original_aspect_ratio=decrease[fg2]',
    '[bg2][fg2]overlay=(W-w)/2:(H-h)/2[comp]',
    "[comp]zoompan=z='min(zoom+0.0007,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=210:s=1080x1920:fps=30,format=yuv420p[v]",
  ].join(';');

  const args = [
    '-y',
    '-loop', '1', '-framerate', '30', '-i', inputPath,
    // Trilha de áudio silenciosa (AAC) — Meta API exige audio em Reels
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', vf,
    '-map', '[v]', '-map', '1:a',
    '-t', '7',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest',
    '-movflags', '+faststart',
    outputPath,
  ];

  await execFileAsync('ffmpeg', args, { timeout: 120000 });

  try { fs.unlinkSync(inputPath); } catch (_) {}
  return outputPath;
}

/**
 * Gera imagem JPEG 1080x1920 (9:16) com produto centralizado e fundo desfocado.
 * Mesma técnica do Reel mas só 1 frame estático.
 */
async function gerarImagemStory(imageUrl, perfil) {
  const inputPath  = `/data/tmp_story_${perfil}.jpg`;
  const outputPath = `/data/story_${perfil}.jpg`;

  await baixarImagem(imageUrl, inputPath);

  const vf = [
    '[0:v]split=2[bg][fg]',
    '[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30,eq=brightness=-0.1[bg2]',
    '[fg]scale=1080:1080:force_original_aspect_ratio=decrease[fg2]',
    '[bg2][fg2]overlay=(W-w)/2:(H-h)/2',
  ].join(';');

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', vf,
    '-frames:v', '1',
    '-q:v', '2',  // qualidade JPEG alta
    outputPath,
  ];

  await execFileAsync('ffmpeg', args, { timeout: 30000 });

  try { fs.unlinkSync(inputPath); } catch (_) {}
  return outputPath;
}

module.exports = { gerarVideoReel, gerarImagemStory };
