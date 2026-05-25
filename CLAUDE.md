# Shopee Bot — Rosana (Achadinhos da Roh)

> **Memória permanente do projeto.** Claude Code lê este arquivo automaticamente ao abrir a pasta. Atualize sempre que algo estrutural mudar.

---

## 🎯 O que é

Bot Node.js que automatiza o trabalho de afiliada da Rosana na Shopee:
- Baixa feed CSV oficial de afiliados (100k+ produtos diários)
- Filtra produtos com nota ≥ 4.0, preço R$ 5-300, prioriza desconto ≥ 15%
- Posta 5 produtos por disparo, 5 disparos/dia, **3h em 3h** (8h · 11h · 14h · 17h · 20h SP)
- Envia **foto + legenda** no grupo `GRUPO EXCLUSIVO - Achadinhos da Roh #1` via Baileys
- **Posta 1 produto destaque em cada perfil do Instagram** (beleza no @byrosanamatias, geral no @achadinhosdaroh01) via Meta Graph API
- Anti-repetição: ring buffer de 300 IDs em `/data/historico.json`

**Em produção desde:** 24/05/2026
**Versão atual:** v3.0 (modo Feed CSV + Instagram dual)

---

## 🏗️ Stack

- **Node.js 20** (slim, em Docker)
- **@whiskeysockets/baileys** v6.7.22 — WhatsApp direto, sem Evolution API
- **axios** + **csv-parse** — feed Shopee
- **cron** — scheduler
- **qrcode-terminal** — QR no login
- **pino** — logger silencioso
- **Meta Graph API v19.0** — Instagram via Page Access Tokens (não expiram)

**Sem Puppeteer. Sem Postgres. Sem navegador headless.**

---

## 📦 Arquivos (todos na raiz)

| Arquivo | Função |
|---|---|
| `index.js` | Scheduler cron + orquestração do ciclo (WhatsApp + Instagram) |
| `whatsapp.js` | Baileys: conexão, QR, listagem de grupos, envio texto/imagem |
| `shopee.js` | Download streaming do feed CSV, parsing, filtros, separação beleza/geral |
| `instagram.js` | Meta Graph API: publica em 2 perfis (beleza/geral) com Page Tokens |
| `mensagem.js` | Formato da mensagem padrão Rosana (WhatsApp) |
| `historico.js` | Anti-repetição (ring buffer de 300 IDs) |
| `package.json` | Deps |
| `Dockerfile` | Build Railway (node:20-slim + git + openssh + build tools) |
| `.env.example` | Variáveis de referência (valores reais no Railway) |

---

## 🚀 Deploy

GitHub → Railway com auto-deploy via push.

```bash
git add .
git commit -m "descrição da mudança"
git push
```

Railway detecta o push em ~30s e faz redeploy em ~90s.

**Repositório:** `github.com/ulyssismarques-ops/shopee-bot` (privado)
**Railway:** projeto `supportive-fulfillment`, serviço `shopee-bot`, região US East
**Volume persistente:** `/data` (sessão WhatsApp + cache feed + histórico)

---

## ⚙️ Variáveis de ambiente (configuradas no Railway)

### WhatsApp + Shopee + sistema

| Variável | Valor | Comentário |
|---|---|---|
| `WHATSAPP_GROUP_ID` | `120363408307153519@g.us` | grupo "Achadinhos da Roh #1" |
| `SHOPEE_FEED_URL` | URL longa do feed | **único ponto de manutenção** — pode expirar |
| `SHOPEE_USERNAME` | `rosanaro2021` | não usado na v2.0+, mantido |
| `SHOPEE_PASSWORD` | senha | não usado na v2.0+, mantido |
| `AUTH_PATH` | `/data/baileys_auth` | sessão WhatsApp persistente |
| `HISTORICO_PATH` | `/data/historico.json` | anti-repetição |
| `TZ` | `America/Sao_Paulo` | timezone para cron |

### Instagram (Meta Graph API)

