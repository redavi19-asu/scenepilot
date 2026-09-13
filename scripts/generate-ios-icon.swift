import AppKit
import CoreGraphics
import Foundation

let fileManager = FileManager.default
let root = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let destinationURL = root.appendingPathComponent("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

let width = 1024
let height = 1024
let scale: CGFloat = 16.0

guard let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
) else {
    fputs("Could not create icon bitmap context\n", stderr)
    exit(1)
}

func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    CGPoint(x: x * scale, y: (64 - y) * scale)
}

func roundedRect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> CGPath {
    CGPath(
        roundedRect: CGRect(
            x: x * scale,
            y: (64 - y - h) * scale,
            width: w * scale,
            height: h * scale
        ),
        cornerWidth: r * scale,
        cornerHeight: r * scale,
        transform: nil
    )
}

func strokePath(_ points: [(CGFloat, CGFloat)], color: CGColor, lineWidth: CGFloat) {
    guard let first = points.first else { return }
    context.beginPath()
    context.move(to: point(first.0, first.1))
    for p in points.dropFirst() {
        context.addLine(to: point(p.0, p.1))
    }
    context.setStrokeColor(color)
    context.setLineWidth(lineWidth * scale)
    context.setLineCap(.round)
    context.strokePath()
}

let dark = CGColor(red: 11/255, green: 15/255, blue: 12/255, alpha: 1)
let cream = CGColor(red: 244/255, green: 238/255, blue: 227/255, alpha: 1)
let gold = CGColor(red: 214/255, green: 163/255, blue: 95/255, alpha: 1)
let bronze = CGColor(red: 141/255, green: 106/255, blue: 60/255, alpha: 1)
let border = CGColor(red: 201/255, green: 146/255, blue: 75/255, alpha: 1)
let red = CGColor(red: 255/255, green: 89/255, blue: 72/255, alpha: 1)

context.setFillColor(CGColor(gray: 1, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: width, height: height))

context.addPath(roundedRect(2, 2, 60, 60, 15))
context.setFillColor(dark)
context.fillPath()

context.addPath(roundedRect(2.75, 2.75, 58.5, 58.5, 14.25))
context.setStrokeColor(border)
context.setLineWidth(1.5 * scale)
context.strokePath()

context.setFillColor(cream)
context.fillEllipse(in: CGRect(
    x: (32 - 5.5) * scale,
    y: (64 - (30 + 5.5)) * scale,
    width: 11 * scale,
    height: 11 * scale
))

strokePath([(32, 35.5), (32, 48)], color: cream, lineWidth: 3)
strokePath([(25.5, 48), (38.5, 48)], color: cream, lineWidth: 3)

context.beginPath()
context.move(to: point(22.5, 21.5))
context.addCurve(
    to: point(22.5, 38.5),
    control1: point(17.4, 26.2),
    control2: point(17.4, 33.8)
)
context.setStrokeColor(gold)
context.setLineWidth(3 * scale)
context.setLineCap(.round)
context.strokePath()

context.beginPath()
context.move(to: point(41.5, 21.5))
context.addCurve(
    to: point(41.5, 38.5),
    control1: point(46.6, 26.2),
    control2: point(46.6, 33.8)
)
context.setStrokeColor(gold)
context.setLineWidth(3 * scale)
context.setLineCap(.round)
context.strokePath()

context.beginPath()
context.move(to: point(16.5, 16))
context.addCurve(
    to: point(16.5, 44),
    control1: point(8.7, 23.7),
    control2: point(8.7, 36.3)
)
context.setStrokeColor(bronze)
context.setLineWidth(2.5 * scale)
context.setLineCap(.round)
context.strokePath()

context.beginPath()
context.move(to: point(47.5, 16))
context.addCurve(
    to: point(47.5, 44),
    control1: point(55.3, 23.7),
    control2: point(55.3, 36.3)
)
context.setStrokeColor(bronze)
context.setLineWidth(2.5 * scale)
context.setLineCap(.round)
context.strokePath()

context.setFillColor(red)
context.fillEllipse(in: CGRect(
    x: (49.5 - 3.5) * scale,
    y: (64 - (14.5 + 3.5)) * scale,
    width: 7 * scale,
    height: 7 * scale
))

guard let image = context.makeImage() else {
    fputs("Could not create icon image\n", stderr)
    exit(1)
}

let bitmap = NSBitmapImageRep(cgImage: image)
guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode icon PNG\n", stderr)
    exit(1)
}

do {
    try pngData.write(to: destinationURL, options: .atomic)
    print("Updated iOS AppIcon from Urban Director favicon artwork")
} catch {
    fputs("Could not write iOS AppIcon: \(error)\n", stderr)
    exit(1)
}
