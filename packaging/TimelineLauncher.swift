import Cocoa
import Foundation
import Darwin

final class LocalHTTPServer {
    private var serverFD: Int32 = -1
    private let root: URL
    let port: UInt16

    init(root: URL, port: UInt16 = 8765) {
        self.root = root.standardizedFileURL
        self.port = port
    }

    deinit { stop() }

    func start() throws {
        serverFD = socket(AF_INET, SOCK_STREAM, 0)
        guard serverFD >= 0 else { throw NSError(domain: "TimelineServer", code: 1) }

        var yes: Int32 = 1
        setsockopt(serverFD, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(port).bigEndian
        addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                Darwin.bind(serverFD, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else {
            let e = errno
            stop()
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(e))
        }
        guard listen(serverFD, 32) == 0 else {
            let e = errno
            stop()
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(e))
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.acceptLoop()
        }
    }

    func stop() {
        if serverFD >= 0 {
            Darwin.close(serverFD)
            serverFD = -1
        }
    }

    private func acceptLoop() {
        while serverFD >= 0 {
            var clientAddr = sockaddr()
            var len: socklen_t = socklen_t(MemoryLayout<sockaddr>.size)
            let client = accept(serverFD, &clientAddr, &len)
            if client < 0 {
                if errno == EINTR { continue }
                break
            }
            DispatchQueue.global(qos: .utility).async { [weak self] in
                self?.handle(client)
            }
        }
    }

    private func handle(_ fd: Int32) {
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }

        guard let request = try? handle.read(upToCount: 65536),
              !request.isEmpty,
              let text = String(data: request, encoding: .utf8),
              let firstLine = text.split(separator: "\n", maxSplits: 1).first else {
            return
        }

        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else { return }
        let method = String(parts[0])
        guard method == "GET" || method == "HEAD" else {
            sendStatus(handle, code: 405, message: "Method Not Allowed")
            return
        }

        var rawPath = String(parts[1]).components(separatedBy: "?").first ?? "/"
        rawPath = rawPath.removingPercentEncoding ?? rawPath
        if rawPath == "/" { rawPath = "/index.html" }
        let relative = String(rawPath.drop(while: { $0 == "/" }))
        if relative.contains("..") {
            sendStatus(handle, code: 403, message: "Forbidden")
            return
        }

        let fileURL = root.appendingPathComponent(relative).standardizedFileURL
        guard fileURL.path.hasPrefix(root.path + "/"),
              FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL) else {
            sendStatus(handle, code: 404, message: "Not Found")
            return
        }

        let ext = fileURL.pathExtension.lowercased()
        let mime: String
        switch ext {
        case "html": mime = "text/html; charset=utf-8"
        case "js", "mjs": mime = "text/javascript; charset=utf-8"
        case "css": mime = "text/css; charset=utf-8"
        case "json", "webmanifest": mime = "application/json; charset=utf-8"
        case "svg": mime = "image/svg+xml"
        case "png": mime = "image/png"
        case "jpg", "jpeg": mime = "image/jpeg"
        case "ico": mime = "image/x-icon"
        case "wasm": mime = "application/wasm"
        case "mp4": mime = "video/mp4"
        default: mime = "application/octet-stream"
        }

        let header = "HTTP/1.1 200 OK\r\nContent-Type: \(mime)\r\nContent-Length: \(data.count)\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n"
        handle.write(Data(header.utf8))
        if method == "GET" { handle.write(data) }
    }

    private func sendStatus(_ handle: FileHandle, code: Int, message: String) {
        let body = "\(code) \(message)\n"
        let header = "HTTP/1.1 \(code) \(message)\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n"
        handle.write(Data(header.utf8))
        handle.write(Data(body.utf8))
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var server: LocalHTTPServer?
    private var statusLabel: NSTextField!
    private let localURL = URL(string: "http://127.0.0.1:8765/")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()

        guard let resources = Bundle.main.resourceURL else {
            showError("App resources could not be found.")
            return
        }
        let site = resources.appendingPathComponent("site", isDirectory: true)
        let server = LocalHTTPServer(root: site)
        do {
            try server.start()
            self.server = server
            statusLabel.stringValue = "Running privately on this Mac only:\n127.0.0.1:8765"
            NSWorkspace.shared.open(localURL)
        } catch {
            showError("Could not start the local server. Another copy may already be running.\n\n\(error.localizedDescription)")
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    @objc private func openBrowser() {
        NSWorkspace.shared.open(localURL)
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 220),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "My Timeline Visualizer"
        window.center()

        let content = NSView(frame: window.contentView!.bounds)
        content.autoresizingMask = [.width, .height]
        window.contentView = content

        let title = NSTextField(labelWithString: "My Timeline Visualizer")
        title.font = .boldSystemFont(ofSize: 20)
        title.alignment = .center
        title.frame = NSRect(x: 30, y: 158, width: 420, height: 28)
        content.addSubview(title)

        statusLabel = NSTextField(wrappingLabelWithString: "Starting local app…")
        statusLabel.alignment = .center
        statusLabel.frame = NSRect(x: 30, y: 92, width: 420, height: 52)
        content.addSubview(statusLabel)

        let openButton = NSButton(title: "Open in Browser", target: self, action: #selector(openBrowser))
        openButton.bezelStyle = .rounded
        openButton.frame = NSRect(x: 105, y: 34, width: 130, height: 34)
        content.addSubview(openButton)

        let quitButton = NSButton(title: "Quit", target: self, action: #selector(quitApp))
        quitButton.bezelStyle = .rounded
        quitButton.frame = NSRect(x: 245, y: 34, width: 130, height: 34)
        content.addSubview(quitButton)

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func showError(_ message: String) {
        statusLabel.stringValue = message
        let alert = NSAlert()
        alert.messageText = "My Timeline Visualizer"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
