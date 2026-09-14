import AppKit
import CoreGraphics
import Foundation

// Urban Director Studio fallback icon generator.
// The approved production artwork is the city + sunset + clapperboard + play design.
// This generator intentionally mirrors that direction so running `npm run ios:icon`
// can never restore the retired radio-tower artwork.

let fileManager = FileManager.default
let root = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let destinationURL = root.appendingPathComponent(
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
)

let width = 1024
let height = 1024
let colorSpace = CGColorSpaceCreateDeviceRGB()

guard let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
) else {
    fputs("Could not create Urban Director Studio icon bitmap context\n", stderr)
    exit(1)
}

func cg(_ hex: UInt32) -> CGColor {
    CGColor(
        red: CGFloat((hex >> 16) & 0xff) / 255.0,
        green: CGFloat((hex >> 8) & 0xff) / 255.0,
        blue: CGFloat(hex & 0xff) / 255.0,
        alpha: 1
    )
}

func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
    CGRect(x: x, y: CGFloat(height) - y - h, width: w, height: h)
}

func rounded(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> CGPath {
    CGPath(
        roundedRect: rect(x, y, w, h),
        cornerWidth: r,
        cornerHeight: r,
        transform: nil
    )
}

let black = cg(0x090b0c)
let building = cg(0x101417)
let slate = cg(0x111416)
let slateLine = cg(0x596064)
let cream = cg(0xe9ece8)
let stripe = cg(0x1b1f21)
let gold = cg(0xe3a13a)
let brightGold = cg(0xffd66e)
let border = cg(0xc89142)

context.setFillColor(black)
context.fill(CGRect(x: 0, y: 0, width: width, height: height))

context.saveGState()
context.addPath(rounded(28, 28, 968, 968, 176))
context.clip()

let skyColors = [
    cg(0x16223d),
    cg(0x7f442f),
    cg(0xdf963e),
    cg(0x181817)
] as CFArray
let skyLocations: [CGFloat] = [0.0, 0.42, 0.72, 1.0]
if let gradient = CGGradient(
    colorsSpace: colorSpace,
    colors: skyColors,
    locations: skyLocations
) {
    context.drawLinearGradient(
        gradient,
        start: CGPoint(x: 512, y: 996),
        end: CGPoint(x: 512, y: 28),
        options: []
    )
}

// Sunset glow.
let glowColors = [
    CGColor(red: 1, green: 0.82, blue: 0.43, alpha: 0.34),
    CGColor(red: 1, green: 0.68, blue: 0.24, alpha: 0)
] as CFArray
if let glow = CGGradient(colorsSpace: colorSpace, colors: glowColors, locations: [0, 1]) {
    context.drawRadialGradient(
        glow,
        startCenter: CGPoint(x: 590, y: 570),
        startRadius: 0,
        endCenter: CGPoint(x: 590, y: 570),
        endRadius: 285,
        options: []
    )
}

// City skyline.
context.setFillColor(building)
let city: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
    (28, 455, 92, 370), (108, 380, 70, 445), (166, 510, 105, 315),
    (250, 318, 92, 507), (334, 438, 124, 387), (438, 352, 80, 473),
    (506, 490, 118, 335), (612, 292, 98, 533), (698, 420, 122, 405),
    (806, 348, 76, 477), (870, 458, 126, 367)
]
for item in city {
    context.fill(rect(item.0, item.1, item.2, item.3))
}

// Antenna on the tall left-center building.
context.setLineWidth(14)
context.setStrokeColor(building)
context.move(to: CGPoint(x: 296, y: CGFloat(height) - 318))
context.addLine(to: CGPoint(x: 296, y: CGFloat(height) - 202))
context.strokePath()

// A few warm windows — enough detail to read as "urban" at icon size.
context.setFillColor(CGColor(red: 0.94, green: 0.69, blue: 0.30, alpha: 0.52))
for window in [
    rect(132, 432, 15, 20), rect(278, 392, 16, 20), rect(461, 430, 15, 20),
    rect(642, 366, 16, 21), rect(732, 486, 16, 20), rect(832, 408, 15, 20),
    rect(918, 504, 16, 20)
] {
    context.fill(window)
}

