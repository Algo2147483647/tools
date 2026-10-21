"""Build the globe offline from the attributed GeoNames / GHSL snapshot.

Refresh source data separately with fetch-world-cities.py. Point AREA, not radius,
grows with log10 urban-centre GDP (2020 PPP). Missing GDP is a hollow point.
"""
import collections
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/examples/spatial-atlas'


def point_style(gdp):
    if gdp is None:
        return {'radius': 2.1, 'opacity': 0.75, 'hollow': True, 'label': True}
    score = max(0, min(1, (math.log10(gdp) - 8) / 4))
    return {'radius': round(math.sqrt(2.25 + score * 40), 3),
            'opacity': round(0.35 + 0.65 * score, 3), 'label': True}


def build():
    snapshot = json.loads((ROOT / 'scripts/world-cities-source.json').read_text(encoding='utf-8'))
    nodes = {}
    capital_counts = collections.Counter()
    matched = 0
    for row in snapshot['cities']:
        data = {k: v for k, v in row.items() if k not in ('id', 'longitude', 'latitude', 'economy')}
        gdp = row['economy']['gdpPpp2020']
        economic = {**row['economy'], 'year': 2020, 'unit': 'PPP',
                    'metric': 'Urban-centre GDP estimate', 'sourceField': 'SC_GDP_SUM_2020',
                    'match': 'point within UCDB urban-centre polygon' if gdp is not None else 'unavailable',
                    'source': 'https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php'}
        if gdp is not None:
            matched += 1
            economic_text = f"Urban-centre GDP estimate (2020 PPP): {gdp:,.0f}; UCDB {economic['urbanCentreId']} ({economic['urbanCentreName']}). Shared urban centres share the same estimate; not municipal GDP."
        else:
            economic_text = 'No matched urban-centre GDP estimate; hollow point means unavailable, not zero.'
        if row['featureCode'] in ('PPLA', 'PPLC'):
            capital_counts[row['countryCode']] += 1
        source = ('https://www.geonames.org/' + str(row['geonamesId']) + '/' if 'geonamesId' in row
                  else 'https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-populated-places/')
        nodes[row['id']] = {**data, 'space': [6371, row['longitude'], row['latitude']],
                            'economy': economic, 'spatialStyle': {**point_style(gdp), 'labelPriority': 2 if row['featureCode'] == 'PPLC' else 1 if row['featureCode'] == 'PPLA' else 0}, 'source': source,
                            'name_source': 'GeoNames alternate names; Natural Earth NAME fields; reviewed endonyms. See SOURCES.md for selection and fallbacks.' if 'geonamesId' in row else 'Natural Earth NAME fields',
                            'define': f"{row['name_en']} · {row.get('admin1', '')} · {row['country']}. {row['featureCode']}. {economic_text}"}
    present = {n.get('geonamesId') for n in nodes.values()}
    assert set(snapshot['capitalIds']) <= present, 'A source capital has been omitted'
    missing = len(nodes) - matched
    doc = {'format': 'graph-studio', 'version': 3, 'title': '全球首府与主要城市 · World capitals & cities',
           'metadata': {
               'space': {'dimensions': 3, 'coordinateSystem': 'spherical', 'angleUnit': 'degrees',
                         'axes': ['Radius', 'Longitude', 'Latitude'], 'unit': 'km'},
               'coverage': {'cityCount': len(nodes), 'capitalCount': len(snapshot['capitalIds']),
                            'countryAndTerritoryCount': len({n['countryCode'] for n in nodes.values()}),
                            'capitalCountsByCountry': dict(sorted(capital_counts.items())),
                            'selection': snapshot['selection'], 'retrieved': snapshot['retrieved'],
                            'scope': 'Every PPLC/PPLA record in the source snapshot, with no population threshold for capitals. Administrative classifications follow GeoNames.'},
               'economy': {'source': 'GHS-UCDB R2024A V1.2, European Commission JRC',
                           'sourceField': 'SC_GDP_SUM_2020', 'year': 2020, 'unit': 'PPP',
                           'matchedCityCount': matched, 'unavailableCityCount': missing,
                           'method': 'Containment in UCDB 2025 urban-centre polygons (EPSG:54009). GDP is the modeled 2020 total for that urban centre, not municipal GDP or per-capita income. No nearest-city or country-value substitution.',
                           'encoding': 'score = clamp((log10(GDP)-8)/4, 0, 1); radius = sqrt(2.25+40*score); opacity = 0.35+0.65*score. Stable across Type filtering. Missing GDP: hollow radius 2.1.'},
               'spatialLegend': {'title': 'Urban-centre economy · 2020 GDP (PPP)',
                                 'description': f'Larger / darker = larger estimated economy · logarithmic scale. {matched:,} matched; {missing:,} unavailable (hollow). Shared urban centres share an estimate; not municipal GDP.',
                                 'items': [{**point_style(gdp), 'label': label} for label, gdp in [('100M', 1e8), ('10B', 1e10), ('1T+', 1e12), ('Unavailable', None)]]},
               'sources': ['https://www.geonames.org/', 'https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php', 'https://www.naturalearthdata.com/'],
               'note': 'Local-language titles, spherical coordinates, Type by continent. Cities are independent locations; no invented transportation links. Source names are explicitly marked when a local-language alternate is unavailable.'},
           'nodes': nodes, 'edges': []}
    OUT.mkdir(parents=True, exist_ok=True)
    # One city per line keeps a large offline atlas reviewable without a 300k-line diff.
    header = json.dumps({k: v for k, v in doc.items() if k not in ('nodes', 'edges')}, ensure_ascii=False, indent=2)
    records = ',\n'.join('    ' + json.dumps(key) + ': ' + json.dumps(node, ensure_ascii=False) for key, node in nodes.items())
    payload = header[:-2] + ',\n  "nodes": {\n' + records + '\n  },\n  "edges": []\n}\n'
    (OUT / 'world-cities.json').write_text(payload, encoding='utf-8')
    print(f'world-cities.json: {len(nodes)} cities, {len(snapshot["capitalIds"])} capitals, {matched} GDP matches, {missing} unavailable')


if __name__ == '__main__':
    build()
