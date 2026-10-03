# /// script
# requires-python = ">=3.11"
# dependencies = ["pefile==2024.8.26", "unicorn==2.1.4"]
# ///
# SPDX-License-Identifier: Apache-2.0
"""Generate deterministic synthetic oracles using hash-pinned native instructions.
Usage: uv run scripts/research/probe_static_model.py <windows depot>
No game process, game assets in output, or live qualification. CRT and KD build
instructions execute in Unicorn. Only preallocated memory replaces allocation.
"""
import json, math, struct, sys
from pathlib import Path
sys.dont_write_bytecode = True
from probe_native_query import Machine, PROFILES, TIER0_SHA256, STOP, STACK
from unicorn.x86_const import UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8, UC_X86_REG_R9, UC_X86_REG_RSP, UC_X86_REG_RAX, UC_X86_REG_XMM0, UC_X86_REG_XMM1, UC_X86_REG_XMM2, UC_X86_REG_XMM3

def f(x): return struct.unpack('<f',struct.pack('<f',x))[0]
def xmm(m, reg, value): m.uc.reg_write(reg,struct.unpack('<I',struct.pack('<f',value))[0])
def reset(m):
    m.uc.reg_write(UC_X86_REG_RSP,STACK+0xFFF08);m.put(STACK+0xFFF08,'Q',STOP)
def run_tree(path, points, queries):
    m=Machine(path,TIER0_SHA256)
    tree,nodes,blocks,pointers,vertices,query=0x100000,0x120000,0x110100,0x130000,0x140000,0x150000
    m.put(tree+8,'Q',nodes);m.put(tree+0x10,'I',2048)
    m.put(tree+0x18,'II',1024,len(points));m.put(tree+0x20,'IIIIQ',10,1023,1,1,blocks);m.put(blocks+8,'Q',pointers)
    for i,p in enumerate(points):m.put(vertices+12*i,'3f',*p)
    for reg,v in [(UC_X86_REG_RCX,tree),(UC_X86_REG_RDX,vertices),(UC_X86_REG_R8,len(points)),(UC_X86_REG_R9,3)]:m.uc.reg_write(reg,v)
    # The modest synthetic sets fit preallocated native node/pointer arrays.
    m.uc.emu_start(m.base+0x180730,STOP,count=5000000)
    from unicorn.x86_const import UC_X86_REG_RIP
    if m.reg(UC_X86_REG_RIP)!=STOP:raise RuntimeError('build instruction budget exhausted')
    order=[(m.get(pointers+i*8,'Q')[0]-vertices)//12 for i in range(len(points))]
    expected=[]
    for p in queries:
        reset(m);m.put(query,'3f',*p);m.uc.reg_write(UC_X86_REG_RCX,tree);m.uc.reg_write(UC_X86_REG_RDX,query);m.run(0x17FBD0)
        expected.append((m.reg(UC_X86_REG_RAX)-vertices)//12)
    return dict(points=points,queries=queries,expected=expected,partitionOrder=order)

def main():
    depot=Path(sys.argv[1]);tier=depot/'game/bin/win64/tier0.dll';client=depot/'game/csgo/bin/win64/client.dll'
    sets=[]
    for n in [1,8,9,16,33,127]:
        p=[[float((i*37)%23-11),float((i*17)%19-9),float((i*11)%13-6)] for i in range(n)]
        sets.append(run_tree(tier,p,[[float(i-10),float((i*5)%11-5),0.] for i in range(21)]+p[:10]))
    for p in [[[0.,0.,0.]]*12,[[float(i%3),0.,0.] for i in range(19)],[[float(i%2),float((i//2)%2),float((i//4)%2)] for i in range(16)]]:
        sets.append(run_tree(tier,p,[[0.,0.,0.],[0.5,0.5,0.5],[1.,1.,1.]]))
    t=Machine(tier,TIER0_SHA256);angles=[]
    for byte in range(256):
        reset(t);angle=f(f(f(byte/255)*360)*f(math.pi/180));xmm(t,UC_X86_REG_XMM0,angle)
        t.uc.reg_write(UC_X86_REG_RDX,0x160000);t.uc.reg_write(UC_X86_REG_R8,0x160004);t.run(0x8240)
        angles.append(list(t.get(0x160000,'2f')))
    c=Machine(client,PROFILES['client']['sha256']);scales=[];raw=[]
    for b in [f(0.45),f(0.53),f(0.47),f(f(0.53)-f(f(0.0599999725818634)*f(0.5)))]:
        for d in range(100):
            reset(c);c.put(0x160000,'Q',0x160100);c.put(0x160100,'B',d);c.uc.reg_write(UC_X86_REG_RCX,0x160000);xmm(c,UC_X86_REG_XMM1,b);c.run(0x7FDA70)
            scales.append([d,b,c.reg(UC_X86_REG_RAX)&255])
    for power in [0.,1.,700.,1000.25,2241.,16777216.]:
        for phase in [0,1,99,700,999,1000,1001,1799,1800,1801,5000,65535]:
            reset(c)
            for reg,val in [(UC_X86_REG_XMM0,phase),(UC_X86_REG_XMM1,power),(UC_X86_REG_XMM2,f(power+min(phase,1800))),(UC_X86_REG_XMM3,100.)]:xmm(c,reg,val)
            c.put(c.reg(UC_X86_REG_RSP)+0x28,'f',0.);c.run(0x2D0770)
            value=struct.unpack('<f',struct.pack('<I',c.reg(UC_X86_REG_XMM0)&0xffffffff))[0]
            reset(c);c.uc.reg_write(UC_X86_REG_RDX,0);c.uc.reg_write(UC_X86_REG_R8,255);c.run(0x7F5770)
            raw.append([power,phase,c.reg(UC_X86_REG_RAX)])
    print(json.dumps(dict(evidence='synthetic-native-instruction-oracle',qualified=False,binarySha256={'client':PROFILES['client']['sha256'],'tier0':TIER0_SHA256},trees=sets,sinCos=angles,scales=scales,raw=raw),indent=2))
if __name__=='__main__':main()
