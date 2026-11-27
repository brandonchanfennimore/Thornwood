# Procedural UI textures for the Artistic look: tileable parchment and wood. Run with Pillow + numpy.
import numpy as np, sys
from PIL import Image
OUT = sys.argv[1]
rng = np.random.default_rng(11)
def blur(a, rx, ry=None):  # gaussian blur via FFT, wraps so the result tiles
    ry = rx if ry is None else ry; H, W = a.shape
    fy, fx = np.fft.fftfreq(H)[:, None], np.fft.fftfreq(W)[None, :]
    k = np.exp(-2 * np.pi**2 * ((ry * fy)**2 + (rx * fx)**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * k))
def norm(a): return (a - a.mean()) / a.std()
def save(img, name): Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}.webp', quality=86)

N = 512  # parchment: warm cream, soft blotches, faint fibers and specks
base = np.array([246, 232, 200], float)
blot = norm(blur(rng.random((N, N)), 60)) + .5 * norm(blur(rng.random((N, N)), 18))
fib = norm(blur(rng.random((N, N)), 6, .6)); grain = norm(blur(rng.random((N, N)), .8))
stain = np.clip(norm(blur(rng.random((N, N)), 35)) - 1.2, 0, None)  # a few tea stains
tone = 1 - .035 * blot - .012 * fib - .02 * grain
img = base * tone[..., None] * (1 - stain[..., None] * np.array([.04, .1, .22]))  # stains go tan
save(img, 'parchment')

W, H = 512, 128  # wood: long grain running sideways
g = norm(blur(rng.random((H, W)), 90, 1.4)) + .6 * norm(blur(rng.random((H, W)), 25, .7))
rings = np.sin(g * 5.5)
lines = np.clip(np.abs(np.sin(g * 9)) * -1 + .12, 0, None) * 8   # thin dark grain lines
fine = norm(blur(rng.random((H, W)), 12, .5))
for name, col in [('wood', (132, 84, 48)), ('wood-red', (170, 64, 44)), ('wood-green', (84, 112, 70))]:
    t = 1 + .07 * rings + .05 * fine - .35 * lines
    save(np.array(col, float) * t[..., None], name)