| Variável | Valor | Comentário |
|---|---|---|
| `INSTAGRAM_BELEZA_USER_ID` | `17841406374262083` | ID Instagram Business da `@byrosanamatias` |
| `INSTAGRAM_BELEZA_TOKEN` | Page Token da Sarah Marques | **Nunca expira** (Page Access Token) |
| `INSTAGRAM_GERAL_USER_ID` | `17841454857520124` | ID Instagram Business da `@achadinhosdaroh01` |
| `INSTAGRAM_GERAL_TOKEN` | Page Token da Achadinhos da Roh | **Nunca expira** (Page Access Token) |

⚠️ `TESTAR_AGORA=true` é flag opcional pra disparar envio imediato no boot. **Sempre deletar após testes**, senão dispara extra a cada redeploy.

---

## 📸 Arquitetura Instagram

### Estrutura de contas

| Perfil Instagram | Conteúdo | Vinculado à Página Facebook |
|---|---|---|
| `@byrosanamatias` (8.4k seguidores) | Apenas beleza/cosméticos | **Sarah Marques** |
| `@achadinhosdaroh01` (165 seguidores) | Produtos gerais | **Achadinhos da Roh** |

As legendas se cross-promovem mutuamente — quem segue um descobre o outro.

### Como funcionam os tokens

- **Tipo:** Page Access Tokens (EAA...) — **NÃO EXPIRAM** quando obtidos via long-lived User Token
- **Endpoint:** `https://graph.facebook.com/v19.0`
- **Fluxo de obtenção:**
  1. Graph API Explorer → User Access Token com permissões: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
  2. Trocar por long-lived User Token (60 dias) via `/oauth/access_token?grant_type=fb_exchange_token`
  3. `GET /me/accounts?fields=name,access_token,instagram_business_account` → retorna Page Tokens (não expiram)

### Identificadores do app Meta

| Item | Valor |
|---|---|
| App Facebook ID | `868430305625172` |
| App Secret | `a3854278b35b56f42886d526e7d89868` |
| App Instagram (sub-app) ID | `987298410690393` |
| App Instagram Secret | `512b71e729d5c4fa716a86b66b91b499` |
| Page ID Sarah Marques | `1135160886342210` |
| Page ID Achadinhos da Roh | `1142999705563903` |

### Permissões necessárias no app Meta

