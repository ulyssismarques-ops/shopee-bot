# Shopee Bot — Rosana (Achadinhos da Roh)

> **Memória permanente do projeto.** Claude Code lê este arquivo automaticamente ao abrir a pasta. Atualize sempre que algo estrutural mudar.

---

## 🎯 O que é

Bot Node.js que automatiza o trabalho de afiliada da Rosana na Shopee:
- Baixa feed CSV oficial de afiliados (100k+ produtos diários)
- **Curadoria inteligente por score:** prioriza produtos por qualidade base + tendências do momento + **datas comemorativas próximas** (Copa, Namorados, Pais, Natal...) + **estação atual** (verão/inverno). Score 0-200 substitui sort aleatório.
- **Filtros rigorosos:** nota ≥ 4.5, shop rating ≥ 4.7 (ignorado quando campo vazio no feed), preço R$ 10-150, desconto ≥ 20% + blocklist refinada (componentes PC, utilitários domésticos/hidráulica, veículo modelo-específico, nicho foto/hobby)
- **Diversificação por setor (v3.11):** os 5 produtos do WhatsApp representam setores diferentes (beleza, cozinha, casa, moda, tech, pet, bebê, fitness, auto). Em **modo campanha** (Copa/Namorados ≤ 14 dias): 3 slots reservados pra produtos da campanha + 2 slots com diversificação normal.
- **Horários separados por canal** (v3.2):
  - **WhatsApp:** 2x/dia (12h almoço + 20h noite), 5 produtos por disparo = 10 produtos/dia
  - **Instagram @byrosanamatias** (beleza): 1x/dia às 20h (horário de pico)
  - **Instagram @achadinhosdaroh01** (geral): 5x/dia (8h · 11h · 14h · 17h · 20h)
- Envia **foto + legenda** no grupo `GRUPO EXCLUSIVO - Achadinhos da Roh #1` via Baileys
- **Posta 1 produto destaque** por perfil Instagram via Meta Graph API
- **Serve landing page pública** (`/beleza` e `/geral`) com destaque + grid dos últimos 25 produtos + botão WhatsApp clicável — resolve a limitação do Instagram de só ter 1 link clicável por perfil
- Anti-repetição: ring buffer de 300 IDs em `/data/historico.json`

**Em produção desde:** 24/05/2026
**Versão atual:** v3.26 (Alerta visível + retry 30s no ciclo WhatsApp quando desconectado)

---

## 🏗️ Stack

- **Node.js 20** (slim, em Docker)
- **@whiskeysockets/baileys** v6.7.22 — WhatsApp direto, sem Evolution API
- **axios** + **csv-parse** — feed Shopee
- **cron** — scheduler
- **express** — landing page pública
- **qrcode-terminal** — QR no login
- **pino** — logger silencioso
- **Meta Graph API v19.0** — Instagram via Page Access Tokens (não expiram)

**Sem Puppeteer. Sem Postgres. Sem navegador headless.**

---

## 📦 Arquivos (todos na raiz)

| Arquivo | Função |
|---|---|
| `index.js` | Scheduler cron + orquestração do ciclo (WhatsApp + Instagram) + sobe landing page |
| `whatsapp.js` | Baileys: conexão, QR, listagem de grupos, envio texto/imagem |
| `shopee.js` | Download streaming do feed CSV, parsing, filtros, separação beleza/geral |
| `tendencias.js` | **NOVO v3.4** — calendário comercial BR + estações + tendências + função `pontuarProduto()` |
| `instagram.js` | Meta Graph API: publica em 2 perfis (beleza/geral) com Page Tokens |
| `landingpage.js` | Servidor Express com `/beleza` e `/geral` — destaque + grid dos últimos 25 produtos + botão WhatsApp |
| `mensagem.js` | Formato da mensagem padrão Rosana (WhatsApp) |
| `reels.js` | **NOVO v3.18** — gera MP4 de 7s com zoom suave via ffmpeg a partir da imagem do produto |
| `historico.js` | Anti-repetição (ring buffer de 300 IDs) + metadados dos últimos 25 produtos por categoria (alimenta landing page) |
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
| `WHATSAPP_GROUP_INVITE_URL` | `https://chat.whatsapp.com/IDkdxxWLoNm7jt2fvWQ7qc` | link de convite do grupo "Achadinhos da Roh #1" |
| `RAILWAY_PUBLIC_URL` | `https://shopee-bot-production-e39e.up.railway.app` | URL publica do servico — usada pelo Reel pra servir o video pro Instagram |

### Instagram (Meta Graph API)

