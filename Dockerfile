FROM node:16.13-alpine3.12

WORKDIR /server/

COPY . .
RUN npm i
RUN npm run build

EXPOSE 8080

CMD ["node", "dist/index.js"]
