"""Extract factual recipe data from the official wiki's pinned data.raw dump.

This is a data-only Lua table reader: it never executes downloaded Lua.
Run from the Graph Studio directory after downloading the dump to the cache.
"""
import hashlib
import json
import re
from pathlib import Path

SOURCE = Path('.example-source-cache/factorio-2.0.65.lua')
TOKEN = re.compile(r'\s+|--\[=\[.*?\]=\]|--[^\n]*|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[A-Za-z_][\w]*|[{}\[\]=,;]', re.S)


def read_table(source):
    tokens = [m.group() for m in TOKEN.finditer(source) if not m.group().isspace() and not m.group().startswith('--')]
    pos = 0

    def value():
        nonlocal pos
        token = tokens[pos]
        pos += 1
        if token == '{':
            result, index = {}, 1
            while tokens[pos] != '}':
                if tokens[pos] == '[':
                    pos += 1
                    key = value()
                    assert tokens[pos:pos+2] == [']', '=']
                    pos += 2
                elif tokens[pos+1] == '=':
                    key = tokens[pos]
                    pos += 2
                else:
                    key = index
                    index += 1
                result[key] = value()
                if tokens[pos] in (',', ';'):
                    pos += 1
            pos += 1
            if result and list(result) == list(range(1, len(result)+1)):
                return list(result.values())
            return result
        if token.startswith('"'):
            return json.loads(token)
        if token in ('true', 'false', 'nil'):
            return {'true': True, 'false': False, 'nil': None}[token]
        return float(token) if any(c in token for c in '.eE') else int(token)

    result = value()
    assert pos == len(tokens), f'Unexpected trailing data at {tokens[pos:pos+10]}'
    return result


def main():
    raw = SOURCE.read_text(encoding='utf-8')
    tables = {}
    # Top-level prototype sections always start at two spaces in the wiki dump.
    starts = list(re.finditer(r'^  (\w+|\["[^"\n]+"\]) = ', raw, re.M))
    for index, match in enumerate(starts):
        name = match[1].strip('[]"')
        if name not in ('recipe', 'fluid', 'item-subgroup', 'item', 'tool', 'resource', 'item-group'):
            continue
        end = starts[index+1].start() if index+1 < len(starts) else len(raw)-1
        tables[name] = read_table(raw[match.end():end].rstrip(',\n '))
    recipes = []
    for name, recipe in tables['recipe'].items():
        # Only gameplay quantities and constraints, no art/assets or copied prose.
        fields = ('category', 'energy_required', 'ingredients', 'results', 'subgroup', 'main_product', 'surface_conditions', 'hidden')
        entry = {'name': name, **{key: recipe[key] for key in fields if key in recipe}}
        assert isinstance(entry.get('ingredients', []), (list, dict)), name
        assert isinstance(entry.get('results', []), (list, dict)), name
        recipes.append(entry)
    out = Path('scripts/data/factorio-recipes-2.0.65.json')
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        'version': '2.0.65',
        'source': 'https://wiki.factorio.com/Data.raw',
        'dump': 'https://gist.githubusercontent.com/Bilka2/6b8a6a9e4a4ec779573ad703d03c1ae7/raw',
        'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'recipes': recipes,
    }, indent=2) + '\n', encoding='utf-8')
    print(f'Extracted {len(recipes)} recipes to {out}')
    print('Categories:', sorted({r.get('category', 'crafting') for r in recipes}))
    print('Placeholders:', [(r['name'], k) for r in recipes for k in ('ingredients', 'results') if 'SERPENT PLACEHOLDER' in str(r.get(k))])


if __name__ == '__main__':
    main()
