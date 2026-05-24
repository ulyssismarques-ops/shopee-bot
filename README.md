# Shopee Bot — Achadinhos da Roh 🛍️

Bot que busca produtos em promoção na Shopee, gera links de afiliado e posta automaticamente no grupo do WhatsApp.

## Horários de envio
8h · 10h · 12h · 14h · 16h · 18h · 20h (fuso SP)

---

## Deploy no Railway — passo a passo

### 1. Deletar serviços antigos (Evolution API + Postgres)
No dashboard Railway → selecione cada serviço → Settings → Delete Service

### 2. Criar repositório GitHub
```
Nome: shopee-bot
Visibilidade: Private
```
Faça upload dos 7 arquivos (ou git push).

### 3. Criar projeto no Railway
- New Project → Deploy from GitHub repo → seleciona `shopee-bot`
- Railway detecta o Dockerfile automaticamente

### 4. Adicionar Volume (sessão WhatsApp persiste entre redeploys)
- No serviço → Storage → Add Volume
- Mount Path: `/data`

### 5. Adicionar variáveis de ambiente
Settings → Variables → Raw Editor → cole:
```
AUTH_PATH=/data/baileys_auth
HISTORICO_PATH=/data/historico.json
TZ=America/Sao_Paulo
```
Não adicione WHATSAPP_GROUP_ID ainda (vai pegar nos logs).

### 6. Deploy e QR Code
- O serviço sobe → abra Logs
- Um QR code ASCII aparece nos logs
- Abra WhatsApp da Rosana → Dispositivos conectados → Conectar dispositivo → Escaneie o QR

### 7. Pegar ID do grupo
Após escanear, os logs mostram todos os grupos:
```
📋 GRUPOS QUE O BOT PARTICIPA:
• GRUPO EXCLUSIVO - Achadinhos da Roh #1
  ID: 120363XXXXXXXXXX@g.us
```
Copie o ID.

### 8. Finalizar configuração
- Variables → adiciona `WHATSAPP_GROUP_ID=120363XXXXXXXXXX@g.us`
- Railway faz redeploy automático
- ✅ Bot funcionando

---

## Links de afiliado

### Opção A — API oficial (recomendado)
Acesse https://affiliate.shopee.com.br → Ferramentas → API
Configure `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_SECRET`

### Opção B — af_id simples (mais fácil)
Gere qualquer link pelo painel da Shopee → copie o parâmetro `af_id=XXXX`
Configure `SHOPEE_AF_ID=XXXX`

---

## Testar envio manualmente
Em `index.js`, descomente a última linha do `main()`:
```js
await cicloEnvio();
```
Redeploy → bot envia imediatamente.

---

## Arquivos
| Arquivo | Função |
|---|---|
| `index.js` | Entrada + scheduler cron |
| `whatsapp.js` | Conexão Baileys + envio |
| `shopee.js` | Busca produtos + links afiliado |
| `mensagem.js` | Formata mensagem padrão Rosana |
| `historico.js` | Evita repetir produtos |
| `package.json` | Dependências |
| `Dockerfile` | Build Railway |
