"""Refresh the attributed world-city snapshot (network required, standard library only).

The offline builder is build-world-cities.py. Raw inputs are cached under .spatial-data.
All GeoNames PPLC/PPLA records are retained regardless of population, alongside
cities of >=100,000 people and the original Natural Earth 110m reference places.
"""
import collections
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import sqlite3
import struct
import urllib.request
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.spatial-data'
CACHE.mkdir(exist_ok=True)
GEONAMES = 'https://download.geonames.org/export/dump/'
UCDB = ('https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_UCDB_GLOBE_R2024A/'
        'GHS_UCDB_THEME_GLOBE_R2024A/GHS_UCDB_THEME_SOCIOECONOMIC_GLOBE_R2024A/'
        'V1-2/GHS_UCDB_THEME_SOCIOECONOMIC_GLOBE_R2024A_V1_2.zip')
sources = {}


def fetch(name, url):
    path = CACHE / name
    if not path.exists():
        payload = urllib.request.urlopen(url, timeout=120).read()
        path.write_bytes(payload)
    sources[name] = {'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    return path


def lines(name):
    return fetch(name, GEONAMES + name).read_text(encoding='utf-8').splitlines()


def zip_lines(path):
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith('.txt') and n != 'readme.txt')
        with z.open(name) as f:
            yield from io.TextIOWrapper(f, encoding='utf-8')


