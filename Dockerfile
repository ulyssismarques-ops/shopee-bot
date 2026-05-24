FROM node:20-slim

WORKDIR /app

# Dependências necessárias: git (Baileys baixa um pacote do GitHub),
# python3/make/g++ (compilação de módulos nativos)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Diretório de dados persistentes (mapeado para Volume no Railway)
RUN mkdir -p /data

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
