#!/usr/bin/env python3
"""Build world/layers/typical-income.json: what the typical person lives on, one frame per decade.

    python3 tools/world/build_typical_income.py

Sources (in tools/world/sources/, not committed; download them first)
  owid_median_income_per_day.csv      Median income or consumption per person per day
  owid_mean_income_per_day.csv        Mean income or consumption per person per day
  owid_p10_threshold_per_day.csv      Income below which the poorest 10% live
  owid_p90_threshold_per_day.csv      Income above which the richest 10% live
      All four: World Bank Poverty and Inequality Platform (household surveys), in 2017 international $,
      as exported by Our World in Data (grapher CSV downloads: "Country,Year,value").
  API_NY.GDP.PCAP.PP.KD_2017ppp.csv   World Bank GDP per capita, PPP, constant 2017 intl $
      (WDI edition of 2023-09-19, the last one in 2017 prices), bulk CSV.

Each decade frame (1990, 2000, 2010, 2020) takes the survey closest to that year within the decade
around it (1985-1994, 1995-2004, ...). National surveys are used; where a country only has an urban
survey in that window, that one is used and noted. "Median vs GDP per person" puts the survey median
(per year) next to GDP per capita for the survey year, both in 2017 dollars.
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'sources')
OUT = os.path.join(ROOT, 'world', 'layers', 'typical-income.json')

YEARS = [1990, 2000, 2010, 2020]
ALIASES = {"Cote d'Ivoire": 'CIV', 'Czechia': 'CZE', 'Democratic Republic of Congo': 'COD',
           'East Timor': 'TLS', 'Sao Tome and Principe': 'STP', 'Micronesia (country)': 'FSM'}

countries = json.load(open(os.path.join(ROOT, 'world', 'countries.json'), encoding='utf-8'))
BY_NAME = {v: k for k, v in countries['names'].items()}


def iso_of(name):
    return ALIASES.get(name) or BY_NAME.get(name)


def owid(fn):
    """{(iso, urban?): {year: value}}"""
    out = {}
    with open(os.path.join(SRC, fn), encoding='utf-8') as f:
        rows = csv.reader(f)
        next(rows)
        for name, year, value in rows:
            urban = name.endswith(' (urban)')
            if '(' in name and not urban and name != 'Micronesia (country)':
                continue  # regions, rural-only series
            base = name[:-len(' (urban)')] if urban else name
            iso = iso_of(base)
            if iso and value:
                out.setdefault((iso, urban), {})[int(year)] = float(value)
    return out


def wb(path):
    lines = open(path, encoding='utf-8-sig').read().splitlines()
    s = next(i for i, l in enumerate(lines) if l.startswith('"Country Name"'))
    rows = list(csv.reader(lines[s:]))
    yi = {int(h): i for i, h in enumerate(rows[0]) if h.isdigit()}
    return {r[1]: {y: float(r[i]) for y, i in yi.items() if i < len(r) and r[i].strip()} for r in rows[1:]}


def pick(series, y):
    """Survey year closest to y within [y-5, y+4]; ties go to the later survey."""
    cands = [yy for yy in series if y - 5 <= yy <= y + 4]
    return min(cands, key=lambda yy: (abs(yy - y), -yy)) if cands else None


def main():
    med, mean = owid('owid_median_income_per_day.csv'), owid('owid_mean_income_per_day.csv')
    p10, p90 = owid('owid_p10_threshold_per_day.csv'), owid('owid_p90_threshold_per_day.csv')
    gdp = wb(os.path.join(SRC, 'API_NY.GDP.PCAP.PP.KD_2017ppp.csv'))
    isos = sorted({iso for iso, _ in med})
    data = {}
    for iso in isos:
        rec = {k: [] for k in ('median', 'mean', 'p10', 'p90', 'median_vs_mean', 'median_vs_gdp', 'survey')}
        urban_years = []
        for y in YEARS:
            key = (iso, False)
            yy = pick(med.get(key, {}), y)
            if yy is None:
                key = (iso, True)
                yy = pick(med.get(key, {}), y)
                if yy is not None:
                    urban_years.append(yy)
            if yy is None:
                for k in rec:
                    rec[k].append(None)
                continue
            m = med[key][yy]
            mn = mean.get(key, {}).get(yy)
            g = gdp.get(iso, {}).get(yy)
            rec['median'].append(round(m, 2))
            rec['mean'].append(round(mn, 2) if mn else None)
            rec['p10'].append(round(p10[key][yy], 2) if yy in p10.get(key, {}) else None)
            rec['p90'].append(round(p90[key][yy], 2) if yy in p90.get(key, {}) else None)
            rec['median_vs_mean'].append(round(m / mn * 100) if mn else None)
            rec['median_vs_gdp'].append(round(m * 365 / g * 100) if g else None)
            rec['survey'].append(yy)
        if all(v is None for v in rec['median']):
            continue
        if urban_years:
            rec['note'] = ('Urban areas only for the survey' + ('s' if len(urban_years) > 1 else '') +
                           ' of ' + ', '.join(map(str, urban_years)) + '; country-wide figures may be somewhat lower.')
        data[iso] = rec

    layer = {
        'id': 'typical-income',
        'title': 'Typical income',
        'badge': '½',
        'kind': 'choropleth',
        'time': {'years': YEARS, 'default': YEARS[-1], 'label': 'Decade'},
        'about': ('What the typical person actually lives on: the median income (or consumption) per person per day '
                  'from household surveys. Half the population lives on less, half on more. '
                  'Compare it with GDP per person to see how much of the economy shows up in household budgets: '
                  '"Median vs GDP per person" is the median times 365 as a share of GDP per capita. '
                  'GDP also counts company profits, government spending and investment, and surveys miss most top incomes, '
                  'so in most countries it is well below 100%; in the poorest it can come close, because surveys count home-grown food and other subsistence production that GDP largely misses. "Median vs mean" shows inequality among households: the lower it is, '
                  'the more the average is pulled up by the top. Each decade uses the survey closest to it; the survey year '
                  'is shown in brackets. Rich countries mostly survey income, many poorer ones consumption, so compare with care. '
                  'All amounts in 2017 international dollars per day (purchasing-power adjusted).'),
        'source': {
            'name': 'World Bank Poverty and Inequality Platform via Our World in Data; World Bank WDI (GDP, 2017 PPP)',
            'url': 'https://pip.worldbank.org'
        },
        'fields': [
            {'key': 'median', 'label': 'Median', 'unit': '$/day', 'format': 'perday', 'primary': True, 'yearKey': 'survey',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [2, 3, 5, 8, 12, 20, 30, 50]}},
            {'key': 'mean', 'label': 'Mean', 'unit': '$/day', 'format': 'perday', 'yearKey': 'survey',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [2, 3, 5, 8, 12, 20, 30, 50]}},
            {'key': 'p10', 'label': 'Poorest 10% below', 'unit': '$/day', 'format': 'perday',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [1, 1.5, 2.5, 4, 6, 10, 15, 25]}},
            {'key': 'p90', 'label': 'Richest 10% above', 'unit': '$/day', 'format': 'perday',
             'scale': {'type': 'log', 'palette': 'spectrum', 'bins': [5, 8, 12, 20, 30, 50, 75, 110]}},
            {'key': 'median_vs_gdp', 'label': 'Median vs GDP per person', 'unit': '%', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'spectrum', 'bins': [15, 20, 25, 30, 35, 40, 50, 60]}},
            {'key': 'median_vs_mean', 'label': 'Median vs mean', 'unit': '%', 'format': 'decimal',
             'scale': {'type': 'linear', 'palette': 'spectrum', 'bins': [55, 60, 65, 70, 75, 80, 85, 90]}},
            {'key': 'survey', 'label': 'Survey year', 'hidden': True}
        ],
        'data': data
    }
    head = {k: v for k, v in layer.items() if k != 'data'}
    c = dict(ensure_ascii=False, separators=(',', ':'))
    rows = ',\n'.join(f'{json.dumps(k, **c)}:{json.dumps(v, **c)}' for k, v in data.items())
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(json.dumps(head, **c)[:-1] + ',"data":{\n' + rows + '\n}}\n')
    print('typical-income', len(data), 'countries')
    for i, y in enumerate(YEARS):
        n = sum(1 for r in data.values() if r['median'][i] is not None)
        print(y, n, 'countries')


if __name__ == '__main__':
    main()
