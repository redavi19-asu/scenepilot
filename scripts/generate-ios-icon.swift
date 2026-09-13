import AppKit
import Foundation

let fileManager = FileManager.default
let root = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let sourceURL = root.appendingPathComponent("public/urban-director-icon.svg")
let destinationURL = root.appendingPathComponent("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

guard let sourceImage = NSImage(contentsOf: sourceURL) else {
    fputs("Could not load public/urban-director-icon.svg\n", stderr)
    exit(1)
}

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: 1024,
    pixelsHigh: 1024,
    bitsPerSample: 8,
    samplesPerPixel: 3,
    hasAlpha: false,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fputs("Could not create icon bitmap\n", stderr)
    exit(1)
}

guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fputs("Could not create icon graphics context\n", stderr)
    exit(1)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context

NSColor.white.setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()

let padding: CGFloat = 112
let availableWidth = 1024 - (padding * 2)
let availableHeight = 1024 - (padding * 2)
let sourceSize = sourceImage.size
let scale = min(availableWidth / sourceSize.width, availableHeight / sourceSize.height)
let targetWidth = sourceSize.width * scale
let targetHeight = sourceSize.height * scale
let targetRect = NSRect(
    x: (1024 - targetWidth) / 2,
    y: (1024 - targetHeight) / 2,
    width: targetWidth,
    height: targetHeight
)

sourceImage.draw(
    in: targetRect,
    from: NSRect(origin: .zero, size: sourceSize),
    operation: .sourceOver,
    fraction: 1.0
)

NSGraphicsContext.restoreGraphicsState()

guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode icon PNG\n", stderr)
    exit(1)
}

do {
    try pngData.write(to: destinationURL, options: .atomic)
    print("Updated iOS AppIcon from public/urban-director-icon.svg")
} catch {
    fputs("Could not write iOS AppIcon: \(error)\n", stderr)
    exit(1)
}
