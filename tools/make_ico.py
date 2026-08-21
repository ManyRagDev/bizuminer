
from PIL import Image
import os

source_png = r"C:\Users\emanu\Documents\Projetos\Garimpa\brand-assets\app-icons\android-chrome-512x512.png"
img = Image.open(source_png)

targets = [
  r"C:\Users\emanu\Documents\Projetos\Garimpa\brand-assets\favicons\favicon.ico",
  r"C:\Users\emanu\Documents\Projetos\Garimpa\packages\site\public\favicon.ico",
  r"C:\Users\emanu\Documents\Projetos\Garimpa\packages\web\public\favicon.ico"
]

for t in targets:
  img.save(t, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print("favicon.ico generated successfully for all targets!")
  