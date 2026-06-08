# Base image with Node.js and Chromium for Apify
FROM apify/actor-node-puppeteer-chrome:22

# Copy package files first for better caching
COPY --chown=myuser package*.json ./

# Install npm deps (production only)
RUN npm install --omit=dev --omit=optional \
    && echo "Installed npm packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy TypeScript config + sources, then build
COPY --chown=myuser tsconfig.json ./
COPY --chown=myuser src ./src

# Install dev deps for build, then prune
RUN npm install --no-save typescript@5.5 \
    && npx tsc \
    && rm -rf src node_modules/typescript

CMD ["node", "dist/main.js"]
