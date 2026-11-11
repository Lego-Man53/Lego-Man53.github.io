#!/usr/bin/env python3
"""Reproduce the minimal fix for the client log's four unwritten shader outputs."""
import hashlib,json,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'received/java-generated-pack-c18b6e3b7ff8.zip'
out=ROOT/'dist/java-minimap-fixed.zip'
target='nminimap_26_3/assets/minecraft/shaders/core/text.vsh'
initializers='''    // Initialize outputs on GUI and see-through paths, as in the 26.2 shader.
    custom = 0;
    uvCoord = vec2(0);
    b_meta = vec3(0);
    box = vec4(0);
'''
with zipfile.ZipFile(source) as old,zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as new:
    for info in old.infolist():
        data=old.read(info.filename)
        if info.filename==target:
            text=data.decode()
            assert text.count('void main() {')==1
            assert 'custom = 0;' not in text
            text=text.replace('void main() {','void main() {\n'+initializers)
            data=text.encode()
        new.writestr(info,data)
with zipfile.ZipFile(source) as old,zipfile.ZipFile(out) as new:
    assert new.testzip() is None
    assert old.namelist()==new.namelist()
    changed=[name for name in old.namelist() if old.read(name)!=new.read(name)]
    assert changed==[target],changed
    fixed=new.read(target).decode()
    previous=old.read('nminimap_26_2/assets/minecraft/shaders/core/text.vsh').decode()
    for statement in ('custom = 0;','uvCoord = vec2(0);','b_meta = vec3(0);','box = vec4(0);'):
        assert statement in previous
        assert fixed.index(statement)>fixed.index('void main() {')
        assert fixed.index(statement)<fixed.index('    gl_Position =')
    # All four reported interface locations are written unconditionally before branch selection.
    for location,name in [(4,'custom'),(5,'uvCoord'),(6,'b_meta'),(7,'box')]:
        assert f'location = {location}' in fixed
        assert f'{name} =' in fixed.split('void main() {')[1].split('gl_Position')[0]
digest=hashlib.sha1(out.read_bytes()).hexdigest()
meta={'sha1':digest,'url':f'https://yusufmm.com/minecraft/nminimap-{digest[:12]}.zip','path':str(out),'changed_file':target}
(ROOT/'dist/java-shader-fix.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta,indent=2))
print('PASS: exactly one shader changed; all four outputs initialize before every rendering branch.')
