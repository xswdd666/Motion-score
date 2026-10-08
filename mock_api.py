"""Local server: stdlib only, localhost only, no credentials served."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote, parse_qs
from pathlib import Path
import argparse
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from planner import InputError, load_catalog, plan, adjust, normalize, number, validate_intent, local_intent
import amap_service

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()


def load_env():
    path = ROOT / '.env'
    if path.is_file():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.strip().startswith('#'):
                key, value = line.split('=', 1)
                if key.strip() in {'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'AMAP_WEB_SERVICE_KEY'}:
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_cards():
    path = ROOT / 'data/local-cards.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []


def save_card(data):
    if not isinstance(data, dict) or not isinstance(data.get('title'), str) or not 1 <= len(data['title'].strip()) <= 80:
        raise InputError('卡片标题应为 1–80 字。')
    minutes = data.get('minutes')
    if isinstance(minutes, bool) or not isinstance(minutes, (int, float)) or not 0 <= minutes <= 180:
        raise InputError('卡片时长无效。')
    catalog = load_catalog()
    known = {t['id'] for t in catalog}
    ids = data.get('trackIds', [])
    if not isinstance(ids, list) or len(ids) > 400 or any(not isinstance(i, str) or i not in known for i in ids):
        raise InputError('卡片歌曲无效。')
    scene = data.get('scene')
    if scene not in {'run', 'drive', 'treadmill', 'gym', 'cycle', 'yoga'}:
        raise InputError('卡片场景无效。')
    visibility = data.get('visibility', 'private')
    if visibility not in {'private', 'local'}:
        raise InputError('公开范围无效。')
    allow_reuse = data.get('allowReuse', True)
    if not isinstance(allow_reuse, bool):
        raise InputError('复用设置无效。')
    for name in ['origin', 'destination']:
        if not isinstance(data.get(name, ''), str) or len(data.get(name, '')) > 60:
            raise InputError('起终点无效。')
    card = {'id': str(uuid.uuid4()), 'title': data['title'].strip(), 'minutes': minutes,
            'scene': scene, 'origin': data.get('origin', ''), 'destination': data.get('destination', ''),
            'trackIds': ids, 'visibility': visibility, 'allowReuse': allow_reuse,
            'createdAt': datetime.now(timezone.utc).isoformat()}
    snapshot = data.get('plan')
    if snapshot is not None:
        if not isinstance(snapshot, dict):
            raise InputError('歌单记录无效。')
        req = normalize(snapshot.get('request'))
        queue = snapshot.get('tracks')
        if req['scene'] != scene or not isinstance(queue, list) or not 1 <= len(queue) <= 400:
            raise InputError('歌单场景或歌曲数量无效。')
        lookup = {t['id']: t for t in catalog}
        songs = []
        for item in queue:
            if not isinstance(item, dict) or item.get('id') not in lookup:
                raise InputError('歌单包含未知歌曲。')
            original = lookup[item['id']]
            duration = number(item.get('playDuration'), '歌曲时长', 0, original['duration'])
            songs.append({**original, 'playDuration': duration, 'stage': str(item.get('stage', '进行中'))[:20], 'reason': str(item.get('reason', ''))[:150]})
        total = sum(s['playDuration'] for s in songs)
        if total < 1 or total > 10920:
            raise InputError('歌单总时长无效。')
        target = number(snapshot.get('targetSeconds'), '歌单目标时长', 1, 10800)
        if total + .01 < target:
            raise InputError('保存的歌单未覆盖目标时长。')
        try:
            intent = validate_intent(snapshot.get('intent'), catalog)
        except (ValueError, TypeError):
            intent = local_intent(req)
        card['plan'] = {'request': req, 'tracks': songs, 'targetSeconds': target, 'playlistSeconds': total, 'intent': intent,
                        'source': snapshot.get('source') if snapshot.get('source') in {'rules', 'deepseek'} else 'rules',
                        'message': '从本机保存的原声带读取。', 'warnings': []}
        card['trackIds'] = [s['id'] for s in songs]
    geo = amap_service.validate_geo(data.get('geo'))
    if geo is not None:
        if scene not in {'run', 'drive'}:
            raise InputError('室内运动不保存户外 GPS 轨迹。')
        if geo.get('route') and geo['route']['mode'] != scene:
            raise InputError('保存的路线与运动场景不一致。')
        card['geo'] = geo
    with LOCK:
        cards = read_cards()
        update_id = data.get('id')
        if update_id is not None:
            previous = next((c for c in cards if c['id'] == update_id), None)
            if previous is None:
                raise InputError('要更新的卡片不存在。')
            card['id'] = previous['id']; card['createdAt'] = previous['createdAt']
            cards = [c for c in cards if c['id'] != update_id]
        cards.insert(0, card)
        tmp = ROOT / 'data/local-cards.json.tmp'
        tmp.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(ROOT / 'data/local-cards.json')
    return card


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def public_path(self):
        path = Path(unquote(urlparse(self.path).path).lstrip('/'))
        target = (ROOT / path).resolve()
        if target != ROOT and ROOT not in target.parents:
            return False
        if any(part.startswith('.') for part in path.parts):
            return False
        if path.parts and path.parts[0] in {'data', 'tests', 'tools', '__pycache__'}:
            return False
        return target.suffix.lower() in {'.html', '.js', '.css', '.png', '.jpg', '.wav', '.mp3', '.svg', '.ico'} or target == ROOT

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')

    def do_HEAD(self):
        if not self.public_path():
            return self.send_error(404)
        return super().do_HEAD()

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == '/api/health':
                return self.send_json({'ok': True, 'application': 'motion-score-local', 'deepseekConfigured': bool(os.getenv('DEEPSEEK_API_KEY', '').strip()),
                                       'model': os.getenv('DEEPSEEK_MODEL', 'deepseek-flash'), 'catalogCount': len(load_catalog())})
            if path == '/api/catalog':
                return self.send_json({'tracks': load_catalog(), 'source': 'demo-audio'})
            if path == '/api/map/config':
                return self.send_json({'configured': amap_service.configured(), 'provider': 'amap', 'rendering': 'static', 'tracking': 'browser-gps'})
            if path == '/api/map/image':
                query = parse_qs(urlparse(self.path).query)
                try:
                    center = [float(query.get('lng', [''])[0]), float(query.get('lat', [''])[0])]
                    zoom = float(query.get('zoom', [''])[0])
                    height = float(query.get('height', ['320'])[0])
                except (ValueError, TypeError):
                    raise InputError('地图中心、缩放或尺寸参数无效。') from None
                blob, mime = amap_service.static_map(center, zoom, height)
                self.send_response(200); self.send_header('Content-Type', mime); self.send_header('Content-Length', str(len(blob)))
                self.send_header('Cache-Control', 'private, max-age=300'); self.end_headers(); self.wfile.write(blob); return
            if path == '/api/location':
                return self.send_json({'latitude':22.503,'longitude':113.956,'city':'深圳','district':'南山区','permissionStatus':'demo','source':'demo'})
            if path == '/api/playlist':
                return self.send_json({'tracks': load_catalog(), 'source':'demo'})
            if path == '/api/community':
                return self.send_json({'items': read_cards()})
            if path.startswith('/api/'):
                return self.send_json({'error': '此接口尚未接入。'}, 404)
            if not self.public_path():
                return self.send_error(404)
            return super().do_GET()
        except amap_service.MapError as error:
            return self.send_json({'error': str(error)}, 502)
        except InputError as error:
            return self.send_json({'error': str(error)}, 400)
        except (OSError, ValueError):
            return self.send_json({'error': '本地资料无法读取，请检查 data 文件夹。'}, 500)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}:
            return self.send_json({'error': '只允许本地页面请求。'}, 403)
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 524288:
                return self.send_json({'error': '请求内容为空或过大。'}, 400)
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.send_json({'error': '请使用 JSON 格式。'}, 415)
            data = json.loads(self.rfile.read(length), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
            path = urlparse(self.path).path
            if path == '/api/playlist/generate':
                return self.send_json(plan(data))
            if path == '/api/playlist/preview':
                return self.send_json(plan(data, use_ai=False))
            if path == '/api/playlist/adjust':
                return self.send_json(adjust(data))
            if path == '/api/community':
                return self.send_json(save_card(data), 201)
            if path == '/api/map/route':
                return self.send_json(amap_service.plan_route(data))
            if path == '/api/map/convert':
                return self.send_json(amap_service.convert(data))
            return self.send_json({'error': '接口不存在。'}, 404)
        except amap_service.MapError as e:
            return self.send_json({'error': str(e)}, 502)
        except InputError as e:
            return self.send_json({'error': str(e)}, 400)
        except (ValueError, TypeError):
            return self.send_json({'error': '设置或播放进度无效，请检查输入。'}, 400)
        except (OSError, KeyError):
            return self.send_json({'error': '本地服务出错，请检查歌曲资料。'}, 500)


def create_server(port=43821):
    load_env()
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=43821)
    args = parser.parse_args()
    server = create_server(args.port)
    print(f'Motion Score local: http://127.0.0.1:{server.server_port}', flush=True)
    server.serve_forever()
