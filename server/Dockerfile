# Client UI is built into the server image so the gateway (port 3000) serves API + SPA.
FROM node:20-alpine AS client-build

WORKDIR /build

ARG NODE_ENV=production
ARG STREAMA_ENDPOINT
ARG API_ENDPOINT
ARG ADMIN_SECRETS
ARG SUPERUSER_SECRETS

ENV NODE_ENV=$NODE_ENV \
	STREAMA_ENDPOINT=$STREAMA_ENDPOINT \
	API_ENDPOINT=$API_ENDPOINT \
	ADMIN_SECRETS=$ADMIN_SECRETS \
	SUPERUSER_SECRETS=$SUPERUSER_SECRETS

COPY client/package.json client/package-lock.json ./
RUN npm ci --silent --include=dev

COPY client/ ./
RUN npm run build

# Updated to node 20 to support File API and ReadableStream for axios/undici compatibility
FROM node:20-alpine

RUN mkdir -p /opt/app-server
RUN adduser -S app-server

WORKDIR /opt/app-server

ENV PATH /opt/app-server/node_modules/.bin:$PATH

COPY ./server/package.json ./server/package-lock.json ./
RUN npm ci --silent --omit=dev

COPY ./server/ .
COPY --from=client-build /build/dist ./client-ui

RUN chown -R app-server /opt/app-server
USER app-server

EXPOSE 3000

CMD [ "npm", "run", "start" ]
