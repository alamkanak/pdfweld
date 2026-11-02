from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent/'public'
for size in [180,192,512]:
 image=Image.new('RGB',(size,size),'#bfe780');draw=ImageDraw.Draw(image);s=size/64
 for points in [[(17,18),(28,18),(35,32),(28,46),(17,46),(24,32)],[(35,18),(47,18),(40,32),(47,46),(35,46),(28,32)]]:
  draw.polygon([(round(x*s),round(y*s)) for x,y in points],fill='#202123')
 image.save(root/f'icon-{size}.png')
