FROM node:20-slim

WORKDIR /app

# Diretório de dados persistentes (mapeado para Volume no Railway)
RUN mkdir -p /data

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
