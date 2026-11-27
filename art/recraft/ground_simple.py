import numpy as np, random, sys
from PIL import Image, ImageDraw, ImageFilter
G='/Users/brandoncf/Documents/code/thornwood/app/src/assets/ink/ground/'
OUT=sys.argv[1]; N=512
def tile_blur(a, r):
    f=np.fft.fftfreq(N); k=np.exp(-2*(np.pi*r)**2*(f[:,None]**2+f[None,:]**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a.astype(np.float64))*k))
for s,tick in [('spring','grass'),('summer','grass'),('autumn','dot'),('winter','dot')]:
    old=np.asarray(Image.open(G+s+'.webp').convert('RGB').resize((N,N)),dtype=np.float32)
    base=np.median(old.reshape(-1,3),axis=0)
    rng=np.random.default_rng(7)
    mott=tile_blur((rng.random((N,N))*255).astype(np.uint8),40); mott=(mott-mott.mean())/mott.std()
    grain=tile_blur((rng.random((N,N))*255).astype(np.uint8),.7); grain=(grain-grain.mean())/grain.std()
    img=base[None,None,:]*(1+.035*mott[...,None]+.025*grain[...,None])
    img=Image.fromarray(np.clip(img,0,255).astype(np.uint8))
    # sparse ink marks, drawn on a 3x3 canvas so they wrap
    ink=tuple(int(c*.62) for c in base)
    big=Image.new('RGBA',(3*N,3*N)); d=ImageDraw.Draw(big); random.seed(3)
    for _ in range(26):
        x,y=random.uniform(0,N),random.uniform(0,N)
        for ox in (0,N,2*N):
            for oy in (0,N,2*N):
                X,Y=x+ox,y+oy
                if tick=='grass':
                    for k in (-1,0,1):
                        h=random.uniform(5,9); d.line([(X+k*3,Y),(X+k*3+k*2.5,Y-h)],fill=ink+(150,),width=2)
                else:
                    d.ellipse([X-1.6,Y-1.6,X+1.6,Y+1.6],fill=ink+(140,))
    marks=big.crop((N,N,2*N,2*N))
    img=img.convert('RGBA'); img.alpha_composite(marks)
    img.convert('RGB').save(f'{OUT}/{s}.webp',quality=88)
    print(s,base.astype(int))
