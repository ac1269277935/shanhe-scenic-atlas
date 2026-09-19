"""Build a portable offline HTML document using only the Python standard library."""
from pathlib import Path
import argparse
import json

ROOT = Path(__file__).resolve().parent


def build(destination: Path) -> None:
    read = lambda name: (ROOT / name).read_text(encoding='utf-8')
    attractions = json.loads(read('data/attractions.json'))
    geometry = json.loads(read('data/china.geojson'))
    assert len(attractions) == len({item['id'] for item in attractions}) == 358
    assert geometry['type'] == 'FeatureCollection' and geometry['features']
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    scripts = '<script>\n' + read('vendor/d3.v7.9.0.min.js') + '\n</script>\n'
    scripts += '<script type="application/json" id="c5a-data">' + encode(attractions) + '</script>\n'
    scripts += '<script type="application/json" id="c5a-geo">' + encode(geometry) + '</script>\n'
    scripts += '<script>\n' + read('src/app.js') + '\n</script>\n'
    content = read('src/layout.html').replace('__ATLAS_CSS__', read('src/atlas.css') + '\n' + read('src/motion.css')).replace('__MAP_SCRIPTS__', scripts)
    document = '\n'.join([
        '<!doctype html>', '<html lang="zh-CN">', '<head>',
        '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="referrer" content="no-referrer">',
        '<meta name="description" content="山河印记：中国358家5A景区互动地图，支持批次、类型筛选和个人标记。">',
        '<title>山河印记 · 中国5A景区互动地图</title>',
        '<!-- D3 v7.9.0: Copyright 2010-2023 Mike Bostock; ISC. See vendor/LICENSE-D3.txt. -->',
        '</head>', '<body>', content, '</body>', '</html>',
    ])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(document, encoding='utf-8', newline='\n')
    print(f'Built {destination.name}: {len(attractions)} attractions, {len(document.encode("utf-8")):,} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'index.html')
    build(parser.parse_args().output.resolve())
