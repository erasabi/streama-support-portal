# Updated to node 20 to support File API and ReadableStream for axios/undici compatibility
FROM node:20-alpine

# create directory for app use
RUN mkdir -p /opt/app-server

# create user to run app
RUN adduser -S app-server

# set working directory
WORKDIR /opt/app-server

# add `/opt/<working-dir>/node_modules/.bin` to $PATH
ENV PATH /opt/app-server/node_modules/.bin:$PATH

# install app-server dependencies
COPY ./server/package.json ./server/package-lock.json ./
RUN npm ci --silent --omit=dev

# add app-server and set permissions
COPY ./server/ .
RUN chown -R app-server /opt/app-server
USER app-server

# expose port so the app can be reached
EXPOSE 3000

# start app-server
CMD [ "npm", "run", "start" ]