- Caso de uso **"Gerenciar mensagens e conteúdo no Instagram"** (Instagram API com Facebook Login)
- Caso de uso **"Gerenciar tudo na sua Página"** (Pages API)
- Permissões: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`

---

## 📜 10 Regras de Desenvolvimento

1. **Nunca colocar credenciais no código** — só no Railway env vars
2. **Validar sintaxe antes de commit** — `node -c index.js` e demais
3. **Sempre usar `rtk` como wrapper** em comandos verbosos (git status, git diff, grep, find, read em arquivos grandes)
4. **Não retornar pra API direta da Shopee** — IPs Railway/AWS recebem 403. Usar exclusivamente o feed CSV
5. **Volume `/data` é sagrado** — não escrever arquivos fora dele que precisem persistir
6. **Cache do feed: TTL 6h** — não baixar feed (200-300MB) a cada ciclo
7. **Histórico é ring buffer de 300 IDs** — não pode crescer indefinidamente
8. **Streaming download obrigatório** para o feed — `maxContentLength: Infinity` + pipe pra disco
9. **Foto vem do CDN da Shopee** (`cf.shopee.com.br`) — não tem anti-bot, baixar direto
10. **Antes de mexer no `shopee.js`** — ler primeiro a estrutura do CSV (campos detectados nos logs)

---

## 🔄 Fluxo do ciclo de envio

1. Cron dispara no horário (ex: 14h SP)
2. Verifica `/data/feed_cache.csv` — se < 6h, usa do cache
3. Senão, baixa feed via streaming (`SHOPEE_FEED_URL`) e atualiza cache
4. Parseia CSV completo (~100k produtos)
5. Aplica filtros: nota ≥ 4.0, preço R$ 5-300, nome ≥ 10 chars
6. Separa em 2 grupos: com desconto ≥ 15% (prioridade) e sem desconto (fallback)
7. Embaralha cada grupo, concatena (descontos primeiro)
8. Filtra 5 que ainda não foram enviados (`/data/historico.json`)
9. Para cada um: baixa imagem do CDN → envia foto + legenda no grupo WhatsApp
10. Aguarda 4s entre cada envio
11. Marca os 5 IDs no histórico (ring buffer)
12. **Instagram:** filtra produtos em memória por categoria (beleza vs geral)
13. Seleciona produto com **maior desconto** de cada categoria
14. Posta 1 produto de beleza no `@byrosanamatias` + 1 produto geral no `@achadinhosdaroh01`

---

## 🚨 Tarefas de manutenção

### 1. Atualizar `SHOPEE_FEED_URL` quando expirar

**Sintoma:** logs mostram `❌ Erro ao buscar produtos: status 401/403`. Mensagens param.

**Fix (3 min):**
1. `affiliate.shopee.com.br` → login com `rosanaro2021`
2. Menu lateral: **Criativo → Feed de produto**
3. Clica em **"Ver Link"** do feed `Shopee Oficial BR - 2022`
4. Copia URL nova
5. Railway → serviço `shopee-bot` → Variables → edita `SHOPEE_FEED_URL`
6. Redeploy automático

### 2. Page Tokens do Instagram

**Em teoria não expiram**, mas se a Rosana revogar acesso do app na conta dela ou alterar senha, os tokens podem ser invalidados.

**Sintoma:** logs mostram `❌ Instagram [beleza/geral] erro: Invalid OAuth access token`

**Fix:** Reexecutar fluxo completo de obtenção (ver "Arquitetura Instagram" acima).

---

## 🐛 Bugs conhecidos / Limitações

1. **TinyURL recusa URLs `shope.ee`** (400). Link postado no grupo é o feio (`shope.ee/an_redir?...`). Não atrapalha — comissão é paga. Pendente: testar outros encurtadores (is.gd, bitly).

2. **API direta da Shopee bloqueia IP datacenter** (403 em todos endpoints). **Não tentar voltar pra essa rota** — feed CSV é a única opção viável.

3. **WhatsApp pode deslogar** raramente. Fix:
   - Logs mostram: `❌ Sessão encerrada (logout). Delete /data/baileys_auth`
   - Railway → terminal do container → `rm -rf /data/baileys_auth`
   - Restart → reescanear QR (URL aparece nos logs)

4. **Page Token não consegue fazer GET no container do Instagram** (Authorization Error code 100 subcode 33). Por isso o bot NÃO usa polling de status — apenas aguarda 5s fixos antes de publicar. Funciona porque imagens da Shopee processam rápido.

5. **PNG transparente** não é aceito pelo Instagram API — apenas JPEG. Imagens da Shopee são JPEG, então não é problema.

---

## 📜 Histórico de versões

### v1.0 (24/05/2026 manhã) — descartada
Puppeteer + scraping API + Evolution API + Postgres. Falhou: 403 em todos IPs.

### v1.1 (24/05/2026 tarde) — descartada
Baileys embutido + cookie jar + headers anti-bot. Ainda 403.

### v2.0 (24/05/2026 noite)
- Feed CSV de Afiliados (Criativo → Feed de produto)
- Streaming download (suporta feeds 300MB+)
- Cache 6h
- Envio com foto direto do CDN
- 5 disparos/dia (3h em 3h)

### v3.0 (25/05/2026) — **EM PRODUÇÃO** ✅
- Tudo da v2.0 +
- Integração Instagram via Meta Graph API
- Dois perfis (beleza/geral) com cross-promoção
- Page Access Tokens que **nunca expiram**
- Filtragem inteligente de produtos por categoria (palavras-chave de beleza)
- Seleção automática do produto com maior desconto para destaque

---

## 💰 Custo

- Railway Hobby: ~$5/mês
- Shopee Affiliate: grátis
- WhatsApp: grátis (Baileys + conta pessoal)
- Meta Graph API: grátis

**Total: ~R$ 25-30/mês**

---

## 🛠️ Como pedir ajuda (Claude Web ou Code)

**No Claude Web:**
> "Preciso ajustar o shopee-bot da Rosana. Documentação completa no Obsidian: `Shopee Bot - Rosana - Documentação Completa.md`. [problema]"

**No Claude Code (este arquivo já é lido automaticamente):**
> "[descrição do problema/feature]"

Claude já está em contexto.
