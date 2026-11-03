import Foundation
import PDFKit
import AppKit

guard CommandLine.arguments.count == 3,
      let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])),
      let page = document.page(at: 0) else { exit(1) }
let bounds = page.bounds(for: .cropBox)
let size = page.rotation % 180 == 0 ? bounds.size : NSSize(width: bounds.height, height: bounds.width)
let image = page.thumbnail(of: size, for: .cropBox)
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
var left = bitmap.pixelsWide, top = bitmap.pixelsHigh, right = -1, bottom = -1
for y in 0..<bitmap.pixelsHigh {
    for x in 0..<bitmap.pixelsWide {
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
        if max(color.redComponent, color.greenComponent, color.blueComponent) < 0.7 {
            left = min(left, x); right = max(right, x)
            top = min(top, y); bottom = max(bottom, y)
        }
    }
}
let result = ["left": left, "top": top, "right": right, "bottom": bottom]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
