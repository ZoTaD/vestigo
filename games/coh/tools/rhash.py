"""El hash de las claves de los `.rgd` de Relic: lookup2 de Bob Jenkins con valor inicial 0 (2026-11-06)."""
M=0xffffffff
def mix(a,b,c):
    a=(a-b-c)&M; a^=c>>13
    b=(b-c-a)&M; b^=(a<<8)&M
    c=(c-a-b)&M; c^=b>>13
    a=(a-b-c)&M; a^=c>>12
    b=(b-c-a)&M; b^=(a<<16)&M
    c=(c-a-b)&M; c^=b>>5
    a=(a-b-c)&M; a^=c>>3
    b=(b-c-a)&M; b^=(a<<10)&M
    c=(c-a-b)&M; c^=b>>15
    return a,b,c
def lookup2(k,init=0):
    n=len(k); a=b=0x9e3779b9; c=init; i=0
    while n-i>=12:
        a=(a+int.from_bytes(k[i:i+4],'little'))&M; b=(b+int.from_bytes(k[i+4:i+8],'little'))&M; c=(c+int.from_bytes(k[i+8:i+12],'little'))&M
        a,b,c=mix(a,b,c); i+=12
    c=(c+n)&M; r=k[i:]; L=len(r)
    for j,sh in ((10,24),(9,16),(8,8)):
        if L>j: c=(c+(r[j]<<sh))&M
    for j,sh in ((7,24),(6,16),(5,8),(4,0)):
        if L>j: b=(b+(r[j]<<sh))&M
    for j,sh in ((3,24),(2,16),(1,8),(0,0)):
        if L>j: a=(a+(r[j]<<sh))&M
    return mix(a,b,c)[2]
