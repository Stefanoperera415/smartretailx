FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

EXPOSE 3006

CMD ["npm", "run", "start"]
