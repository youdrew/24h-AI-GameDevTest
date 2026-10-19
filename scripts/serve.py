"""Preview the Pages artifact at its production project path."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent / 'dist'
PREFIX = '/24h-AI-GameDevTest/'


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
    }

    def send_head(self):
        path = urlsplit(self.path).path
        if path in ('/', PREFIX[:-1]):
            self.send_response(302)
            self.send_header('Location', PREFIX)
            self.end_headers()
            return None
        if not path.startswith(PREFIX):
            self.send_error(404)
            return None
        self.path = self.path[len(PREFIX) - 1:]
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    if not (ROOT / 'index.html').is_file():
        parser.error('Run npm run build before starting the preview.')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    print(f'Tile Explorer: http://localhost:{args.port}{PREFIX}', flush=True)
    server.serve_forever()
