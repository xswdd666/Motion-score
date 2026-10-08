"""AMap REST adapter. Credentials stay on localhost, never in image URLs sent to clients."""
import json
import math
import os
import time
import threading
import urllib.parse
import urllib.request
from planner import InputError, number


class MapError(ValueError):
    pass


BASE = 'https://restapi.amap.com'
CACHE = {}
LOCK = threading.Lock()


def configured():
    return bool(os.getenv('AMAP_WEB_SERVICE_KEY', '').strip())


def coordinate(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise InputError('坐标应为经度、纬度。')
    return [number(value[0], '经度', -180, 180), number(value[1], '纬度', -85, 85)]


def pair(value):
    return ','.join(f'{v:.6f}' for v in coordinate(value))


def request(path, params, binary=False):
    key = os.getenv('AMAP_WEB_SERVICE_KEY', '').strip()
    if not key:
        raise MapError('尚未配置高德 Web 服务密钥，请在本机 .env 中填写 AMAP_WEB_SERVICE_KEY。')
    params = {**params, 'key': key}
    cache_key = (key, path, urllib.parse.urlencode({k: v for k, v in params.items() if k != 'key'}))
    with LOCK:
        entry = CACHE.get(cache_key)
        if entry and time.monotonic() - entry[0] < 300:
            return entry[1]
    url = BASE + path + '?' + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
            raw = response.read(4_000_001)
            mime = response.headers.get_content_type()
    except (OSError, ValueError):
        raise MapError('高德服务暂时未能连接，请稍后重试。') from None
    if len(raw) > 4_000_000:
        raise MapError('高德返回的数据过大，请缩小路线范围。')
    if binary and mime in {'image/png', 'image/jpeg'}:
        result = (raw, mime)
    else:
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeError):
            raise MapError('高德返回的数据无法读取。') from None
        if not isinstance(result, dict):
            raise MapError('高德返回的数据格式无效。')
        if str(result.get('status')) != '1':
            info = str(result.get('info', 'UNKNOWN'))
            reasons = {'INVALID_USER_KEY': '高德密钥无效。', 'USERKEY_PLAT_NOMATCH': '密钥类型不匹配，请使用高德 Web 服务密钥。',
                       'INVALID_USER_IP': '高德密钥的 IP 白名单未允许当前服务。',
                       'CUQPS_HAS_EXCEEDED_THE_LIMIT': '高德请求频率已超限，请稍后重试。',
                       'DAILY_QUERY_OVER_LIMIT': '高德今日调用额度已用完。',
                       'OUT_OF_SERVICE': '当前路线超出高德支持范围，请选附近的明确地点。',
                       'OVER_DIRECTION_RANGE': '路线距离超出支持范围；跑步请选择附近地点。'}
            code = str(result.get('infocode', ''))
            code = code if code.isdigit() and len(code) <= 8 else '未知'
            raise MapError(reasons.get(info, '高德未能完成请求，请检查密钥权限和地点。') + f'（错误码 {code}）')
        if binary:
            raise MapError('高德未返回地图图片，请检查静态地图服务权限。')
    with LOCK:
        if len(CACHE) >= 128:
            CACHE.pop(next(iter(CACHE)))
        CACHE[cache_key] = (time.monotonic(), result)
    return result


def geocode(address):
    if not isinstance(address, str) or not 1 <= len(address.strip()) <= 60:
        raise InputError('地点请填写 1–60 字，建议包含城市和具体位置。')
    result = request('/v3/geocode/geo', {'address': address.strip(), 'output': 'JSON'})
    places = result.get('geocodes', [])
    if not places:
        raise MapError('没有找到这个地点，请补充城市和具体地址。')
    place = places[0]
    location = coordinate([float(v) for v in place['location'].split(',')])
    return {'name': place.get('formatted_address') or address.strip(), 'location': location, 'adcode': place.get('adcode', '')}


def plan_route(data):
    if not isinstance(data, dict) or data.get('mode') not in {'run', 'drive'}:
        raise InputError('路线规划仅适用于户外跑步或驾车。')
    origin, destination = geocode(data.get('origin')), geocode(data.get('destination'))
    mode = data['mode']
    if mode == 'run' and distance(origin['location'], destination['location']) > 100_000:
        raise InputError('跑步路线应在 100 公里内，请填写附近的公园、街道或具体地址。')
    endpoint = '/v3/direction/driving' if mode == 'drive' else '/v3/direction/walking'
    params = {'origin': pair(origin['location']), 'destination': pair(destination['location']), 'extensions': 'all', 'output': 'JSON'}
    if mode == 'drive':
        params['strategy'] = 10
    result = request(endpoint, params)
    paths = result.get('route', {}).get('paths', [])
    if not paths:
        raise MapError('这两个地点之间没有找到路线，请换成可到达的具体地点。')
    options = []
    seen = set()
    for path in paths[:6]:
        points = []
        for step in path.get('steps', []):
            for entry in step.get('polyline', '').split(';'):
                if entry:
                    point = coordinate([float(v) for v in entry.split(',')])
                    if not points or point != points[-1]:
                        points.append(point)
        if len(points) < 2:
            continue
        signature = tuple(tuple(p) for p in points)
        if signature in seen:
            continue
        seen.add(signature)
        if len(points) > 2000:
            points = [points[round(i * (len(points)-1) / 1999)] for i in range(2000)]
        options.append({'provider': 'amap', 'coordinateSystem': 'GCJ02', 'mode': mode, 'origin': origin, 'destination': destination,
                        'path': points, 'distanceMeters': number(float(path.get('distance', 0)), '路线距离', 0, 20_000_000),
                        'durationSeconds': number(float(path.get('duration', 0)), '预计路线时长', 0, 2_000_000)})
        if len(options) == 3:
            break
    if not options:
        raise MapError('高德未返回完整路线，请重试。')
    return {**options[0], 'alternatives': options}