| Variável | Valor | Comentário |
|---|---|---|
| `INSTAGRAM_BELEZA_USER_ID` | `17841406374262083` | ID Instagram Business da `@byrosanamatias` |
| `INSTAGRAM_BELEZA_TOKEN` | Page Token da Sarah Marques | **Nunca expira** (Page Access Token) |
| `INSTAGRAM_GERAL_USER_ID` | `17841454857520124` | ID Instagram Business da `@achadinhosdaroh01` |
| `INSTAGRAM_GERAL_TOKEN` | Page Token da Achadinhos da Roh | **Nunca expira** (Page Access Token) |

### Landing page

| Variável | Valor | Comentário |
|---|---|---|
| `PORT` | (Railway define automaticamente) | porta HTTP que o Express escuta |

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

## 🌐 Arquitetura Landing Page

### Por que existe

Instagram **só permite 1 link clicável por perfil** (o campo "Website" da bio). Links em legendas/captions **nunca** são clicáveis. Pra ter produto + WhatsApp ambos clicáveis, a bio aponta pra essa landing page intermediária que tem os dois botões.

### Rotas

| URL | Conteúdo |
|---|---|
| `/` | Página índice com 2 botões (beleza / geral) |
| `/beleza` | Bio do `@byrosanamatias` — produtos beleza + WhatsApp |
| `/geral` | Bio do `@achadinhosdaroh01` — produtos gerais + WhatsApp |
| `/health` | Endpoint pro Railway healthcheck |

### Como o usuário fica conhecendo

1. Vê o post no feed Instagram
2. Legenda diz "Toca no link da BIO 👆"
3. Toca no perfil → toca no link azul (URL Railway)
4. Abre a landing page: botão grande verde "Grupo VIP WhatsApp" + destaque atual + grid dos últimos 24 achados
5. Cada produto na grid leva direto pra Shopee — resolve o problema de produto antigo (se viu post de ontem, rola o grid e clica)

### Setup manual (Rosana faz uma vez só)

1. Pegar URL pública do Railway (ex: `shopee-bot-production.up.railway.app`)
2. Instagram `@byrosanamatias` → Editar perfil → campo Site → cola `<railway-url>/beleza`
3. Instagram `@achadinhosdaroh01` → Editar perfil → campo Site → cola `<railway-url>/geral`
4. Salva. Nunca mais precisa mexer — a página atualiza sozinha.

### Como os dados chegam na landing

- `instagram.js::postarNoInstagram()` chama `salvarProdutoPostado(produto, categoria)` após publicar com sucesso
- `historico.js` guarda em `/data/historico.json` nos arrays `postadosBeleza` e `postadosGeral` (máx 25 cada, FIFO)
- `landingpage.js::renderPagina()` lê esse arquivo a cada request e renderiza HTML mobile-first

### Segurança

- HTML escape em todos os campos vindos do produto (nome, link, imagem) — protege XSS
- Express com `x-powered-by` desabilitado
- Imagens com `onerror` pra esconder se 404 (CDN da Shopee é estável mas)

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

## 🔄 Fluxo dos ciclos (v3.2 — separados por canal)

Cada canal tem seu próprio cron e função. O feed CSV é compartilhado via cache de 6h (não baixa toda hora).

### Ciclo WhatsApp (12h e 20h)
1. Verifica `/data/feed_cache.csv` — usa se < 6h
2. Aplica filtros rigorosos: nota ≥ 4.5, shop rating ≥ 4.7 (ignora quando = 0), preço R$ 10-150, nome ≥ 10 chars, **sem palavras/categorias bloqueadas** (componentes PC, utilitários domésticos, peças veículo, nicho foto/hobby)
3. Ordena por score (qualidade + tendência + campanha + estação, score 0-200)
4. Pool de 100 não-enviados → `diversificarSelecao(pool, 5)`:
   - **MODO CAMPANHA** (evento ≤ 14 dias, ex: Copa): 3 produtos com keywords da campanha (top score) + 2 de setores não cobertos
   - **MODO NORMAL**: 1 produto por setor (beleza, cozinha, casa, moda, tech, pet, bebê, fitness, auto)
5. Pra cada produto: encurta link → baixa imagem do CDN → envia foto + legenda no grupo
6. Aguarda 4s entre cada envio
7. Marca os 5 IDs no histórico (ring buffer 300)

### Ciclo Instagram beleza (20h)
1. Mesmo feed do WhatsApp (cache compartilhado)
2. Filtra produtos com palavras de beleza
3. Seleciona o de **maior desconto**
4. Encurta link via TinyURL
5. Posta no `@byrosanamatias` via Meta Graph API (Page Token)
6. Salva metadados em `historico.postadosBeleza` (máx 25) → alimenta landing `/beleza`

### Ciclo Instagram geral (8h, 11h, 14h, 17h, 20h)
Mesma lógica do beleza, mas filtra produtos NÃO-beleza, posta no `@achadinhosdaroh01`, salva em `historico.postadosGeral` → alimenta landing `/geral`

### Quando 20h bate
Os 3 canais disparam ao mesmo tempo (WhatsApp + IG beleza + IG geral). Cada um é independente — se um falhar, os outros continuam. O feed é único (cache).