// Clapperboard body.
let body = rounded(170, 475, 684, 392, 42)
context.addPath(body)
context.setFillColor(slate)
context.fillPath()
context.addPath(body)
context.setStrokeColor(slateLine)
context.setLineWidth(10)
context.strokePath()

// Clapper top.
context.beginPath()
context.move(to: CGPoint(x: 146, y: CGFloat(height) - 472))
context.addLine(to: CGPoint(x: 212, y: CGFloat(height) - 400))
context.addLine(to: CGPoint(x: 876, y: CGFloat(height) - 400))
context.addLine(to: CGPoint(x: 820, y: CGFloat(height) - 516))
context.addLine(to: CGPoint(x: 152, y: CGFloat(height) - 516))
context.closePath()
context.setFillColor(cream)
context.fillPath()
context.setStrokeColor(black)
context.setLineWidth(10)
context.strokePath()

// Dark diagonal clapper stripes.
context.setFillColor(stripe)
let stripeShapes: [[CGPoint]] = [
    [CGPoint(x: 210,y:524),CGPoint(x:278,y:400),CGPoint(x:360,y:400),CGPoint(x:292,y:524)],
    [CGPoint(x: 402,y:524),CGPoint(x:470,y:400),CGPoint(x:552,y:400),CGPoint(x:484,y:524)],
    [CGPoint(x: 594,y:524),CGPoint(x:662,y:400),CGPoint(x:744,y:400),CGPoint(x:676,y:524)],
    [CGPoint(x: 786,y:524),CGPoint(x:842,y:422),CGPoint(x:876,y:400),CGPoint(x:820,y:516)]
]
for polygon in stripeShapes {
    context.beginPath()
    context.move(to: CGPoint(x: polygon[0].x, y: CGFloat(height) - polygon[0].y))
    for point in polygon.dropFirst() {
        context.addLine(to: CGPoint(x: point.x, y: CGFloat(height) - point.y))
    }
    context.closePath()
    context.fillPath()
}

// Slate divider lines.
context.setStrokeColor(CGColor(red: 0.36, green: 0.39, blue: 0.40, alpha: 0.72))
context.setLineWidth(6)
for y in [570, 824] as [CGFloat] {
    context.move(to: CGPoint(x: 214, y: CGFloat(height) - y))
    context.addLine(to: CGPoint(x: 810, y: CGFloat(height) - y))
    context.strokePath()
}

// Glowing play button.
context.saveGState()
context.setShadow(
    offset: .zero,
    blur: 36,
    color: CGColor(red: 1, green: 0.66, blue: 0.18, alpha: 0.72)
)
context.beginPath()
context.move(to: CGPoint(x: 420, y: CGFloat(height) - 620))
context.addLine(to: CGPoint(x: 420, y: CGFloat(height) - 786))
context.addLine(to: CGPoint(x: 594, y: CGFloat(height) - 703))
context.closePath()
context.setFillColor(brightGold)
context.fillPath()
context.restoreGState()

// Warm play highlight.
context.beginPath()
context.move(to: CGPoint(x: 434, y: CGFloat(height) - 644))
context.addLine(to: CGPoint(x: 434, y: CGFloat(height) - 760))
context.addLine(to: CGPoint(x: 555, y: CGFloat(height) - 702))
context.closePath()
context.setFillColor(gold)
context.fillPath()

context.restoreGState()

// Thin premium border around the artwork.
context.addPath(rounded(30, 30, 964, 964, 174))
context.setStrokeColor(CGColor(red: 0.79, green: 0.57, blue: 0.26, alpha: 0.72))
context.setLineWidth(7)
context.strokePath()

guard let image = context.makeImage() else {
    fputs("Could not create Urban Director Studio icon image\n", stderr)
    exit(1)
}

let bitmap = NSBitmapImageRep(cgImage: image)
guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode Urban Director Studio icon PNG\n", stderr)
    exit(1)
}

do {
    try pngData.write(to: destinationURL, options: .atomic)
    print("Updated iOS AppIcon with Urban Director Studio city/director/play artwork")
} catch {
    fputs("Could not write iOS AppIcon: \(error)\n", stderr)
    exit(1)
}
