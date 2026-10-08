import copy
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
import planner
import mock_api


class FakeResponse(io.BytesIO):
    pass


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'DEEPSEEK_API_KEY': ''})
        self.env.start(); self.addCleanup(self.env.stop)
        self.catalog = planner.load_catalog()

    def test_all_scenes_cover_5_to_180_minutes(self):
        for scene in planner.SCENES:
            for minutes in [5, 20, 30, 45, 120, 180]:
                with self.subTest(scene=scene, minutes=minutes):
                    p = planner.plan({'scene': scene, 'minutes': minutes, 'surprise': True})
                    self.assertEqual(p['playlistSeconds'], minutes * 60)
                    self.assertEqual(p['source'], 'rules')
                    self.assertTrue(all((planner.ROOT / t['audioUrl']).is_file() for t in p['tracks']))
                    artists = [t['artist'] for t in p['tracks']]
                    self.assertTrue(all(len(set(artists[i:i+3])) > 1 for i in range(len(artists)-2)))

    def test_preferences_change_song_selection(self):
        folk = planner.plan({'genres': ['民谣']})
        rock = planner.plan({'genres': ['摇滚']})
        self.assertTrue(all(t['genre'] == '民谣' for t in folk['tracks']))
        self.assertTrue(all(t['genre'] == '摇滚' for t in rock['tracks']))
        self.assertNotEqual([t['id'] for t in folk['tracks']], [t['id'] for t in rock['tracks']])

    def test_calm_and_energetic_are_different(self):
        calm = planner.plan({'vibe': 'calm', 'surprise': True})
        high = planner.plan({'vibe': 'energetic', 'surprise': True})
        mean = lambda p: sum(t['energy']*t['playDuration'] for t in p['tracks']) / p['playlistSeconds']
        self.assertGreater(mean(high), mean(calm))

    def test_no_repeats_before_catalog_exhausted(self):
        p = planner.plan({'minutes': 30, 'surprise': True})
        ids = [t['id'] for t in p['tracks']]
        self.assertEqual(len(ids), len(set(ids)))

    def test_no_genres_is_allowed_only_with_surprise(self):
        with self.assertRaises(planner.InputError):
            planner.plan({'genres': ['民谣'], 'text': '不要民谣'})
        with self.assertRaises(planner.InputError):
            planner.plan({'genres': []})
        self.assertTrue(planner.plan({'genres': [], 'surprise': True})['tracks'])

    def test_negative_style_is_excluded(self):
        p = planner.plan({'surprise': True, 'text': '不要摇滚，希望放松'})
        self.assertNotIn('摇滚', [t['genre'] for t in p['tracks']])

    def test_invalid_input(self):
        for bad in [{'minutes': -1}, {'minutes': 181}, {'minutes': True}, {'minutes': float('nan')},
                    {'scene': 'unknown'}, {'genres': '民谣'}, {'text': 'x'*501}, {'surprise': 'true'}, []]:
            with self.subTest(bad=bad), self.assertRaises(planner.InputError):
                planner.plan(bad)

    def adjustment(self, minutes, p=None, elapsed=65.5, position=65.5, current=0):
        p = p or planner.plan({'minutes': 30})
        return planner.adjust({'request': {**p['request'], 'minutes': minutes}, 'tracks': p['tracks'],
                               'currentIndex': current, 'elapsed': elapsed, 'trackElapsed': position,
                               'intent': p['intent'], 'source': p['source']})

    def test_extension_preserves_current_and_history(self):
        p = planner.plan({'minutes': 30})
        r = self.adjustment(45, p)
        self.assertEqual(r['tracks'][0], p['tracks'][0])
        self.assertAlmostEqual(r['playlistSeconds'], 2700, places=2)
        elapsed = p['tracks'][0]['playDuration'] + 40
        r = self.adjustment(45, p, elapsed, 40, 1)
        self.assertEqual(r['tracks'][:2], p['tracks'][:2])

    def test_shortening_keeps_current_song(self):
        p = planner.plan({'minutes': 30})
        elapsed = sum(t['playDuration'] for t in p['tracks'][:2]) + 60
        r = self.adjustment(10, p, elapsed, 60, 2)
        self.assertEqual(r['tracks'][:3], p['tracks'][:3])
        self.assertGreaterEqual(r['targetSeconds'], elapsed)
        self.assertEqual(len(r['tracks']), 3)
        self.assertTrue(r['warnings'])

    def test_adjust_after_skip_and_zero_length_history(self):
        p = planner.plan({'minutes': 30})
        p['tracks'][0]['playDuration'] = 0
        r = self.adjustment(45, p, elapsed=25.25, position=25.25, current=1)
        self.assertEqual(r['tracks'][0]['playDuration'], 0)
        self.assertAlmostEqual(r['playlistSeconds'], 2700, places=2)

    def test_adjust_rejects_inconsistent_progress(self):
        with self.assertRaises(planner.InputError):
            self.adjustment(45, elapsed=600, position=1)

    def test_valid_deepseek_response_and_request(self):
        intent = planner.local_intent(planner.normalize({}))
        intent['title'] = 'AI 编排测试'
        content = json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(intent)}}]}).encode()
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': 'test-only-key'}), patch('urllib.request.urlopen', return_value=FakeResponse(content)) as call:
            p = planner.plan({})
            self.assertEqual(p['source'], 'deepseek')
            self.assertEqual(p['intent']['title'], 'AI 编排测试')
            request = call.call_args.args[0]
            payload = json.loads(request.data)
            self.assertEqual(payload['response_format'], {'type': 'json_object'})
            self.assertNotIn('origin', json.loads(payload['messages'][1]['content'])['settings'])

    def test_deepseek_failures_fall_back(self):
        valid = planner.local_intent(planner.normalize({}))
        invalid = {**valid, 'preferredTrackIds': ['invented-song']}
        for payload in [b'{}', b'not json', json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(invalid)}}]}).encode(),
                        json.dumps({'choices': [{'finish_reason': 'length', 'message': {'content': json.dumps(valid)}}]}).encode()]:
            with patch.dict(os.environ, {'DEEPSEEK_API_KEY': 'test-only-key'}), patch('urllib.request.urlopen', return_value=FakeResponse(payload)):
                self.assertEqual(planner.plan({})['source'], 'rules')
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': 'test-only-key'}), patch('urllib.request.urlopen', side_effect=TimeoutError()):
            self.assertEqual(planner.plan({})['source'], 'rules')


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {'DEEPSEEK_API_KEY': ''}); cls.env.start()
        cls.server = mock_api.create_server(0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.env.stop()

    def post(self, path, data):
        req = urllib.request.Request(self.base+path, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
        return urllib.request.urlopen(req, timeout=5)

    def test_generate_and_health(self):
        with urllib.request.urlopen(self.base+'/api/health') as r:
            self.assertEqual(json.load(r)['catalogCount'], 24)
        with self.post('/api/playlist/generate', {'minutes': 20}) as r:
            self.assertEqual(json.load(r)['targetSeconds'], 1200)

    def test_invalid_requests_and_private_files(self):
        for path in ['/.env', '/%2eenv', '/data/catalog.json', '/planner.py', '/data/local-cards.json']:
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.base+path)
            self.assertEqual(error.exception.code, 404)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.post('/api/playlist/generate', {'minutes': 200})
        self.assertEqual(error.exception.code, 400)

    def test_card_save_persists_and_preserves_visibility(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(mock_api, 'ROOT', Path(folder)):
            (Path(folder)/'data').mkdir()
            with self.post('/api/community', {'title': '本地测试卡片', 'minutes': 1.5, 'scene': 'run', 'trackIds': ['demo-01-01'], 'visibility': 'private', 'allowReuse': False}) as r:
                saved = json.load(r)
            self.assertTrue((Path(folder)/'data/local-cards.json').is_file())
            with urllib.request.urlopen(self.base+'/api/community') as r:
                self.assertEqual(json.load(r)['items'][0], saved)
            self.assertFalse(saved['allowReuse'])

    def test_saved_playlist_restores_updates_and_uses_known_audio(self):
        p = planner.plan({'scene': 'cycle', 'minutes': 20}, use_ai=False)
        p['tracks'][0]['audioUrl'] = 'https://untrusted.example/changed.wav'
        payload = {'title': '完整记录', 'minutes': 2, 'scene': 'cycle', 'plan': p, 'visibility': 'private'}
        with tempfile.TemporaryDirectory() as folder, patch.object(mock_api, 'ROOT', Path(folder)):
            (Path(folder)/'data').mkdir()
            with self.post('/api/community', payload) as r:
                saved = json.load(r)
            self.assertEqual(saved['plan']['targetSeconds'], 1200)
            original = next(t for t in planner.load_catalog() if t['id'] == saved['plan']['tracks'][0]['id'])
            self.assertEqual(saved['plan']['tracks'][0]['audioUrl'], original['audioUrl'])
            with self.post('/api/community', {**saved, 'title': '更新标题', 'visibility': 'local', 'allowReuse': False}) as r:
                updated = json.load(r)
            self.assertEqual(updated['id'], saved['id'])
            self.assertEqual(updated['createdAt'], saved['createdAt'])
            with urllib.request.urlopen(self.base+'/api/community') as r:
                cards = json.load(r)['items']
            self.assertEqual(len(cards), 1)
            self.assertEqual(cards[0], updated)

    def test_rejects_invalid_snapshot_and_missing_update(self):
        valid = planner.plan({}, use_ai=False)
        cases = []
        for field, value in [('id', 'invented-song'), ('playDuration', -1), ('playDuration', 100000)]:
            p = copy.deepcopy(valid); p['tracks'][0][field] = value; cases.append({'plan': p})
        p = copy.deepcopy(valid); p['targetSeconds'] = 2000; cases.append({'plan': p})
        cases.extend([{'id': 'missing-record'}, {'plan': valid, 'scene': 'yoga'}])
        with tempfile.TemporaryDirectory() as folder, patch.object(mock_api, 'ROOT', Path(folder)):
            (Path(folder)/'data').mkdir()
            for extra in cases:
                with self.subTest(extra=list(extra)), self.assertRaises(urllib.error.HTTPError) as error:
                    self.post('/api/community', {'title': '无效记录', 'minutes': 1, 'scene': 'run', **extra})
                self.assertEqual(error.exception.code, 400)
            self.assertEqual(mock_api.read_cards(), [])

    def test_demo_preview_does_not_call_ai(self):
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': 'test-only-key'}), patch('planner.deepseek_intent') as call:
            with self.post('/api/playlist/preview', {'scene': 'drive', 'minutes': 45}) as r:
                preview = json.load(r)
            call.assert_not_called()
            self.assertEqual(preview['source'], 'rules')
            self.assertEqual(preview['targetSeconds'], 2700)


if __name__ == '__main__':
    unittest.main()
