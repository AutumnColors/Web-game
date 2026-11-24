import json, re, subprocess, pathlib, datetime, html
root=pathlib.Path('.')
skip={'.git','.github','node_modules','vendor','dist','build','coverage','__pycache__','.next','legacy'}
def allowed(p):
    return not any(part in skip or part.startswith('.') for part in p.parts)
def git(*args):
    return subprocess.run(['git',*args],capture_output=True,text=True,check=True).stdout.strip()
def title_for(path):
    raw=path.read_text(encoding='utf-8',errors='replace')[:25000]
    match=re.search(r'<title[^>]*>(.*?)</title>',raw,re.I|re.S)
    title=html.unescape(re.sub(r'\s+',' ',match.group(1)).strip()) if match else ''
    if not title or title.lower() in {'index','untitled','app','games','document'}:
        title=path.parent.name.replace('-',' ').replace('_',' ').title() if path.name=='index.html' else path.stem.replace('-',' ').replace('_',' ').title()
    return title
entries=[]
for path in root.rglob('*.html'):
    if not allowed(path) or path.as_posix()=='index.html': continue
    # Every index.html is an app entry; standalone HTML pages are also launchable.
    rel=path.as_posix()
    directory=path.parent.as_posix()
    scope=directory if path.name=='index.html' else rel
    try:
        log=git('log','-1','--format=%cI%x00%s','--',scope)
        date,update=(log.split('\x00',1)+[''])[:2] if log else ('','')
    except Exception:
        date,update='',''
    if path.name=='index.html':
        url=directory.rstrip('/')+'/'
        category=path.parent.parent.name.replace('-',' ').title() if len(path.parts)>2 else 'Apps'
    else:
        url=rel
        category=path.parent.name.replace('-',' ').title() if len(path.parts)>1 else 'Standalone'
    entries.append({'path':url,'title':title_for(path),'category':category,'date':date or None,'update':update[:180]})
entries.sort(key=lambda x:(x['date'] or '',x['title'].lower()),reverse=True)
output={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'apps':entries}
pathlib.Path('app-catalog.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Discovered',len(entries),'HTML entry points')