---

## 🚨 Tarefas de manutenção

### ⏰ Calendário de manutenção (preventivo)

| Quando | O quê | Por quê |
|---|---|---|
| **A cada 60 dias** | Verificar se Instagram ainda posta normalmente nos 2 perfis | Page Access Tokens **em teoria não expiram**, mas Meta muda políticas — vale conferir preventivamente. Tokens criados em **25/05/2026** → próxima verificação **~24/07/2026** |
| **Quando o WhatsApp parar de enviar** | Atualizar `SHOPEE_FEED_URL` | A URL do feed Shopee **muda às vezes** (token expira na conta de afiliada) |
| **Se Instagram parar de postar** | Reemitir Page Tokens (ver passo a passo abaixo) | Token pode ser invalidado se a Rosana revogar acesso do app ou trocar senha |
| **Quando atualizar tokens Meta** | Atualizar `INSTAGRAM_BELEZA_TOKEN` e `INSTAGRAM_GERAL_TOKEN` no Railway | Os tokens novos vão no Railway → Variables, redeploy automático |

⚠️ **Não esperar quebrar pra agir nos tokens.** Marcar lembrete a cada 60 dias pra abrir os 2 perfis Instagram e conferir que o último post saiu certinho. Se der erro, é hora de reemitir.

---

### 1. Atualizar `SHOPEE_FEED_URL` quando expirar

⚠️ **A URL do feed Shopee MUDA periodicamente** — não tem prazo fixo, mas pode acontecer a qualquer momento.

**Sintoma:** logs mostram `❌ Erro ao buscar produtos: status 401/403`. Mensagens param de chegar no grupo WhatsApp e nos Instagrams.

**Fix (3 min):**
1. `affiliate.shopee.com.br` → login com `rosanaro2021`
2. Menu lateral: **Criativo → Feed de produto**
3. Clica em **"Ver Link"** do feed `Shopee Oficial BR - 2022`
4. Copia URL nova
5. Railway → serviço `shopee-bot` → Variables → edita `SHOPEE_FEED_URL`
6. Redeploy automático em ~30s

### 2. Page Tokens do Instagram

⚠️ **Os tokens são "permanentes" em teoria**, mas:
- Meta pode mudar a política e invalidar tokens antigos
- Se a Rosana revogar acesso do app na conta dela, **invalida na hora**
- Se ela trocar senha do Facebook, **pode invalidar**
- **A cada 60 dias é recomendado verificar preventivamente** se ainda postam

**Sintoma de problema:** logs mostram `❌ Instagram [beleza/geral] erro: Invalid OAuth access token`

**Fix (15 min):** Reexecutar fluxo completo de obtenção (ver "Arquitetura Instagram" acima — seção "Como funcionam os tokens"). Resumo:
1. Graph API Explorer → User Access Token curto com as 6 permissões
2. Trocar por long-lived User Token (60 dias) via `/oauth/access_token?grant_type=fb_exchange_token`
3. `GET /me/accounts?fields=name,access_token,instagram_business_account` → retorna Page Tokens
4. Atualizar `INSTAGRAM_BELEZA_TOKEN` e `INSTAGRAM_GERAL_TOKEN` no Railway → Variables
5. Redeploy automático

### 3. Landing page fora do ar

**Sintoma:** clicar no link da bio Instagram retorna erro 502/503 ou timeout.

**Fix:**
1. Railway → serviço `shopee-bot` → aba **Deployments**
2. Confirma se último deploy está com status `Success`
3. Se sim, clica **Redeploy** pra forçar reinício
4. Se logs mostrarem `EADDRINUSE` ou erro de porta: confirma que `PORT` env var está sendo respeitada (Railway define automaticamente, código usa `process.env.PORT || 3000`)
5. Domínio público (Public Networking) deve estar habilitado em Settings → Networking

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

### v3.0 (25/05/2026 manhã)
- Tudo da v2.0 +
- Integração Instagram via Meta Graph API
- Dois perfis (beleza/geral) com cross-promoção
- Page Access Tokens que **nunca expiram**
- Filtragem inteligente de produtos por categoria (palavras-chave de beleza)
- Seleção automática do produto com maior desconto para destaque

### v3.1 (25/05/2026 tarde)
- Tudo da v3.0 +
- **Landing page pública** servida pelo próprio bot (Express)
- Resolve a limitação fundamental do Instagram (só 1 link clicável na bio, nenhum link clicável em legendas)
- 2 rotas: `/beleza` (bio do `@byrosanamatias`) e `/geral` (bio do `@achadinhosdaroh01`)
- Cada página tem: botão verde Grupo VIP WhatsApp + destaque atual + grid dos últimos 25 produtos
- Cada produto clicável vai direto pra Shopee — resolve "e se eu quiser produto de um post antigo?"
- Histórico de produtos postados persistido em `/data/historico.json` (arrays `postadosBeleza` e `postadosGeral`)
- HTML escape em todos os campos — proteção XSS
- Mobile-first, 2 temas (rosa beleza / laranja geral)
- URL pública: `shopee-bot-production-e39e.up.railway.app`

