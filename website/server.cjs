const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 4174);
const root = __dirname;
const statusPath = path.join(root, ".server-status.json");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
});

server.listen(port, () => {
  fs.writeFileSync(
    statusPath,
    JSON.stringify({ url: `http://localhost:${port}/`, pid: process.pid, ready: true }, null, 2),
  );
  console.log(`Solon website: http://localhost:${port}/`);
});

server.on("error", (error) => {
  fs.writeFileSync(
    statusPath,
    JSON.stringify({ error: error.message, pid: process.pid, ready: false }, null, 2),
  );
  process.exitCode = 1;
});