def convert(data):
    points = data.get('points') if isinstance(data, dict) else None
    if not isinstance(points, list) or not 1 <= len(points) <= 40:
        raise InputError('每次转换应包含 1–40 个定位点。')
    result = request('/v3/assistant/coordinate/convert', {'locations': '|'.join(pair(p) for p in points), 'coordsys': 'gps', 'output': 'JSON'})
    converted = [coordinate([float(v) for v in p.split(',')]) for p in result.get('locations', '').split(';') if p]
    if len(converted) != len(points):
        raise MapError('定位坐标转换不完整，请重试。')
    return {'coordinateSystem': 'GCJ02', 'points': converted}


def static_map(center, zoom, height=320):
    zoom = number(zoom, '地图缩放', 3, 17)
    if int(zoom) != zoom:
        raise InputError('地图缩放应为整数。')
    height = number(height, '地图高度', 240, 800)
    if int(height) != height:
        raise InputError('地图高度应为整数。')
    return request('/v3/staticmap', {'location': pair(center), 'zoom': int(zoom), 'size': f'500*{int(height)}', 'scale': 1}, binary=True)


def distance(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    rad = math.pi/180
    h = math.sin((lat2-lat1)*rad/2)**2 + math.cos(lat1*rad)*math.cos(lat2*rad)*math.sin((lon2-lon1)*rad/2)**2
    return 6_371_000*2*math.asin(min(1, math.sqrt(h)))


def validate_geo(data):
    if data is None:
        return None
    if not isinstance(data, dict):
        raise InputError('地图记录无效。')
    route = data.get('route')
    result = {'route': None, 'track': None}
    if route is not None:
        if not isinstance(route, dict) or route.get('provider') != 'amap' or route.get('mode') not in {'run', 'drive'}:
            raise InputError('规划路线无效。')
        points = route.get('path')
        if not isinstance(points, list) or not 2 <= len(points) <= 2000:
            raise InputError('规划路线点数无效。')
        clean = {'provider': 'amap', 'coordinateSystem': 'GCJ02', 'mode': route['mode'], 'path': [coordinate(p) for p in points],
                 'distanceMeters': number(route.get('distanceMeters'), '路线距离', 0, 20_000_000),
                 'durationSeconds': number(route.get('durationSeconds'), '路线时长', 0, 2_000_000)}
        for name in ['origin', 'destination']:
            place = route.get(name)
            if not isinstance(place, dict) or not isinstance(place.get('name'), str) or len(place['name']) > 200:
                raise InputError('规划地点无效。')
            clean[name] = {'name': place['name'], 'location': coordinate(place.get('location'))}
        result['route'] = clean
    track = data.get('track')
    if track is not None:
        if not isinstance(track, dict) or track.get('mode') not in {'gps', 'demo'} or track.get('coordinateSystem') != 'GCJ02':
            raise InputError('轨迹类型或坐标格式无效。')
        points = track.get('points')
        if not isinstance(points, list) or len(points) > 2400:
            raise InputError('轨迹最多保存 2400 个定位点。')
        clean_points = []
        meters = 0
        for point in points:
            if not isinstance(point, dict):
                raise InputError('轨迹定位点无效。')
            coord = coordinate([point.get('lng'), point.get('lat')])
            timestamp = number(point.get('time'), '定位时间', 0, 10**13)
            segment = number(point.get('segment', 0), '轨迹分段', 0, 10000)
            accuracy = number(point.get('accuracy', 0), '定位精度', 0, 10000)
            if segment != int(segment):
                raise InputError('轨迹分段应为整数。')
            p = {'lng': coord[0], 'lat': coord[1], 'time': timestamp, 'segment': int(segment), 'accuracy': accuracy}
            if clean_points:
                prev = clean_points[-1]
                if p['time'] <= prev['time'] or p['segment'] < prev['segment']:
                    raise InputError('轨迹定位顺序无效。')
                if p['segment'] == prev['segment']:
                    meters += distance([prev['lng'], prev['lat']], coord)
            clean_points.append(p)
        result['track'] = {'mode': track['mode'], 'coordinateSystem': 'GCJ02', 'points': clean_points,
                           'distanceMeters': round(meters, 2)}
    return result