### v3.2 (25/05/2026 noite)
- Tudo da v3.1 +
- **Horários separados por canal** (feedback de clientes — antes era spam: 5 disparos WA/dia, 5 destaques IG/dia em cada perfil)
- **WhatsApp:** 2x/dia (12h almoço + 20h noite), 5 produtos cada = 10/dia (era 25/dia)
- **IG @byrosanamatias** (beleza): 1x/dia às 20h (horário de pico de engajamento em beleza)
- **IG @achadinhosdaroh01** (geral): mantém 5x/dia (8h · 11h · 14h · 17h · 20h)
- Refatoração do `index.js`: `cicloEnvio()` virou `cicloWhatsApp()` + `cicloInstagram(perfil)` independentes
- 3 CronJobs separados, cada canal com try/catch próprio (uma falha não derruba os outros)
- Feed cache continua compartilhado (TTL 6h) — não baixa feed toda hora mesmo com mais cron jobs

### v3.3 (26/05/2026 manhã)
- Tudo da v3.2 +
- **Filtros de qualidade rigorosos** (feedback de clientes: anúncios sem cara de tendência brasileira)
- Thresholds aumentados: nota 4.5, shop rating 4.7, preço R$ 10-150, desconto 20%
- Blocklist de categorias + palavras
- `parsearLinha` agora captura `categoria2` e `categoria3`

### v3.4 (26/05/2026 tarde)
- Tudo da v3.3 +
- **Curadoria inteligente por score** (feedback: anúncios precisam ser "inteligentes", aproveitar feriados, estações, eventos)
- Novo módulo `tendencias.js` com calendário comercial BR (14 datas), estações, lista de tendências gerais e função `pontuarProduto()` retornando score 0-200
- `shopee.js::filtrarQualidade()` ordena por score (era shuffle aleatório)
- Blocklist refinada (acessórios universais de carro passam, modelos específicos bloqueiam)

### v3.5 (26/05/2026 noite)
- Tudo da v3.4 +
- **Chamadas contextuais nas mensagens** (feedback: "se tiver no anúncio por essas exclamações, tipo 'copa do mundo vem aí'")
- Nova função `gerarChamada(produto, canal)` em `tendencias.js`:
  - Verifica se produto bate com evento próximo (≤ 21 dias — campanha começa ~3 semanas antes do evento, intensifica nos últimos 14d, some no dia seguinte) → retorna chamada do evento
  - Senão, verifica estação atual OU próxima (2 meses pra frente) → chamada de estação
  - Senão, verifica tendência geral → chamada de trending
  - Senão, chamada padrão "🔥 OFERTA IMPERDÍVEL"
- **3 tons por canal** (cada evento/estação tem 3 variações):
  - `whatsapp`: tom direto, exclamativo, com 🔥
  - `geral` (@achadinhosdaroh01): tom conversacional, "bora", "achadinho"
  - `beleza` (@byrosanamatias): foco em estética/autocuidado, mesmo em eventos não-beleza
- Mapeamento completo: 14 eventos + 4 estações + trending + default = ~57 variações de chamada
- `mensagem.js` (WhatsApp) e `instagram.js` (ambos perfis) usam `gerarChamada()` na abertura
- Exemplos reais (hoje, 26/05/2026):
  - Cooler Brasil → "🏆 COPA DO MUNDO VEM AÍ! Achadinho de torcedor 🇧🇷"
  - Kit Casal → "💕 Dia dos Namorados vem aí! Olha que ideia 🔥"
  - Manta Inverno → "❄️ INVERNO VEM AÍ! Esquenta com essa promo 🔥"
  - Caneta genérica → "🔥 OFERTA IMPERDÍVEL 🔥" (default)
- Produto cuja categoria/estética não bate evento próximo cai no default — mantém coerência

### v3.6 (26/05/2026 noite tarde)
- Tudo da v3.5 +
- **Preferência por produtos nacionais** (feedback: produtos BR chegam em 3-7 dias, internacional 30+ dias)
- `parsearLinha` captura `cb_option` do feed → identifica se é cross-border (internacional)
- `pontuarProduto` aplica **-30 pontos** pra internacional
- Internacional ainda pode vencer se "muito top" (evento +50 ou trending +30 compensam)
- `filtrarQualidade` loga contagem nacional vs internacional

### v3.7 (26/05/2026 noite)
- Tudo da v3.6 +
- **Badge "🇧🇷 Envio Rápido" na landing page** — destaque visual pra produtos nacionais
- `historico.js::salvarProdutoPostado` persiste o campo `crossBorder`
- `landingpage.js` mostra 3 elementos visuais pra produto nacional (badge canto, faixa, bandeirinha grid)
- Cores das gradientes seguem a bandeira do Brasil: verde #009b3a → amarelo #ffd700

