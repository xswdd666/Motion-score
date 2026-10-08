"""Double-click launcher: start a fresh process, pick a free port if necessary."""
import webbrowser
import threading
import json
import urllib.request
from pathlib import Path
from mock_api import create_server

ROOT = Path(__file__).resolve().parent


def existing_service(port):
    url = f'http://127.0.0.1:{port}'
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url + '/api/health', timeout=2) as response:
            health = json.load(response)
        if isinstance(health, dict) and health.get('application') == 'motion-score-local' and health.get('ok') is True:
            return url
    except (OSError, ValueError, TypeError):
        pass
    return None


def record_address(url):
    (ROOT / 'service-address.js').write_text(
        '// Local service URL only; no credentials.\nwindow.MotionScoreLocal = Object.freeze('
        + json.dumps({'url': url}) + ');\n', encoding='utf-8')


def launch():
    port = 43821
    running_url = existing_service(port)
    if running_url:
        record_address(running_url)
        print('Motion Score already running: ' + running_url, flush=True)
        webbrowser.open(running_url + '/mobile-app.html')
        return
    try:
        server = create_server(port)
    except OSError:
        server = create_server(0)
    url = f'http://127.0.0.1:{server.server_port}'
    record_address(url)
    threading.Timer(.7, lambda: webbrowser.open(url + '/mobile-app.html')).start()
    print('Motion Score: ' + url, flush=True)
    print('Keep this window open while using the app. Ctrl+C stops the local server.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    launch()
