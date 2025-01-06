FROM docker.io/library/node:22-alpine

WORKDIR /usr/local/WA2DC

ENV WA2DC_TOKEN=CHANGE_THIS_TOKEN

COPY . .

RUN apk add --no-cache tini \
    && corepack enable \
    && pnpm install --frozen-lockfile --production

ENTRYPOINT [ "tini", "--", "docker-entrypoint.sh" ]

CMD [ "node", "src/index.js" ]