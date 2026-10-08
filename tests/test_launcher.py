import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import launch


class LauncherTests(unittest.TestCase):
    def test_existing_service_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(launch, 'ROOT', Path(directory)), \
                 patch.object(launch, 'existing_service', return_value='http://127.0.0.1:43821'), \
                 patch.object(launch, 'create_server') as create, \
                 patch.object(launch.webbrowser, 'open') as open_page, \
                 contextlib.redirect_stdout(io.StringIO()):
                launch.launch()
                create.assert_not_called()
                open_page.assert_called_once_with('http://127.0.0.1:43821/mobile-app.html')
                contents = (Path(directory) / 'service-address.js').read_text()
                self.assertIn('http://127.0.0.1:43821', contents)

    def test_busy_port_records_actual_free_port(self):
        server = MagicMock()
        server.server_port = 58001
        server.serve_forever.side_effect = KeyboardInterrupt
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(launch, 'ROOT', Path(directory)), \
                 patch.object(launch, 'existing_service', return_value=None), \
                 patch.object(launch, 'create_server', side_effect=[OSError(), server]) as create, \
                 patch.object(launch.threading, 'Timer') as timer, \
                 patch.object(launch.webbrowser, 'open') as open_page, \
                 contextlib.redirect_stdout(io.StringIO()):
                launch.launch()
                self.assertEqual([c.args for c in create.call_args_list], [(43821,), (0,)])
                self.assertIn('http://127.0.0.1:58001', (Path(directory) / 'service-address.js').read_text())
                timer.call_args.args[1]()
                open_page.assert_called_once_with('http://127.0.0.1:58001/mobile-app.html')
                server.server_close.assert_called_once()

    def test_only_motion_score_service_is_reused(self):
        for response, expected in [
            ({'application': 'motion-score-local', 'ok': True}, 'http://127.0.0.1:43821'),
            ({'application': 'another-app', 'ok': True}, None),
            ([], None),
        ]:
            with self.subTest(response=response):
                opener = MagicMock()
                opener.open.return_value = io.BytesIO(json.dumps(response).encode())
                with patch.object(launch.urllib.request, 'build_opener', return_value=opener):
                    self.assertEqual(launch.existing_service(43821), expected)


if __name__ == '__main__':
    unittest.main()
