# ---------- build ----------
FROM node:22-alpine AS builder
WORKDIR /app

# `--include=dev` is load-bearing: the build host may export NODE_ENV=production,
# and npm would then skip devDependencies, leaving `nest` (and tsc) missing.
COPY package*.json ./
RUN npm ci --include=dev --legacy-peer-deps

# `prisma generate` only parses the schema, but the Prisma CLI still insists on a
# syntactically valid connection string. This dummy URL is never connected to.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

COPY . .
RUN npx prisma generate

# nest build can exit 0 while emitting to an unexpected path (dist/src/main.js
# when rootDir is inferred). Assert the entrypoint exists so a broken layout
# fails here rather than as a "Cannot find module" at pod start.
RUN npm run build \
    && test -f dist/main.js \
    || (echo 'ERROR: dist/main.js missing after build — check tsconfig rootDir' && exit 1)

# ---------- runtime ----------
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# node_modules is carried over whole rather than reinstalled with --omit=dev:
# it keeps both the generated Prisma client (which a plain `npm ci` does not
# produce) and the Prisma CLI, which the deploy pipeline invokes for
# `prisma migrate deploy` from this same image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Matches backend.port in colossus.yaml and the nginx /api proxy upstream.
EXPOSE 3001
ENV PORT=3001

CMD ["node", "dist/main.js"]
