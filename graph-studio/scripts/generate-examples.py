"""Rebuild the English example workspaces from pinned, local source data.

Usage: python scripts/generate-examples.py [path/to/math/content]
The application loads the generated public/examples/<workspace>/ folders.
"""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/examples'
OUT.mkdir(exist_ok=True)


def text_json(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'


def write_workspace(key, title, graphs, notes, default, metadata=None):
    manifest = {'format': 'graph-studio-workspace', 'version': 1, 'name': title,
                'graphs': list(graphs), 'defaultGraph': default,
                'metadata': {**(metadata or {}), 'assets': list(notes)}}
    files = {'graph-studio.workspace.json': text_json(manifest),
             **{name: text_json(graph) for name, graph in graphs.items()}, **notes}
    workspace = OUT / key
    for name, content in files.items():
        path = workspace / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
    print(f'{key}: {len(graphs)} graphs, {len(files)} files')


def graph(title, nodes, edges, diagram='dag', metadata=None):
    return {'format': 'graph-studio', 'version': 2, 'diagram': diagram, 'title': title,
            'metadata': metadata or {}, 'nodes': nodes, 'edges': edges}


def mathematics():
    content = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent.parent / 'math/content'
    original = json.loads((content / 'math.json').read_text(encoding='utf-8'))
    nodes, edges, notes = {}, {}, {}
    title = lambda key: key.replace('_', ' ')
    definitions = {
        'Real_Valued_Sequence': 'A real-valued sequence is an ordered family of real numbers indexed by the natural numbers.',
        'Polyhedron': 'A polyhedron is a solid in three-dimensional space bounded by finitely many polygonal faces.',
    }
    for key, node in original.items():
        note = (content / f'{key}.md').read_text(encoding='utf-8')
        definition = re.search(r'^> (.+)$', note, re.M)
        definition = definition[1] if definition else f'A concept in {node.get("type") or "mathematical foundations"}.'
        definition = definitions.get(key, definition)
        assert not re.search('[\u4e00-\u9fff]', definition)
        nodes[key] = {'title': title(key), 'type': node.get('type') or 'Mathematical Logic and Foundations',
                      'define': definition, 'notes': f'[Read concept note](./notes/{key}.md)'}
        for child, relation in node.get('children', {}).items():
            edges[(key, child)] = relation
        for parent, relation in node.get('parents', {}).items():
            edges[(parent, key)] = relation
    assert all(a in nodes and b in nodes for a, b in edges)
    for key, node in nodes.items():
        parents = [(a, relation) for (a, b), relation in edges.items() if b == key]
        children = [(b, relation) for (a, b), relation in edges.items() if a == key]
        note = f'# {node["title"]}\n\n{node["define"]}\n\nSubject: {node["type"]}\n'
        for heading, relations in [('Foundations and prerequisites', parents), ('Related concepts', children)]:
            if relations:
                note += f'\n## {heading}\n\n' + '\n'.join(f'- [{title(k)}](./{k}.md) — {relation.replace("_", " ")}' for k, relation in relations) + '\n'
        notes[f'notes/{key}.md'] = note
    relationships = [{'id': f'math-{i}', 'source': a, 'target': b, 'value': v} for i, ((a, b), v) in enumerate(edges.items())]
    graphs = {'mathematics.json': graph('Mathematics · complete map', nodes, relationships)}
    for subject in sorted({n['type'] for n in nodes.values()}):
        selected = {key for key, n in nodes.items() if n['type'] == subject}
        # Include immediate prerequisites so cross-subject context is retained.
        selected |= {e['source'] for e in relationships if e['target'] in selected}
        slug = re.sub(r'[^a-z]+', '-', subject.lower()).strip('-')
        graphs[f'{slug}.json'] = graph(subject, {key: n for key, n in nodes.items() if key in selected},
                                     [e for e in relationships if e['source'] in selected and e['target'] in selected])
    notes['README.md'] = '# Mathematics\n\n112 concepts across eight subjects, adapted from the local math/studio knowledge graph (`math/content/math.json`).\n\nOpen the complete map or choose a subject in Explorer. Double-click a concept and follow its note link. Notes link to related concepts within this workspace. Subject views retain immediate prerequisites from other subjects.\n\nDefinitions and relationships are adapted from the corresponding English concept notes. These compact reference notes are not a replacement for full mathematical treatments.\n'
    write_workspace('mathematics', 'Mathematics', graphs, notes, 'mathematics.json', {'source': 'math/content/math.json', 'concepts': len(nodes)})


def expected(product):
    amount = product.get('amount', (product.get('amount_min', 0) + product.get('amount_max', 0)) / 2)
    if product.get('type', 'item') == 'item' and 'amount' in product:
        # data.raw precedes integer coercion. Recycling also stores the fractional
        # part in extra_count_fraction; count that fraction exactly once.
        amount = math.floor(amount) + product.get('extra_count_fraction', 0)
    return round(amount * product.get('probability', 1), 9)


def factorio():
    data = json.loads((ROOT / 'scripts/data/factorio-recipes-2.0.65.json').read_text(encoding='utf-8'))
    recipes = [r for r in data['recipes'] if r.get('results')]
    products = {p['name'] for r in recipes for p in r['results']}
    material_id = lambda p: f'material:{p["type"]}:{p["name"]}'
    regular = [r for r in recipes if not r.get('category', '').startswith('recycling') or r['name'] == 'scrap-recycling']
    # Extraction, harvesting, collection and spoilage are outside this recipe
    # snapshot. Do not replace mined ore with an asteroid/recycling alternative.
    boundaries = set('iron-ore copper-ore stone coal uranium-ore calcite tungsten-ore crude-oil water lava ammoniacal-solution fluorine lithium-brine scrap yumako jellynut wood raw-fish biter-egg spoilage metallic-asteroid-chunk carbonic-asteroid-chunk oxide-asteroid-chunk promethium-asteroid-chunk'.split())
    producers = {}
    for recipe in regular:
        # Unpacking moves a fluid between containers; it cannot supply that fluid
        # to its own filling recipe. Keep these recipes in the full network.
        if recipe.get('subgroup') == 'empty-barrel':
            continue
        for product in recipe['results']:
            consumed = sum(p['amount'] for p in recipe.get('ingredients', []) if material_id(p) == material_id(product))
            if expected(product) > consumed:
                producers.setdefault(material_id(product), []).append(recipe)

    def with_upstream(focus):
        selected = {r['name']: r for r in focus}
        pending = list(focus)
        visited = set()
        while pending:
            recipe = pending.pop()
            for material in recipe.get('ingredients', []):
                key = material_id(material)
                if key in visited or material['name'] in boundaries:
                    continue
                visited.add(key)
                candidates = producers.get(key, [])
                if not candidates:
                    continue
                # A deterministic representative route keeps topic views useful.
                # All products retains every alternative, including recycling.
                producer = min(candidates, key=lambda r: (
                    r.get('category', '').startswith('recycling'),
                    r['name'] != material['name'],
                    any(material_id(p) == key for p in r.get('ingredients', [])),
                    len(r.get('surface_conditions', [])),
                    len(r.get('ingredients', [])), r['name']))
                if producer['name'] not in selected:
                    selected[producer['name']] = producer
                    pending.append(producer)
        return sorted(selected.values(), key=lambda r: r['name'])
    title = lambda name: name.replace('-', ' ').capitalize()
    provenance = {k: data[k] for k in ('version', 'source', 'dump', 'sha256')}
    metadata = {**provenance, 'quantityBasis': 'One craft of each recipe; expected output; normal quality; no productivity bonus.',
                'interpretation': 'Shared materials connect producing and consuming recipes across the full network. Return flows preserve recycling and catalysts. Quantities are per craft, not balanced factory throughput.',
                'recipeCount': len(recipes), 'productCount': len(products)}

    def atlas(name, focus, expand=True):
        selected = with_upstream(focus) if expand else focus
        nodes, edges = {}, []
        for recipe in selected:
            rid = 'recipe:' + recipe['name']
            category = recipe.get('category', 'crafting')
            nodes[rid] = {'title': title(recipe['name']), 'type': 'Recipe', 'color': '#a68458',
                          'define': f'{title(category)} · {recipe.get("energy_required", 0.5):g} s per craft.',
                          'viewRole': 'Focus' if recipe in focus else 'Upstream',
                          'recipe': recipe['name'], 'category': category, 'secondsPerCraft': recipe.get('energy_required', 0.5),
                          'ingredients': recipe.get('ingredients', []), 'products': recipe['results'],
                          'surfaceConditions': recipe.get('surface_conditions', []),
                          'notes': '[Quantities and sources](./README.md)'}
            for direction, entries in [('input', recipe.get('ingredients', [])), ('output', recipe['results'])]:
                for index, p in enumerate(entries):
                    material = material_id(p)
                    unit = 'fluid units' if p['type'] == 'fluid' else 'items'
                    nodes[material] = {'title': title(p['name']), 'type': 'Fluid' if p['type'] == 'fluid' else 'Material',
                                       'color': '#6696a8' if p['type'] == 'fluid' else '#74957a',
                                       'define': f'Shared material · {unit} per craft.', 'productId': p['name'], 'unit': unit,
                                       'notes': '[Reading this diagram](./README.md)'}
                    value = p['amount'] if direction == 'input' else expected(p)
                    assert value > 0, (recipe['name'], p)
                    edges.append({'id': f'{rid}:{direction}:{index}', 'source': material if direction == 'input' else rid,
                                  'target': rid if direction == 'input' else material, 'value': value,
                                  'metadata': {'label': f'{unit}/craft', 'recipe': recipe['name'], 'unit': unit, 'role': direction,
                                               **({'feedback': True} if direction == 'output' and (
                                                   (category.startswith('recycling') and recipe['name'] != 'scrap-recycling') or
                                                   any(material_id(i) == material for i in recipe.get('ingredients', []))) else {})}})
        source_materials = {e['source'] for e in edges if e['source'].startswith('material:')}
        produced_materials = {e['target'] for e in edges if e['target'].startswith('material:')}
        for key in source_materials - produced_materials:
            nodes[key]['define'] = 'External supply · extraction, harvesting or another non-recipe process.'
        return graph(name, nodes, edges, 'sankey', {**metadata, 'viewRecipeCount': len(selected),
                     'focusRecipes': [r['name'] for r in focus], 'upstreamRecipeCount': len(selected) - len(focus),
                     'externalInputs': sorted(source_materials - produced_materials),
                     'upstreamPolicy': 'Representative non-recycling recipes to external resources; all alternatives are in All products.' if expand else 'Every recipe in the pinned snapshot.'})

    graphs = {'start-here.json': atlas('Start here · circuit production', [r for r in recipes if r['name'] in ('copper-cable', 'electronic-circuit')]),
              'all-products.json': atlas(f'All products · {len(recipes)} recipes', recipes, expand=False)}
    groups = [
        ('electronics', 'Electronics', lambda r: 'electronic' in r.get('category', '') or r['name'] in ('copper-cable', 'electronic-circuit', 'advanced-circuit', 'processing-unit')),
        ('science', 'Science packs', lambda r: 'science-pack' in r['name']),
        ('metallurgy', 'Smelting and metallurgy', lambda r: 'metallurgy' in r.get('category', '') or r.get('category') == 'smelting'),
        ('chemistry', 'Chemistry and oil', lambda r: 'chemistry' in r.get('category', '') or r.get('category') == 'oil-processing'),
        ('biology', 'Biology and agriculture', lambda r: 'organic' in r.get('category', '') or r.get('category') == 'captive-spawner-process'),
        ('cryogenics', 'Cryogenics', lambda r: 'cryogenics' in r.get('category', '')),
        ('space', 'Asteroids and space', lambda r: r.get('category') in ('crushing', 'rocket-building') or r['name'].startswith(('space-', 'asteroid-'))),
        ('electromagnetics', 'Electromagnetics', lambda r: r.get('category') == 'electromagnetics'),
        ('nuclear', 'Nuclear processing', lambda r: r.get('category') == 'centrifuging'),
        ('crafting', 'General manufacturing', lambda r: r.get('category', 'crafting') in ('crafting', 'advanced-crafting', 'crafting-with-fluid', 'pressing')),
    ]
    for slug, name, predicate in groups:
        graphs[f'{slug}.json'] = atlas(name, [r for r in regular if predicate(r)])
    graphs['recycling.json'] = atlas('Recycling · all recovery recipes', [r for r in recipes if r.get('category', '').startswith('recycling')])
    readme = f'''# Factorio production

A recipe reference for Factorio **2.0.65 with Space Age**, pinned to the official wiki's data.raw snapshot. It includes **{len(recipes)} production and recycling recipes** and **{len(products)} distinct recipe products**. All recipe products in that snapshot are included; ten parameter placeholders and the empty recipe-unknown placeholder are excluded.

## Explore

Start here follows iron and copper ore through smelting, copper cable and electronic circuits. Choose All products for the connected network of every recipe, or a focused manufacturing view in Explorer. Topic views recursively include representative upstream recipes, stopping at external resources. They use production before recycling, prefer the material's named recipe, then non-catalytic recipes with fewer surface constraints and ingredients. Unpacking a barrel is not treated as a source of its own fluid. Other alternatives remain available in All products. Double-click a recipe for its original ingredients, results, crafting time and surface conditions. Item names are readable forms of the official prototype identifiers.

## Read the flows

Each item or fluid has one shared material node connecting **all producing and consuming recipes in the view**. Follow a material across as many production stages as its dependencies require. Recycling outputs and catalyst returns use return bands below the chart; additional cycles are routed there automatically. Arrows and Return flow labels retain the original direction. No relationship is dropped or duplicated to flatten the diagram.

The complete network includes every recipe alternative at once, so it is large. Use topic views for readable chains. Their focusRecipes, upstreamRecipeCount and externalInputs metadata explain their scope. Raw mined resources, harvested inputs, collected asteroid chunks and spoilage can enter from outside the recipe model; no mining or harvesting recipe is invented. Catalyst cycles require an initial supply that is not calculated here.

Band values are the quantities for **one craft of each recipe**, at normal quality with no productivity bonus. Probabilistic outputs show expected amounts. Recycling fractions are counted once after integer coercion of the item amount. These are recipe quantities, not a balanced factory plan or rates per second.

Item counts and fluid units have different units; combined band widths must not be read as conserved mass or energy. Recipe nodes commonly have unequal incoming and outgoing totals. Surface constraints, temperatures and catalyst quantities remain available in the recipe details. Machine speed, quality, productivity, power and transport are outside this model.

Raw resources are boundary inputs. Non-recipe events such as mining, harvesting, spoiling and rocket launch transformations are outside the recipe atlas. All products means all recipe outputs in this version, not every possible entity or inventory item. Mods and later versions may differ.

## Sources

- [Official Factorio wiki: data.raw](https://wiki.factorio.com/Data.raw)
- [Wiki-linked 2.0.65 Space Age snapshot]({data['dump']})
- [Wube's official prototype repository](https://github.com/wube/factorio-data)
- [Official product quantity documentation](https://lua-api.factorio.com/latest/types/ItemProductPrototype.html)

Source SHA-256: `{data['sha256']}`.

This community example uses factual recipe quantities. Factorio is a game by Wube Software; this workspace is not an official Wube product.
'''
    write_workspace('factorio', 'Factorio production', graphs, {'README.md': readme}, 'start-here.json', metadata)
    print(f'Factorio coverage: {len(recipes)} recipes, {len(products)} products')


def energy():
    demo = json.loads((ROOT / 'public/sankey-example.json').read_text(encoding='utf-8'))
    for node in demo['nodes'].values():
        node['notes'] = '[About the flows](./README.md)'
    write_workspace('energy', 'Energy flows', {'energy.json': demo}, {'README.md': '# Energy flows\n\nAn illustrative energy system measured in GWh. The source values are invented for this example. Every intermediate node conserves incoming and outgoing energy.\n\nBand width encodes quantity. Double-click a node to inspect its details. Try the Sankey controls in Settings → Layout and node shadows in Settings → Appearance.\n'}, 'energy.json')


mathematics()
factorio()
energy()