### v3.8 (26/05/2026 noite tarde)
- Tudo da v3.7 +
- **"🇧🇷 Vendedor brasileiro · Entrega em 3-7 dias" também nas mensagens** (feedback: "sim pode adicionar")
- `mensagem.js` (WhatsApp): adiciona linha extra entre preço e CTA pra produto nacional
- `instagram.js` (ambos perfis): adiciona linha extra na caption pra produto nacional
- **Fontes aumentadas em toda a landing page** (feedback: "achei muito pequeno as fontes"):
  - Título: 20px → 26px
  - Subtítulo: 13px → 15px
  - Botão WhatsApp: 16px/12px → 19px/14px
  - Section titles: 14px → 17px
  - Nome do produto destaque: 14px → 17px
  - Preço destaque: 24px → 30px
  - Botão COMPRAR: 15px → 18px
  - Nome do produto no grid: 12px → 14px
  - Preço no grid: 14px → 16px
  - Badge ENVIO RÁPIDO: 11px → 13px
  - Faixa Vendedor brasileiro: 12px → 14px
  - Badge desconto destaque: 13px → 15px
  - Badge desconto grid: 11px → 13px
  - Logo: 76px → 90px
  - Padding e margins proporcionalmente ajustados
- Internacionais não mostram linha nem badge — só ausência (sem indicador negativo)

### v3.9 (26/05/2026)
- Tudo da v3.8 +
- **Fix crítico: filtro `shopRating` eliminava 100% dos produtos** — campo `shop_rating` no feed CSV vem vazio na maioria dos produtos (retorna 0 ao parsear). Filtro alterado para `(p.shopRating === 0 || p.shopRating >= MIN_SHOP_RATING)`: só rejeita quando o dado existe e está abaixo do threshold.

### v3.10 (26/05/2026)
- Tudo da v3.9 +
- **Blocklist de componentes PC** — produtos de informática nicho (processador, placa-mãe, GPU, RAM DDR, SSD M.2, fonte ATX, gabinete PC, etc.) adicionados a `PALAVRAS_BLOQUEADAS` e `CATEGORIAS_BLOQUEADAS` (`computers`, `computer peripherals`, `networking`)

### v3.11 (26/05/2026)
- Tudo da v3.10 +
- **Diversificação por setor** — `diversificarSelecao()` substituiu seleção sequencial. 9 setores definidos (`SETORES_KEYWORDS`): beleza, cozinha, casa, moda, tech, pet, bebê, fitness, auto. WhatsApp passa pool de 100 produtos; `diversificarSelecao` garante 1 produto por setor diferente (+ fill se pool pequeno).

### v3.12 (26/05/2026)
- Tudo da v3.11 +
- **Modo campanha no seletor** — quando evento ≤ 14 dias (`CALENDARIO_BR`), `diversificarSelecao` entra em MODO CAMPANHA: 3 de 5 slots reservados pra produtos com keywords da campanha (top score, sem restrição de setor); 2 slots com diversificação normal.
- **Fix keywords Copa do Mundo** — removidas `'verde amarelo'` e `'brasil'` (solo) que capturavam lâmpadas LED verde/amarela e produtos genéricos com "brasil" no nome. Keywords agora são específicas: `'seleção brasileira'`, `'camisa brasil'`, `'camiseta brasil'`, `'bandeira brasil'`, `'cbf'`, `'bola futebol'`, `'chuteira'`, `'futebol brasil'`, `'churrasco'`, `'isopor'`, `'caixa térmica'`, `'copo cervejaria'`, `'kit churrasco'`, `'cooler'`.

### v3.13 (26/05/2026)
- Tudo da v3.12 +
- **Copa do Mundo cobre torneio inteiro** — antes: entrada única em `CALENDARIO_BR` para 11/06 (abertura) fazia o boost expirar no dia 12/06. Agora: segunda entrada em 19/07 (final do torneio). Boost copa ativo em dois períodos: 21/05–11/06 (abertura) e 28/06–19/07 (final). Gap 12–27/06 sem boost aceito como aceitável.

### v3.14 (26/05/2026)
- Tudo da v3.13 +
- **Blocklist utilitários domésticos/industriais** — itens bloqueados mesmo quando keyword de campanha bate (ex: "capa botijão de gás" batia keyword 'churrasco'). Adicionados a `PALAVRAS_BLOQUEADAS`: botijão, mangueira gás, registro gás, cano pvc, cano hidráulico, furadeira, parafusadeira, betoneira, compressor de ar, disjuntor, quadro elétrico, caixa d'água, vaso sanitário, pia, chuveiro elétrico, e ~30 outros itens de plomeria/elétrica/construção.

