"""Create original synthetic audition loops, explicitly labeled as demo data."""
import array
import json
import math
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def generate():
    folder = ROOT / 'assets/demo-audio'
    folder.mkdir(parents=True, exist_ok=True)
    (ROOT / 'data').mkdir(exist_ok=True)
    genres = ['民谣', '流行', '独立', '摇滚', '电子', '轻音乐']
    names = ['海风', '晴空', '远行', '向前', '夜光', '慢呼吸']
    catalog = []
    rate = 16000
    for g, genre in enumerate(genres):
        for j in range(4):
            ident = f'demo-{g+1:02d}-{j+1:02d}'
            bpm = [76, 96, 116, 138][j] + g % 3 * 2
            beat = 60 / bpm
            seconds = beat * 16
            data = array.array('h')
            notes = [0, 4, 7, 12, 7, 4, 2, 7]
            base = [130.81, 146.83, 164.81, 174.61, 196.00, 110.00][g]
            for i in range(round(seconds * rate)):
                t = i / rate
                tick = t % beat
                f = base * 2 ** (notes[int(t / beat) % len(notes)] / 12)
                melody = math.sin(2 * math.pi * f * t) * math.exp(-tick * (4 if g != 5 else 2))
                harmonic = math.sin(2 * math.pi * f * 2 * t) * .2 * math.exp(-tick * 8)
                bass = math.sin(2 * math.pi * base / 2 * t) * .25
                kick = math.sin(2 * math.pi * (55 * tick + 35 * (1 - math.exp(-tick * 20)) / 20)) * math.exp(-tick * 20) * (j * .12)
                envelope = min(1, t / .02, (seconds - t) / .04)
                data.append(int(max(-1, min(1, (melody + harmonic + bass + kick) * .22 * envelope)) * 32767))
            with wave.open(str(folder / f'{ident}.wav'), 'wb') as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(rate); out.writeframes(data.tobytes())
            catalog.append({'id': ident, 'title': f'{names[g]} · {j+1:02d}（示例）', 'artist': f'本地示例 {chr(65+j)}',
                            'genre': genre, 'duration': 195 + j * 18 + g * 9, 'bpm': bpm,
                            'energy': [.16, .36, .64, .86][j], 'audioUrl': f'assets/demo-audio/{ident}.wav',
                            'audioKind': 'demo-loop', 'loopSeconds': round(seconds, 2)})
    (ROOT / 'data/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Generated {len(catalog)} original audition loops.')


if __name__ == '__main__':
    generate()
