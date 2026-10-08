"""Motion Score demo API. Native-library only; replace handlers with real Gaode/QQ adapters later."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
import json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
ROUTE = {
    "routeId": "demo-shenzhen-bay",
    "origin": {"name": "深圳湾", "latitude": 22.503, "longitude": 113.956},
    "destination": {"name": "人才公园", "latitude": 22.523, "longitude": 113.949},
    "distance": 5.2,
    "estimatedDuration": 52,
    "polyline": [[22.503,113.956],[22.510,113.960],[22.518,113.955],[22.523,113.949]],
    "stops": [{"name":"深圳湾公园","reason":"海风与低密度路段"},{"name":"人才公园","reason":"接近终点，进入收束段"}],
    "sceneryTags": ["海岸", "夜跑", "舒适"],
    "musicDensity": "中等",
    "source": "demo",
}
PLAYLIST = [{"id": f"track-{i:02d}", "title": title, "artist": artist, "duration": 210, "bpm": bpm, "mood": mood, "genre": genre, "stage": stage, "audioUrl": f"assets/audio/track-{i:02d}.mp3"} for i,(title,artist,bpm,mood,genre,stage) in enumerate([
    ("晚风","陈粒",92,"松弛","民谣","出发"),("去有风的地方","刘昊霖",104,"明亮","流行","进入节奏"),("山与海","万能青年旅店",118,"开阔","摇滚","稳定"),("沿海公路","落日飞车",124,"自由","独立","沿途"),("日落之后","告五人",112,"温暖","流行","停留点"),("夜航星","不才",128,"坚定","电子","冲刺"),("夏日入侵企画","夏日入侵企画",136,"热烈","摇滚","接近终点"),("更远的自己","陈粒",108,"释然","民谣","收束")],1)]
PREFS = {"genres":["流行","独立","民谣"],"artists":["陈粒","万能青年旅店","告五人"],"recentStyles":["夜晚","公路","治愈"],"favoriteTracks":[x["title"] for x in PLAYLIST],"bpmRange":[90,136],"moods":["自由","坚定","松弛"]}
COMMUNITY = [{"id":"demo-1","title":"深圳湾 → 人才公园","route":ROUTE,"author":"移动原声带演示","reuseCount":12}]

def send(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode()
    handler.send_response(status); handler.send_header("Content-Type","application/json; charset=utf-8"); handler.send_header("Content-Length", str(len(body))); handler.end_headers(); handler.wfile.write(body)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=ROOT, **kwargs)
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/location": return send(self, {"latitude":22.503,"longitude":113.956,"city":"深圳","district":"南山区","permissionStatus":"demo","source":"demo"})
        if path == "/api/route": return send(self, ROUTE)
        if path == "/api/qq/preferences": return send(self, PREFS)
        if path == "/api/playlist": return send(self, {"tracks":PLAYLIST,"source":"demo"})
        if path == "/api/community": return send(self, {"items":COMMUNITY})
        return super().do_GET()
    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0)); data = json.loads(self.rfile.read(length) or b"{}")
        if path == "/api/plan": return send(self, {**ROUTE, "goal": data, "source":"demo"})
        if path == "/api/community":
            item = {"id": f"local-{len(COMMUNITY)+1}", **data}; COMMUNITY.insert(0, item); return send(self, item, 201)
        return send(self, {"error":"Not found"}, 404)

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 43821), Handler).serve_forever()

