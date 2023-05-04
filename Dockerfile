FROM node:18-alpine

# Install app dependencies
RUN apk update && apk add --no-cache bash 
COPY package.json /src/package.json
RUN cd /src; npm install

COPY . /src
WORKDIR /src
RUN chown -R node:node /src
EXPOSE  8100

# change user
#USER node

CMD ["node", "index.js"]
