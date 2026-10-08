import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
import mock_api


class JourneyFlowTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node.js is required for the frontend flow check')
    def test_frontend_journeys_against_real_local_server(self):
        self.run_frontend('test_journeys.cjs')

    @unittest.skipUnless(shutil.which('node'), 'Node.js is required for the frontend flow check')
    def test_mobile_app_against_real_local_server(self):
        self.run_frontend('test_mobile_app.cjs')

    @unittest.skipUnless(shutil.which('node'), 'Node.js is required for the map flow check')
    def test_map_recording_and_navigation(self):
        self.run_frontend('test_map_ui.cjs')

    def run_frontend(self, script):
        with tempfile.TemporaryDirectory() as folder, patch.object(mock_api, 'ROOT', Path(folder)), patch.dict(os.environ, {'DEEPSEEK_API_KEY': ''}):
            (Path(folder) / 'data').mkdir()
            server = mock_api.create_server(0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                result = subprocess.run(['node', str(Path(__file__).with_name(script))],
                    env={**os.environ, 'FLOW_URL': f'http://127.0.0.1:{server.server_port}'},
                    capture_output=True, text=True, encoding='utf-8', timeout=60)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                print(result.stdout.strip())
            finally:
                server.shutdown(); server.server_close(); thread.join()
