# Shopee Bot — Achadinhos da Roh

Bot Node.js que automatiza o trabalho de afiliada da Rosana na Shopee. Versão atual: **v3.41**.

## O que faz

- Baixa feed CSV oficial de afiliados Shopee (100k+ produtos/dia, streaming, cache 6h)
- Filtra produtos: nota ≥ 4.5, preço R$ 10-150, desconto ≥ 20%, sem componentes PC/utilitários/nicho
- Curadoria por score 0-200 (qualidade + tendências + datas comemorativas + estação + comissão)
- Diversifica os 5 produtos do WhatsApp por setor; em campanha (Copa, Namorados ≤ 14 dias) 3 slots vão pra produtos da campanha
- Envia **foto + legenda** no grupo WhatsApp via Baileys
- Posta carrossel top 3 + Story em 2 perfis Instagram via Meta Graph API
- Gera Reel MP4 9:16 com zoom Ken Burns via ffmpeg (1x/dia às 10h)
- Serve landing page pública com grid dos últimos 25 produtos por categoria
- **Descoberta por IA (GEO, v3.41):** JSON-LD + `/beleza.json` `/geral.json` + robots.txt + sitemap.xml pra ChatGPT/Perplexity/Gemini citarem as ofertas (clique → comissão)

## Horários (v3.29 — 1x/dia no pico)

| Canal | Horário |
|---|---|
| WhatsApp | 20h (5 produtos) |
| Instagram @byrosanamatias (beleza) | 20h (carrossel + story) |
| Instagram @achadinhosdaroh01 (geral) | 20h (carrossel + story) |
| Reels (ambos os perfis) | 10h beleza · 10h30 geral |
| Health check | 23h (log diário) |

## URLs em produção

- https://shopee-bot-production-e39e.up.railway.app/ (índice)
- https://shopee-bot-production-e39e.up.railway.app/beleza (bio @byrosanamatias)
- https://shopee-bot-production-e39e.up.railway.app/geral (bio @achadinhosdaroh01)
- https://shopee-bot-production-e39e.up.railway.app/health (healthcheck Railway)

## Arquivos

| Arquivo | Função |
|---|---|
| `index.js` | Scheduler cron + orquestração (WhatsApp + Instagram + Reels + Health check) |
| `whatsapp.js` | Baileys: conexão, QR, envio texto/imagem, status@broadcast |
| `shopee.js` | Feed CSV, filtros, score, cache parse, diversificação por setor |
| `tendencias.js` | Calendário comercial BR, scoring 0-200, chamadas contextuais |
| `instagram.js` | Meta Graph API: feed, carrossel, story, reel nos 2 perfis |
| `reels.js` | ffmpeg: gera MP4 9:16 (Reel) e JPEG 9:16 (Story) |
| `landingpage.js` | Express: páginas + JSON-LD/`.json`/robots/sitemap (GEO) + `/reel/:file` `/story/:file` `/admin/disparo` |
| `mensagem.js` | Formato da mensagem WhatsApp com PS rotativo |
| `historico.js` | Ring buffer 300 IDs anti-repetição + metadados landing page |
| `test.js` | Testa scoring/filtros localmente sem disparar produção |

## Deploy

```bash
git add .
git commit -m "descrição"
git push
```

Railway auto-deploya em ~90s após o push.

## Teste imediato

No Railway → Variables → adicione `TESTAR_AGORA=true` → Redeploy.
**Remover após o teste** — senão dispara extra a cada redeploy.

## Manutenção

- **Feed URL expirou** (`401/403` nos logs): `affiliate.shopee.com.br` → Criativo → Feed de produto → Ver Link → atualiza `SHOPEE_FEED_URL` no Railway
- **Instagram parou** (`Invalid OAuth` ou `code 200`): reemitir Page Tokens via Graph API Explorer → `/me/accounts?fields=name,access_token` → atualiza `INSTAGRAM_BELEZA_TOKEN` e `INSTAGRAM_GERAL_TOKEN`
- **WhatsApp deslogou** (`Sessão encerrada (logout)`): `rm -rf /data/baileys_auth` no terminal Railway → restart → reescanear QR
- **Verificação preventiva tokens Meta**: a cada 60 dias — próxima em 24/07/2026

Documentação completa: [CLAUDE.md](./CLAUDE.md)
