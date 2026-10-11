import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function imageProxyPlugin() {
  return {
    name: 'solethief-image-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/proxy-image')) {
          return next();
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        try {
          const parsed = new URL(req.url, 'http://localhost');
          let targetUrl = parsed.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
          }

          targetUrl = targetUrl.trim();

          const isPinterestPage = /(?:pinterest\.[a-z.]+\/pin\/|pin\.it\/)/i.test(targetUrl) ||
            (/pinterest\.[a-z.]+/i.test(targetUrl) && !/i\.pinimg\.com/i.test(targetUrl));

          let resolvedImageUrl = targetUrl;

          const defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          };

          if (isPinterestPage) {
            const pageRes = await fetch(targetUrl, {
              headers: defaultHeaders,
              redirect: 'follow',
            });

            if (!pageRes.ok) {
              throw new Error(`Pinterest returned HTTP ${pageRes.status}`);
            }

            const html = await pageRes.text();

            // Extract candidate image URLs
            const candidates = [];

            const ogMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
              html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (ogMatch?.[1]) candidates.push(ogMatch[1].trim());

            const jsonLdMatches = html.matchAll(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
            for (const match of jsonLdMatches) {
              try {
                const data = JSON.parse(match[1]);
                const img = data.image || (Array.isArray(data['@graph']) && data['@graph'].find(g => g.image)?.image);
                if (typeof img === 'string') candidates.push(img.trim());
                else if (Array.isArray(img) && typeof img[0] === 'string') candidates.push(img[0].trim());
              } catch {
                // Ignore JSON errors
              }
            }

            const pinImgMatches = html.matchAll(/https:\/\/i\.pinimg\.com\/(originals|[0-9]+x)\/[a-f0-9/._-]+\.(?:jpe?g|png|webp)/gi);
            for (const match of pinImgMatches) {
              if (match[0]) candidates.push(match[0]);
            }

            if (candidates.length === 0) {
              throw new Error('No image found on Pinterest page');
            }

            // Find best candidate
            let selectedCandidate = candidates[0];
            for (const c of candidates) {
              if (c.includes('/originals/')) {
                selectedCandidate = c;
                break;
              }
            }

            // Try upgrading 736x to originals
            if (selectedCandidate.includes('/736x/') || selectedCandidate.includes('/564x/')) {
              const originalsUrl = selectedCandidate.replace(/\/(?:736x|564x)\//, '/originals/');
              try {
                const checkRes = await fetch(originalsUrl, { method: 'HEAD', headers: defaultHeaders });
                if (checkRes.ok) {
                  selectedCandidate = originalsUrl;
                }
              } catch {
                // Keep 736x if originals check fails
              }
            }

            resolvedImageUrl = selectedCandidate;
          } else if (targetUrl.includes('i.pinimg.com/') && (targetUrl.includes('/736x/') || targetUrl.includes('/564x/'))) {
            const originalsUrl = targetUrl.replace(/\/(?:736x|564x)\//, '/originals/');
            try {
              const checkRes = await fetch(originalsUrl, { method: 'HEAD', headers: defaultHeaders });
              if (checkRes.ok) {
                resolvedImageUrl = originalsUrl;
              }
            } catch {
              // Keep original
            }
          }

          // Fetch the final image
          const imgRes = await fetch(resolvedImageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
          });

          if (!imgRes.ok) {
            throw new Error(`Failed to download image: HTTP ${imgRes.status}`);
          }

          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          let rawContentType = imgRes.headers.get('content-type') || 'image/jpeg';
          let contentType = rawContentType.split(';')[0].trim().toLowerCase();

          // Fallback mime detection
          if (!contentType.startsWith('image/')) {
            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
              contentType = 'image/png';
            } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
              contentType = 'image/jpeg';
            } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
              contentType = 'image/gif';
            } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
              contentType = 'image/webp';
            } else {
              contentType = 'image/jpeg';
            }
          }

          const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            dataUrl,
            resolvedUrl: resolvedImageUrl,
            bytes: buffer.length,
            contentType,
          }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: err.message || 'Image download failed',
          }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
  server: {
    host: true,
    allowedHosts: true,
  },
})
