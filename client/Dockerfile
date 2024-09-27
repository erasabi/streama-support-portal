FROM node:16-alpine

# create directory for app use
RUN mkdir -p /opt/app-client

# create user to run app
RUN adduser -S app-client

# set working directory
WORKDIR /opt/app-client

# add `/opt/app-client/node_modules/.bin` to $PATH
ENV PATH /opt/app-client/node_modules/.bin:$PATH
ENV NODE_ENV=$NODE_ENV
ENV STREAMA_ENDPOINT=$STREAMA_ENDPOINT
ENV API_ENDPOINT=$API_ENDPOINT
ENV ADMIN_SECRETS=$ADMIN_SECRETS
ENV SUPERUSER_SECRETS=$SUPERUSER_SECRETS

# install app-client dependencies
COPY ./client/package.json ./
RUN npm install --silent

# add app-client
COPY ./client/ ./
RUN chown -R app-client /opt/app-client

USER app-client

# build app-client
RUN npm run build

# start app-client
CMD ["npm", "run", "start:prod"]