### v3.15 (26/05/2026)
- Tudo da v3.14 +
- **Comissão no score** — `shopee.js` captura `commission_rate` do CSV; `tendencias.js` aplica boost +8/+15/+25 pts por faixa (>=5%, >=7%, >=10%). Produtos com comissão alta sobem no ranking.
- **Hashtags por categoria no Instagram** — `instagram.js` detecta categoria do produto (beleza, cozinha, casa, moda, tech, pet, bebê, fitness, auto) e adiciona hashtags específicas além das base fixas.
- **Convite rotativo no WhatsApp** — `mensagem.js` exibe PS com link de convite a cada 3 mensagens (3 variações rotativas). Env var: `WHATSAPP_GROUP_INVITE_URL`.
- **WhatsApp Status** — `whatsapp.js::postarStatus()` posta o produto destaque do ciclo como Story no WhatsApp (status@broadcast), aparece pra todos os contatos da Rosana. Chamado no `cicloWhatsApp()` após os 5 envios do grupo.

### v3.16 (26/05/2026)
- Tudo da v3.15 +
- **Stories Instagram** — `instagram.js::postarStory()` usa `media_type=STORIES` na Meta Graph API. Chamado em `cicloInstagram()` logo após o post no feed. Cada ciclo de Instagram agora posta feed + story (aparece 24h no topo dos seguidores).

### v3.17 (26/05/2026)
- Tudo da v3.16 +
- **Carrossel top 3 por categoria** — `instagram.js::postarCarrossel()` cria 3 containers individuais e agrupa num CAROUSEL (Meta Graph API). `cicloInstagram()` usa carrossel quando há 2+ produtos disponíveis. Caption lista os 3 produtos com preço e desconto. Mais saves + tempo de tela = favorecido pelo algoritmo.
- **`selecionarTopN(produtos, n)`** — função auxiliar que ordena por desconto percentual e retorna os top N com imagem.

### v3.18 (26/05/2026)
- Tudo da v3.17 +
- **Reels Instagram via ffmpeg** — `reels.js` baixa imagem do CDN Shopee e roda ffmpeg para gerar MP4 de 7s com efeito Ken Burns (zoom suave 1.0→1.3). `instagram.js::postarReel()` serve o video via Express (`/reel/:file`) e posta como `media_type=REELS` na Meta Graph API. Aguarda 45s fixos pra processamento de video.
- **Dockerfile**: `ffmpeg` adicionado ao apt-get install.
- **landingpage.js**: rota `/reel/:file` serve videos temporários de `/data/` pra Meta API buscar.
- **Horário dos Reels**: 10h/dia (1x por perfil, antes dos ciclos de feed/story).
- **Env var**: `RAILWAY_PUBLIC_URL` (URL pública do Railway — usada pra montar o `video_url`).

### v3.19 (27/05/2026 manhã)
- Tudo da v3.18 +
- **Fix do substring matching** que estava deixando bugs grotescos passarem:
  - "coração" matchava "decoração" → **Luzes de Natal pegavam chamada "Bora surpreender o amor"** 😱
  - "amor" poderia matchar "amortecedor", "led" qualquer LED, etc.
  - Nova função `palavraEstaNoNome(palavra, nome)` em `tendencias.js` usa regex com word-boundary manual `(^|[^a-zà-ú0-9])` que funciona com chars acentuados (`\b` do JS não funciona com `ç`/`ã`)
  - Aplicada em `pontuarProduto` e `gerarChamada` — substitui todos os `.includes(p)`
- **Penalidade -40 pra produto de evento muito longe** (>60 dias):
  - Luzes de Natal em maio (Natal 213d longe): score cai de 64 → 24 → vai pro fundo do ranking
  - Antes não havia nada barrando isso, agora produto sazonal fora de hora morre
- **`cooler` removido das palavras da Copa e Verão**, substituído por `cooler térmico` e `cooler de bebida`:
  - "Cooler Fan RGB Gamer" não pega mais chamada "COPA DO MUNDO VEM AÍ!" 🤦
  - "led" sozinho também removido das tendências (matchava qualquer eletrônico com LED)
- **Bloqueio de spam de busca em `shopee.js`** — regex em `PADROES_SPAM`:
  - `^top \d+ achado` (ex: "Top 3 achados do dia: 1, Kit...")
  - `^top \d+ do dia`, `^top \d+ mais`, `^\d+°? lugar`, `^melhor[es]? \d+`
  - Vendedores Shopee fazem isso pra gamificar a busca — virou critério de bloqueio

### v3.26 (28/05/2026 manhã) — **EM PRODUÇÃO** ✅ — Alerta WhatsApp desconectado
Usuário reportou que último disparo no grupo WA foi 27/05 12h. IG continuou funcionando (8h do 28/05 saiu), então o problema é específico do WhatsApp.