countries = {r[0]: r for s in lines('countryInfo.txt') if not s.startswith('#') and (r := s.split('\t')) and len(r) > 16}
admin1 = {r[0]: r[1] for s in lines('admin1CodesASCII.txt') if len(r := s.split('\t')) >= 4}
raw = [s.rstrip('\n').split('\t') for s in zip_lines(fetch('cities5000.zip', GEONAMES + 'cities5000.zip'))]
all_by_id = {r[0]: r for r in raw}
selected = {r[0]: r for r in raw if r[7] in ('PPLC', 'PPLA') or (r[7] not in ('PPLX', 'PPLQ', 'PPLH') and int(r[14]) >= 100000)}
ne = json.loads(fetch('cities.json', 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places.geojson').read_text(encoding='utf-8'))['features']
ne_by_id = {}
unmatched = []
def normalized_name(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value).casefold() if c.isalnum())

for index, f in enumerate(ne):
    p = f['properties']
    gid = str(p['GEONAMESID'])
    if gid not in all_by_id:
        candidates = [r for r in raw if r[8] == p['ISO_A2'] and
                      normalized_name(p['NAME']) in (normalized_name(r[1]), normalized_name(r[2])) and
                      abs(float(r[4]) - p['LATITUDE']) < 0.2 and abs(float(r[5]) - p['LONGITUDE']) < 0.2]
        if len(candidates) == 1:
            gid = candidates[0][0]
    if gid in all_by_id:
        selected[gid] = all_by_id[gid]
        ne_by_id[gid] = (index, p)
    else:
        unmatched.append((index, f))
print('Selected GeoNames cities:', len(selected), 'NE supplements:', len(unmatched), flush=True)

config = json.loads((ROOT / 'scripts/spatial-city-names.json').read_text(encoding='utf-8'))
ne10 = json.loads(fetch('cities-10m.json', 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson').read_text(encoding='utf-8'))['features']
ne10_by_id = {str(f['properties']['GEONAMESID']): f['properties'] for f in ne10}
# Prefer a region's language where several national languages are available.
REGIONAL_LANGUAGES = {
    'IN': {'Kerala': 'ml', 'Tamil Nadu': 'ta', 'Puducherry': 'ta', 'Andhra Pradesh': 'te',
           'Telangana': 'te', 'Karnataka': 'kn', 'West Bengal': 'bn', 'Tripura': 'bn',
           'Maharashtra': 'mr', 'Gujarat': 'gu', 'Assam': 'as', 'Odisha': 'or',
           'Punjab': 'pa', 'Chandigarh': 'pa', 'Goa': 'kok', 'Sikkim': 'ne',
           'Lakshadweep': 'ml', 'Nagaland': 'en', 'Meghalaya': 'en', 'Mizoram': 'en'},
    'CH': {'Geneva': 'fr', 'Vaud': 'fr', 'Neuchâtel': 'fr', 'Jura': 'fr', 'Valais': 'fr',
           'Fribourg': 'fr', 'Ticino': 'it'},
    'BE': {'Flanders': 'nl', 'Wallonia': 'fr'}, 'CA': {'Quebec': 'fr'},
}
by_country = collections.defaultdict(set)
for gid, r in selected.items():
    by_country[r[8]].add(gid)


def names_for_country(code):
    ids = by_country[code]
    local = {}
    country = countries[code]
    languages = {s.split('-')[0] for s in country[15].split(',')}
    primary = config['countryLanguages'].get(country[1], next(iter(sorted(languages)), 'en'))
    languages.add(primary)
    languages.update({'zh-Hant', 'zh-TW'} if code in ('TW', 'HK', 'MO') else [])
    # The original globe has reviewed city-specific endonyms in additional languages.
    for gid in ids:
        if gid in ne_by_id:
            languages.update(config['cityOverrides'].get(ne_by_id[gid][1]['NAME'], {}))
    path = fetch('city-names-' + code + '.zip', GEONAMES + 'alternatenames/' + code + '.zip')
    for s in zip_lines(path):
        r = s.rstrip('\n').split('\t')
        if len(r) < 8 or r[1] not in ids or r[2] not in languages or r[6] == '1' or r[7] == '1':
            continue
        key = (r[1], r[2])
        rank = (r[4] == '1', r[5] == '1', -len(r[3]), r[3])
        if key not in local or rank > local[key][0]:
            local[key] = (rank, r[3])
    return code, local


local_names = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for code, local in pool.map(names_for_country, sorted(by_country)):
        local_names.update({k: v[1] for k, v in local.items()})
print('Localized names:', len(local_names), flush=True)

# UCDB polygons and points share World Mollweide EPSG:54009. A point is assigned
# only to a polygon that contains it: no nearest-city GDP guessing across gaps.
ucdb_path = fetch('ucdb-economy.zip', UCDB)
with zipfile.ZipFile(ucdb_path) as z:
    member = next(n for n in z.namelist() if n.endswith('.gpkg'))
    z.extract(member, CACHE)
db = sqlite3.connect(CACHE / member)
table = 'GHSL_UCDB_THEME_SOCIOECONOMIC_GLOBE_R2024A'


def mollweide(lon, lat):
    phi = math.radians(lat)
    theta = phi
    for _ in range(20):
        den = 2 + 2 * math.cos(2 * theta)
        if abs(den) < 1e-12:
            break
        delta = (2 * theta + math.sin(2 * theta) - math.pi * math.sin(phi)) / den
        theta -= delta
        if abs(delta) < 1e-12:
            break
    return (2 * math.sqrt(2) * 6378137 / math.pi * math.radians(lon) * math.cos(theta),
            math.sqrt(2) * 6378137 * math.sin(theta))


def polygons(blob):
    envelope = (blob[3] >> 1) & 7
    offset = 8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[envelope]

    def geometry():
        nonlocal offset
        endian = '<' if blob[offset] else '>'
        kind, count = struct.unpack_from(endian + 'II', blob, offset + 1)
        offset += 9
        if kind == 6:
            return [p for _ in range(count) for p in geometry()]
        if kind != 3:
            raise ValueError('Expected 2D polygon, got ' + str(kind))
        rings = []
        for _ in range(count):
            n = struct.unpack_from(endian + 'I', blob, offset)[0]
            offset += 4
            ring = list(struct.iter_unpack(endian + 'dd', blob[offset:offset + n * 16]))
            offset += n * 16
            rings.append(ring)
        return [rings]
    return geometry()


def inside_ring(x, y, ring):
    inside = False
    for i, (ax, ay) in enumerate(ring):
        bx, by = ring[i - 1]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


polygon_cache = {}


def economy(lon, lat):
    x, y = mollweide(lon, lat)
    matches = []
    for row in db.execute(f'SELECT t.fid,t.geom,t.ID_UC_G0,t.GC_UCN_MAI_2025,t.SC_GDP_SUM_2020 FROM "{table}" t JOIN "rtree_{table}_geom" r ON t.fid=r.id WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=?', (x, x, y, y)):
        fid, blob, uid, name, gdp = row
        if fid not in polygon_cache:
            polygon_cache[fid] = polygons(blob)
        if any(inside_ring(x, y, p[0]) and not any(inside_ring(x, y, hole) for hole in p[1:]) for p in polygon_cache[fid]):
            matches.append({'urbanCentreId': uid, 'urbanCentreName': name,
                            'gdpPpp2020': gdp if isinstance(gdp, (int, float)) and gdp > 0 else None})
    return matches[0] if len(matches) == 1 else {'gdpPpp2020': None}


CONTINENTS = {'AF': 'Africa', 'AS': 'Asia', 'EU': 'Europe', 'NA': 'North America', 'SA': 'South America', 'OC': 'Oceania', 'AN': 'Antarctica'}
rows = []
for gid, r in sorted(selected.items(), key=lambda item: int(item[0])):
    country = countries[r[8]]
    languages = list(dict.fromkeys([config['countryLanguages'].get(country[1], '')] + [s.split('-')[0] for s in country[15].split(',')]))
    if r[8] in ('TW', 'HK', 'MO'):
        languages = ['zh-Hant', 'zh-TW', 'zh'] + languages
    native = {lang: local_names[(gid, lang)] for lang in languages if (gid, lang) in local_names}
    p10 = ne10_by_id.get(gid)
    if p10:
        for lang in languages:
            value = p10.get('NAME_ZHT' if lang == 'zh-Hant' else 'NAME_' + lang.upper())
            if value and (lang not in native or lang == 'zh'):
                native[lang] = value
    # Some GeoNames local-script names have no language tag. Use these only for
    # Chinese places with an unambiguous Han-only alternate, and record the method.
    if r[8] == 'CN' and 'zh' not in native:
        han = [n for n in r[3].split(',') if n and all('\u3400' <= c <= '\u9fff' or c in '·（）' for c in n)]
        if han:
            native['zh'] = min(han, key=lambda n: (len(n), n))
    primary = REGIONAL_LANGUAGES.get(r[8], {}).get(admin1.get(r[8] + '.' + r[10]))
    ordered = list(dict.fromkeys(([primary] if primary else []) + languages))
    native = {lang: native[lang] for lang in ordered if lang in native}
    if r[8] == 'VN' and 'vi' in native and normalized_name(r[1]) == normalized_name(native['vi']):
        # Keep source diacritics when a language-tagged alternate is ASCII-only.
        if sum(ord(c) > 127 for c in r[1]) > sum(ord(c) > 127 for c in native['vi']):
            native['vi'] = r[1]
    original = ne_by_id.get(gid)
    if original:
        overrides = config['cityOverrides'].get(original[1]['NAME'], {})
        native = {**overrides, **{k: v for k, v in native.items() if k not in overrides}}
    # Retain an explicit source-name fallback, never label an English exonym native.
    title = next(iter(native.values()), r[1])
    lon, lat = float(r[5]), float(r[4])
    rows.append({'id': 'city:' + str(original[0]) if original else 'geonames:' + gid,
                 'geonamesId': int(gid), 'title': title, 'name_native': native, 'name_en': original[1]['NAME'] if original else r[1],
                 'nameStatus': 'local-language' if native else 'source-name fallback',
                 'country': country[4], 'countryCode': r[8], 'admin1Code': r[8] + '.' + r[10],
                 'admin1': admin1.get(r[8] + '.' + r[10], ''), 'featureCode': r[7],
                 'population': int(r[14]), 'type': CONTINENTS[country[8]],
                 'longitude': lon, 'latitude': lat, 'economy': economy(lon, lat)})
for index, f in unmatched:
    p = f['properties']
    lon, lat = f['geometry']['coordinates']
    language = config['countryLanguages'][p['ADM0_A3']]
    native = config['cityOverrides'].get(p['NAME']) or {language: p.get('NAME_ZHT' if language == 'zh-Hant' else 'NAME_' + language.upper()) or p['NAME']}
    country = countries.get(p['ISO_A2'])
    rows.append({'id': 'city:' + str(index), 'title': next(iter(native.values())), 'name_native': native,
                 'name_en': p['NAME'], 'nameStatus': 'local-language', 'country': p['ADM0NAME'],
                 'countryCode': p['ISO_A2'], 'admin1': p['ADM1NAME'], 'featureCode': p['FEATURECLA'],
                 'population': p['POP_MAX'], 'type': CONTINENTS[country[8]] if country else 'Asia',
                 'longitude': lon, 'latitude': lat, 'economy': economy(lon, lat)})
snapshot = {'retrieved': str(datetime.date.today()), 'selection': 'All PPLC and PPLA, plus population >=100000 (excluding city sections/abandoned/historical places), plus original 243 Natural Earth places.',
            'sources': dict(sorted(sources.items())), 'capitalIds': sorted(int(r[0]) for r in raw if r[7] in ('PPLA', 'PPLC')),
            'cities': rows}
(ROOT / 'scripts/world-cities-source.json').write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('Saved', len(rows), 'cities;', sum(r['economy']['gdpPpp2020'] is not None for r in rows), 'with UCDB GDP;', sum(not r['name_native'] for r in rows), 'name fallbacks', flush=True)
