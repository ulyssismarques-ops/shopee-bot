FROM node:20-slim

WORKDIR /app

# Dependências do sistema necessárias para o npm install
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Força o git a usar HTTPS em vez de SSH
# (algumas dependências do Baileys têm URLs git+ssh:// no package.json)
RUN git config --global --add url."https://github.com/".insteadOf "git@github.com:" && \
    git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global --add url."https://github.com/".insteadOf "git+ssh://git@github.com/" && \
    git config --global --add url."https://github.com/".insteadOf "git://github.com/"

# Diretório de dados persistentes (mapeado para Volume no Railway)
RUN mkdir -p /data

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

CMD ["node", "index.js"]
