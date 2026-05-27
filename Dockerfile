FROM node:20-slim

WORKDIR /app

# Dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Força HTTPS em TODA URL que tentar usar SSH ou git://
# (algumas deps do Baileys têm URLs git+ssh:// no package.json e mudam com updates)
RUN git config --global url."https://".insteadOf "ssh://" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git config --global url."https://github.com/".insteadOf "git://github.com/" && \
    git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git+ssh://github.com/"

# Variáveis para evitar prompts de SSH/git durante o build
ENV GIT_TERMINAL_PROMPT=0
ENV GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

# Diretório de dados persistentes (mapeado para Volume no Railway)
RUN mkdir -p /data

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]
