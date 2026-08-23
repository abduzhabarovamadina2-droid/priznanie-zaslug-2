const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const port = Number(process.argv[3] || 8010);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    if (urlPath === '/') {
      urlPath = '/Признание заслуг.html';
    }

    const filePath = path.join(root, urlPath);

    if (!filePath.startsWith(path.resolve(root))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);

  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('=================================');
  console.log('Frontend запущен');
  console.log(`URL: http://localhost:${port}`);
  console.log(`Папка: ${root}`);
  console.log('=================================');
  console.log('');
});