- Nova função `whatsappConectado()` em `whatsapp.js` exporta status `isConnected`
- Nova função `aguardarConexao(timeoutMs)` poll a cada 1s até conectar ou timeout
- `cicloWhatsApp()` agora checa explicitamente antes de tentar enviar:
  - Se desconectado, mostra ALERTA destacado nos logs (`⚠️` × 20)
  - Aguarda até 30s pra reconexão automática do Baileys
  - Se ainda desconectado, mostra ❌ × 40 com diagnóstico das causas prováveis
  - Aborta o disparo sem trycatch silencioso
- Antes: erro de "WhatsApp não está conectado" caía no catch e logava só 1 linha. Agora é destacado e diagnóstico.

### v3.25 (28/05/2026 manhã) — Fix BOM no CSV
Descoberto olhando logs do disparo de 8h em 28/05:
```
🔍 TODAS as chaves: ["﻿shop_rating", ...]   ← invisível mas tem BOM antes
📈 Shop rating ≥ 4.7:  0                    ← ZERO produtos passavam!
```
- Feed CSV da Shopee vem com UTF-8 BOM (`﻿`) no início. Resultado: primeira coluna no objeto fica `r['﻿shop_rating']`, e `r.shop_rating` retorna `undefined`.
- shopRating sempre era 0 → filtro de loja confiável quebrado desde sempre
- Salvava só pelo fallback v3.21 (`shopRating=0 && avaliacao ≥ 4.7`), mas perdíamos discriminação entre lojas 4.9 e 4.7
- Fix: `.replace(/^﻿/, '')` ao ler o CSV antes de parsear
- Próximos disparos vão mostrar `Shop rating ≥ 4.7: X` com X > 0

### v3.24 (27/05/2026 tarde) — Bloqueio erótico + Status WA 1x + Health check
- **Bloqueio de conteúdo erótico** (feedback: "nao quero que va uma coisa erotica nas publicaçoes"):
  - Categoria `'adult', 'sex toys', 'intimate items', 'erotic', 'adult products'` adicionada à CATEGORIAS_BLOQUEADAS
  - 40+ palavras adicionadas à PALAVRAS_BLOQUEADAS: vibrador, consolo, dildo, sex toy, masturbador, plug anal, lubrificante íntimo, gel lubrificante, fantasia erótica, lingerie sexy, kit sexy, fetiche, etc.
  - Termos cuidadosos pra não barrar produto legítimo (kit casal Namorados passa, almofada casal passa)
- **M3: Status WA reduzido a 1x/dia** (era 2x — feedback "nao saturar contatos"):
  - Cycle WA continua rodando 12h+20h
  - Mas `postarStatus` só dispara se hora == 20h
  - 12h vira disparo silencioso de grupo (só mensagens, sem Status)
- **M1: Health check diário** (feedback: "monitoramento ativo"):
  - Cron diário às 23h chama `healthCheck()`
  - Lê `contarPostsRecentes(24)` do historico.js (nova função)
  - Reporta no log com `═══════` destacado:
    - IG geral: esperado ≥4 posts/24h
    - IG beleza: esperado ≥1 post/24h
    - WhatsApp: contador de IDs no ring buffer (sem timestamp individual)
  - Se algo falhou → marca `❌ FALHOU` e `🔴 ALGO FALHOU`
  - Se tudo ok → `🟢 TUDO OK — bot rodando saudável`
  - Visível no log do Railway nas 23h em diante

### v3.23 (27/05/2026 manhã) — Hashtags rotativas + test.js local
- **M2: Hashtags rotativas** (instagram.js) — Instagram pune contas que repetem mesmas hashtags todo dia. Solução: 3 conjuntos por categoria (HASHTAGS_BASE_*, HASHTAGS_EXTRAS) rotacionados por `dia do mês % 3`.
  - Dia 1, 4, 7, 10… → conjunto A
  - Dia 2, 5, 8, 11… → conjunto B
  - Dia 3, 6, 9, 12… → conjunto C
- **M4: .env.example atualizado** com `RAILWAY_PUBLIC_URL` e `WHATSAPP_GROUP_INVITE_URL` (faltavam). Também reorganizado com seções claras + comentário sobre `TESTAR_AGORA`.
- **M5: Script `test.js` local** — permite validar o bot SEM disparar pra produção:
  - `node test.js` → usa 12 produtos sintéticos (casos de bug histórico cobertos)
  - `node test.js --csv=/path/to/feed.csv` → usa feed real (copie do Railway)
  - `node test.js --data=2026-11-15` → simula data específica (ex: Black Friday)
  - `node test.js --top=20` → mostra top N (default 10)
  - Output: top ranking com score/chamada/categoria + exemplo da mensagem WhatsApp do top 1 + sumário de produtos rejeitados por motivo
  - **Vale ouro pra validar mudanças antes de pushar** — teria pego bugs como "luzes de natal" e "ovo de páscoa" antes de virem em produção

