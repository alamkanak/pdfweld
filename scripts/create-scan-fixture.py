from pathlib import Path
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import random
root=Path(__file__).resolve().parent.parent
rng=random.Random(20261030)
c=canvas.Canvas(str(root/'public/benchmark-scans.pdf'),pagesize=(595,842));c.setTitle('PDFWeld raster document workload')
for page in range(8):
 image=Image.new('RGB',(1654,2339),'#f7f5ed');draw=ImageDraw.Draw(image)
 for i in range(10000):
  x=rng.randrange(1654);y=rng.randrange(2339);v=rng.randrange(215,247);draw.point((x,y),fill=(v,v,v-5))
 draw.text((100,100),f'SCANNED FIELD NOTES / PAGE {page+1}',fill='#29372f',font_size=55)
 for row in range(38):draw.text((100,250+row*45),f'{row+1:02}  A realistic raster page for local rendering and OCR performance.',fill='#454843',font_size=27)
 draw.rounded_rectangle((100,2020,1550,2180),radius=30,fill=('#dbe4c8' if page%2==0 else '#d6dce4'))
 draw.text((140,2070),'PRIVATE BY DESIGN. PROCESSED ON YOUR DEVICE.',fill='#29372f',font_size=34)
 stream=BytesIO();image.save(stream,format='JPEG',quality=85)
 c.drawImage(ImageReader(stream),0,0,width=595,height=842);c.showPage()
c.save()
