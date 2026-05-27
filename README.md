# Shopee Bot — Achadinhos da Roh

Bot Node.js que automatiza o trabalho de afiliada da Rosana na Shopee. Versão atual: **v3.14**.

## O que faz

- Baixa feed CSV oficial de afiliados Shopee (100k+ produtos/dia, streaming, cache 6h)
- Filtra produtos: nota ≥ 4.5, preço R$ 10-150, desconto ≥ 20%, sem componentes PC/utilitários/nicho
- Curadoria por score (qualidade + tendências + datas comemorativas + estação do ano)
- Diversifica os 5 produtos do WhatsApp por setor; em campanha (Copa, Namorados ≤ 14 dias) 3 slots vão pra produtos da campanha
- Envia **foto + legenda** no grupo WhatsApp via Baileys
- Posta destaque em 2 perfis Instagram via Meta Graph API
- Serve landing page pública com grid dos últimos 25 produtos por categoria

## Horários

| Canal | Horários |
|---|---|
| WhatsApp | 12h · 20h (5 produtos cada) |
| Instagram @byrosanamatias (beleza) | 20h (1 destaque) |
| Instagram @achadinhosdaroh01 (geral) | 8h · 11h · 14h · 17h · 20h (1 destaque cada) |

## URLs em produção

- https://shopee-bot-production-e39e.up.railway.app/ (índice)
- https://shopee-bot-production-e39e.up.railway.app/beleza (bio @byrosanamatias)
- https://shopee-bot-production-e39e.up.railway.app/geral (bio @achadinhosdaroh01)
- https://shopee-bot-production-e39e.up.railway.app/health (healthcheck Railway)

## Arquivos

| Arquivo | Função |
|---|---|
| `index.js` | Scheduler cron + orquestração (WhatsApp + Instagram) |
| `whatsapp.js` | Baileys: conexão, QR, envio texto/imagem |
| `shopee.js` | Feed CSV, filtros, score, diversificação por setor |
| `tendencias.js` | Calendário comercial BR, scoring, chamadas contextuais |
| `instagram.js` | Meta Graph API: publica em 2 perfis |
| `landingpage.js` | Express: `/beleza`, `/geral`, `/health` |
| `mensagem.js` | Formato da mensagem WhatsApp |
| `historico.js` | Ring buffer anti-repetição + metadados landing page |

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
- **Instagram parou** (`Invalid OAuth access token`): reemitir Page Tokens via Graph API Explorer (ver CLAUDE.md)
- **WhatsApp deslogou**: `rm -rf /data/baileys_auth` no terminal Railway → restart → reescanear QR

Documentação completa: [CLAUDE.md](./CLAUDE.md)
