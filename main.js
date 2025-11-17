import http from "http";
import fs from "fs/promises";
import { Command } from "commander";
import path from "path";
import request from 'superagent';

const program = new Command();
program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .requiredOption("-c, --cache <path>", "cache directory");
program.parse(process.argv);

const { host, port, cache } = program.opts();
const cache_path = path.resolve(cache);

await fs.mkdir(cache_path, { recursive: true });

const server = http.createServer(async (req, res) => {
  const code = req.url.slice(1); 
  const filePath = path.join(cache_path, `${code}.jpeg`);
  console.log("Server started");
  res.writeHead(200);
  res.end("Welcome to the server");
});

server.listen(port, host, () => {
  console.log(`Proxy server running at http://${host}:${port}/`);
});