import express from 'express';
import * as fs from "fs/promises";
import { program } from "commander";
import path from "path";
import { fileURLToPath } from 'url';
import multer from 'multer';

program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port")
  .requiredOption("-c, --cache <path>", "cache directory");
program.parse(process.argv);

const options = program.opts();

if (!options.host || !options.port || !options.cache) {
  console.error('Error : please specify the neccesary input parameters! (host, port and cache folder)');
  process.exit(1);
}

await fs.mkdir(cache_path, { recursive: true });

const app = express();

let inventory [];

app.get("/inventory", (req, res) => {
    res.json();
});

app.listen(port, host, () => {
  console.log(`Proxy server running at http://${host}:${port}/`);
});