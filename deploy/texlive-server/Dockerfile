FROM node:20-alpine

WORKDIR /app

COPY server.mjs ./

ENV PORT=8080
ENV NODE_ENV=production
ENV CACHE_DIR=/data/cache

VOLUME ["/data/cache"]

EXPOSE 8080

CMD ["node", "server.mjs"]