### v3.22 (27/05/2026 manhã) — Páscoa + palavras ambíguas
Postou no WA: "💕 Dia dos Namorados vem aí! Forma Silicone Chocolate Ovo Coelho 811 BWB" — ovo de Páscoa com chamada de Namorados!

Causa: "chocolate" estava em Namorados palavras. Single word → matchava qualquer produto com chocolate. Adicionalmente, Páscoa não estava no calendário — produtos de Easter passavam sem ser detectados como fora-de-estação.

Fixes:
- **Removidos `chocolate` e `pelúcia` de Namorados** — ambíguos demais. Substituídos por `caixa bombom`, `kit bombom` (mais específico).
- **Páscoa adicionada ao CALENDARIO_BR** com 21 palavras-chave (ovo páscoa, forma chocolate, ovo coelho, chocolate ovo, etc.). Páscoa 2027 está 314 dias longe → produtos Easter pegam -40 penalty.
- **Trending boost NÃO aplica se evento longe penalizou** ([tendencias.js:pontuarProduto](tendencias.js)): antes, "forma silicone" salvava Easter forms (+30 trending compensava -40 penalty). Agora os dois efeitos não se anulam — penalidade vence.

Resultado dos testes:
- Forma Silicone Ovo Coelho: era 95 → agora **25** (default)
- Forma Silicone Bolo (legítima): mantém **95** ✅
- Kit Casal real: mantém **92** ✅ (Namorados)
- Luzes de Natal: **24** (já estava penalizado, sem trending)

### v3.21 (27/05/2026 manhã) — Carrossel sem re-selecionar + TESTAR_AGORA cobre Reels + shopRating=0
- B8: postarCarrossel aceita lista preparada (não re-seleciona top3 internamente)
- B9: TESTAR_AGORA agora dispara cicloReels também
- B10: shopRating=0 exige avaliacao ≥ 4.7 como compensação

### v3.20 (27/05/2026 manhã) — Análise profunda + 6 fixes críticos
Análise revelou que **Reels e Stories NUNCA funcionaram** desde a v3.16/v3.18 — o usuário só descobriu agora olhando o Instagram. Causas encontradas:

- **B1 — Rota Express engolida** ([landingpage.js](landingpage.js)): `app.get('/reel/:file')` estava declarada DEPOIS do `app.use((req, res) => res.redirect('/'))`. Como Express respeita ordem, o catch-all engolia todos os requests. Resultado: Meta API tentava baixar `/reel/...` e recebia HTTP 302 (redirect) → Reel NUNCA postava. Confirmado via `curl` ao vivo: respondia 302.
  - Fix: rotas `/reel/:file` e `/story/:file` movidas ANTES do catch-all
- **B2 — Reel em 1080x1080 (square)** ([reels.js](reels.js)): Meta API rejeita Reels que não sejam 9:16 (1080x1920 vertical).
  - Fix: ffmpeg agora gera 1080x1920 com produto centralizado sobre fundo desfocado (mesma imagem com `gblur sigma=30`)
- **B3 — Reel sem audio track**: Meta API exige audio em Reels — sem audio o algoritmo despreza.
  - Fix: adicionado `-f lavfi -i anullsrc` (audio silencioso AAC) com `-shortest`
- **B4 — Story com imagem 1:1**: Meta API exige 9:16 pra Stories. Imagem da Shopee é quadrada.
  - Fix: nova função `gerarImagemStory()` em `reels.js` gera JPEG 1080x1920 e o `postarStory` agora usa URL `/story/story_<perfil>.jpg`
- **B5 — `diversificarSelecao` ainda usava substring**: mesmo bug do "coração em decoração", afetava seleção em modo campanha.
  - Fix: substituído `.includes(kw)` por `palavraEstaNoNome(kw, nome)`
- **B6 — Hashtag bugada `#treinoem casa`**: virava 2 hashtags quebradas.
  - Fix: removido espaço → `#treinoemcasa`
- **B7 — Erros silenciados com `console.warn`**: por isso ninguém sabia que Reels/Stories falhavam.
  - Fix: `console.error` com `❌` e código de erro Meta API nos pontos críticos (postarStory, postarCarrossel, postarReel)
- Log de boot atualizado: era "v3.15" há tempos → agora "v3.20"
- Rotas `/reel/:file` e `/story/:file` agora também têm `Cache-Control: max-age=300` (Meta cacheia 5min)

---

## 🌍 URLs em produção

- Página índice: https://shopee-bot-production-e39e.up.railway.app/
- Bio do @byrosanamatias: https://shopee-bot-production-e39e.up.railway.app/beleza
- Bio do @achadinhosdaroh01: https://shopee-bot-production-e39e.up.railway.app/geral
- Healthcheck: https://shopee-bot-production-e39e.up.railway.app/health

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

