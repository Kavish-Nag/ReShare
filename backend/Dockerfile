FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# RDS requires TLS; Node does not trust the RDS CA by default.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca.pem
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY db ./db
EXPOSE 3000
USER node
CMD ["npm", "start"]
