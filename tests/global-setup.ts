import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    adminToken: string;
    databaseUrl: string;
  }
}

function validateTestDatabase() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("Set TEST_DATABASE_URL in .env before running integration tests.");
  const test = new URL(value);
  if (!["postgres:", "postgresql:"].includes(test.protocol) || !/^\/[a-zA-Z0-9_]+_test$/.test(test.pathname)) {
    throw new Error("TEST_DATABASE_URL must point to a PostgreSQL database whose name ends in _test.");
  }
  if (process.env.DATABASE_URL) {
    const development = new URL(process.env.DATABASE_URL);
    // Intentionally reject the same database name even when aliases or credentials differ.
    if (decodeURIComponent(development.pathname) === decodeURIComponent(test.pathname)) {
      throw new Error("Development and test database names must be different.");
    }
  }
  return value;
}

async function availablePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Cannot allocate a test server port.");
  await new Promise<void>((resolveClose, reject) => socket.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}

async function stopServer(server: ChildProcess) {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, "exit");
  // Next dev creates a child worker. Signal its dedicated process group as well.
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== "win32" && server.pid) process.kill(-server.pid, signal);
      else server.kill(signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  kill("SIGTERM");
  const forceStop = setTimeout(() => kill("SIGKILL"), 5000);
  try { await exited; } finally { clearTimeout(forceStop); }
}

export default async function setup(project: TestProject) {
  const databaseUrl = validateTestDatabase();
  const adminToken = randomUUID();
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    ADMIN_API_TOKEN: adminToken,
    NEXT_DIST_DIR: ".next-test",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "development",
  };

  // Apply the committed schema to the test database only; no reset or truncation.
  await promisify(execFile)(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, timeout: 60000 });

  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let spawnError: Error | undefined;
  server.on("error", error => { spawnError = error; });
  const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-12000); };
  server.stdout?.on("data", capture);
  server.stderr?.on("data", capture);

  try {
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Test server exited.\n${output}`);
      try {
        const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) { ready = true; break; }
      } catch { /* Wait for the development server to compile the health endpoint. */ }
      await new Promise(resolveWait => setTimeout(resolveWait, 250));
    }
    if (!ready) throw new Error(`Test server did not become ready.\n${output}`);
    project.provide("baseUrl", baseUrl);
    project.provide("adminToken", adminToken);
    project.provide("databaseUrl", databaseUrl);
    return async () => { await stopServer(server); };
  } catch (error) {
    await stopServer(server);
    throw error;
  }
}
