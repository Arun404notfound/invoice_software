"use strict";

const net = require("node:net");

/**
 * Finds a free TCP port on 127.0.0.1 by binding to port 0 and reading back
 * what the OS assigned. Small race window between close and reuse, which is
 * fine for a single desktop process starting a handful of local services.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function findFreePorts(count) {
  const ports = [];
  for (let i = 0; i < count; i++) {
    // Sequentially, so we don't hand out the same port twice.
    ports.push(await findFreePort());
  }
  return ports;
}

module.exports = { findFreePort, findFreePorts };
