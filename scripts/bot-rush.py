import argparse
from bot_engine import execute
from niuma import ROOT
p=argparse.ArgumentParser();p.add_argument('--n',type=int,default=100);p.add_argument('--mode',choices=['hot','spread'],default='spread');p.add_argument('--version',choices=['v1','v2'],default='v2');p.add_argument('--read');a=p.parse_args()
if a.read:
 target=(ROOT/a.read).resolve()
 if not target.is_relative_to((ROOT/'evidence').resolve()) or not target.name.startswith('stress-') or target.suffix!='.json':raise ValueError('Read accepts only public evidence/stress-*.json records')
 print(target.read_text(encoding='utf-8'))
else:
 r=execute(a.n,a.mode,a.version);raise SystemExit(0 if r['successful']==a.n else 1)
