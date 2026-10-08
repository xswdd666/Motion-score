import io
import json
import os
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch
import amap_service as amap
import mock_api
from planner import InputError


ROUTE = {'provider': 'amap', 'coordinateSystem': 'GCJ02', 'mode': 'run',
         'origin': {'name': '起点', 'location': [121.4737,31.2304]},
         'destination': {'name': '终点', 'location': [121.4741,31.2304]},
         'path': [[121.4737,31.2304],[121.4741,31.2304]], 'distanceMeters': 40, 'durationSeconds': 30}


class MapTests(unittest.TestCase):
    def test_landscape_and_portrait_maps_have_matching_image_sizes(self):
        with patch.object(amap, 'request', return_value=(b'image', 'image/png')) as call:
            for height in [240, 320, 420, 583, 800]:
                amap.static_map([121, 31], 12, height)
                self.assertEqual(call.call_args.args[1]['size'], f'500*{height}')
            call.reset_mock()
            for height in [0, 239, 801, 583.5, float('nan'), True]:
                with self.assertRaises(InputError):amap.static_map([121, 31], 12, height)
            call.assert_not_called()

    def test_route_uses_correct_service_and_keeps_geometry(self):
        def service(path, params, binary=False):
            if path.endswith('/geo'):
                return {'geocodes': [{'formatted_address': params['address'], 'location': '121.4737,31.2304' if params['address']=='起点' else '121.4741,31.2304'}]}
            self.assertIn(path, ['/v3/direction/walking','/v3/direction/driving'])
            return {'route': {'paths': [{'distance':'40','duration':'30','steps':[{'polyline':'121.4737,31.2304;121.4741,31.2304'}]}]}}
        with patch.object(amap,'request',side_effect=service) as call:
            for mode in ['run','drive']:
                r=amap.plan_route({'origin':'起点','destination':'终点','mode':mode})
                self.assertEqual(r['path'], ROUTE['path']);self.assertEqual(r['distanceMeters'],40)
                self.assertEqual(call.call_args.args[0],'/v3/direction/'+('walking' if mode=='run' else 'driving'))

    def test_run_intercity_and_invalid_coordinates_rejected(self):
        with patch.object(amap,'geocode',side_effect=[{'location':[121,31]},{'location':[118,24]}]):
            with self.assertRaises(InputError):amap.plan_route({'origin':'上海','destination':'厦门','mode':'run'})
        for p in [[True,30],[float('nan'),30],[181,0],[120,90]]:
            with self.assertRaises(InputError):amap.coordinate(p)
        with self.assertRaises(InputError):amap.convert({'points':[]})

    def test_multiple_routes_deduplicate_and_keep_real_geometry(self):
        def route_path(polyline, distance):
            return {'steps':[{'polyline':polyline}], 'distance':str(distance), 'duration':'90'}
        first = route_path('121.4737,31.2304;121.4741,31.2304', 40)
        second = route_path('121.4737,31.2304;121.4739,31.2307;121.4741,31.2304', 120)
        with patch.object(amap, 'geocode', side_effect=[ROUTE['origin'], ROUTE['destination']]), patch.object(amap, 'request', return_value={'route':{'paths':[{'steps':[]}, first, first, second]}}) as call:
            result=amap.plan_route({'origin':'起点','destination':'终点','mode':'drive'})
            self.assertEqual(call.call_args.args[1]['strategy'],10)
            self.assertEqual(len(result['alternatives']),2)
            self.assertEqual(result['path'],ROUTE['path'])
            self.assertEqual(result['alternatives'][1]['distanceMeters'],120)
            self.assertEqual(len(result['alternatives'][1]['path']),3)

    def test_gps_conversion_order_and_provider_failure(self):
        with patch.object(amap,'request',return_value={'locations':'121.477,31.228;121.478,31.229'}) as call:
            result=amap.convert({'points':[[121.473,31.23],[121.474,31.231]]})
            self.assertEqual(result['points'],[[121.477,31.228],[121.478,31.229]])
            self.assertEqual(call.call_args.args[1]['coordsys'],'gps')
        class Response(io.BytesIO):
            headers=type('Headers',(),{'get_content_type':lambda self:'application/json'})()
        with patch.dict(os.environ,{'AMAP_WEB_SERVICE_KEY':'fake-key'}),patch('urllib.request.urlopen',return_value=Response(b'{"status":"0","info":"INVALID_USER_KEY","infocode":"10001"}')):
            with self.assertRaises(amap.MapError) as error:amap.request('/invalid',{})
            self.assertNotIn('fake-key',str(error.exception))

    def test_pause_segments_do_not_add_gap_distance(self):
        points=[{'lng':121,'lat':31,'time':1000,'segment':0}, {'lng':121.001,'lat':31,'time':2000,'segment':0}, {'lng':122,'lat':32,'time':3000,'segment':1}]
        for mode in ['gps','demo']:
            geo=amap.validate_geo({'route':ROUTE,'track':{'mode':mode,'coordinateSystem':'GCJ02','points':points}})
            self.assertLess(geo['track']['distanceMeters'],100);self.assertEqual(geo['track']['mode'],mode)
        for extra in [{'lng':999,'lat':31,'time':4000,'segment':1},{'lng':122,'lat':32,'time':500,'segment':1},{'lng':122,'lat':32,'time':4000,'segment':0}]:
            with self.assertRaises(InputError):amap.validate_geo({'track':{'mode':'gps','coordinateSystem':'GCJ02','points':points+[extra]}})

    def test_map_image_proxy_and_save_refresh_preserve_track(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(mock_api,'ROOT',Path(folder)),patch.dict(os.environ,{'AMAP_WEB_SERVICE_KEY':'fake-key','DEEPSEEK_API_KEY':''}):
            (Path(folder)/'data').mkdir();server=mock_api.create_server(0)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}'
            try:
                with urllib.request.urlopen(base+'/api/map/config') as response:
                    config=json.load(response);self.assertTrue(config['configured']);self.assertNotIn('fake-key',json.dumps(config))
                with patch.object(amap,'static_map',return_value=(b'test-png','image/png')) as image_call:
                    with urllib.request.urlopen(base+'/api/map/image?lng=121&lat=31&zoom=12') as response:
                        self.assertEqual(response.read(),b'test-png');self.assertEqual(response.headers['Content-Type'],'image/png')
                    self.assertEqual(image_call.call_args.args, ([121.,31.],12.,320.))
                    with urllib.request.urlopen(base+'/api/map/image?lng=121&lat=31&zoom=12&height=583') as response:
                        self.assertEqual(response.read(),b'test-png')
                    self.assertEqual(image_call.call_args.args, ([121.,31.],12.,583.))
                geo={'route':ROUTE,'track':{'mode':'gps','coordinateSystem':'GCJ02','points':[{'lng':121.4737,'lat':31.2304,'time':1000,'segment':0}]}}
                payload={'title':'轨迹测试','scene':'run','minutes':1,'trackIds':[],'geo':geo}
                def post(data):
                    request=urllib.request.Request(base+'/api/community',json.dumps(data).encode(),{'Content-Type':'application/json'})
                    with urllib.request.urlopen(request) as response:return json.load(response)
                saved=post(payload);updated=post({**saved,'title':'更新后','visibility':'local'})
                self.assertEqual(updated['geo'],saved['geo']);self.assertEqual(updated['id'],saved['id'])
                with urllib.request.urlopen(base+'/api/community') as response:self.assertEqual(json.load(response)['items'][0]['geo'],saved['geo'])
            finally:server.shutdown();server.server_close();thread.join()

    def test_indoor_cannot_claim_gps_track(self):
        with self.assertRaises(InputError):mock_api.save_card({'title':'室内','scene':'gym','minutes':1,'geo':{'track':{'mode':'gps','coordinateSystem':'GCJ02','points':[]}}})


if __name__=='__main__':unittest.main()
