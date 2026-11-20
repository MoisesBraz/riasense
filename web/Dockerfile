FROM node:24-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# A API vista pelo browser: /api, na mesma origem, encaminhada pelo nginx (ADR-0028).
# Para a web falar com uma API noutro sítio: --build-arg VITE_API_URL=http://<máquina>:8000
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Ficheiros estáticos servidos sem Node em produção, incluindo o mapa offline (ADR-0014).
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
