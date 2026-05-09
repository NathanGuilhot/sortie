import Cocoa
import FinderSync
import os.log

private let log = OSLog(subsystem: "com.sortie.app.finder-sync", category: "menu")

final class FinderSync: FIFinderSync {
    private enum Action: String {
        case addImagesToGallery = "add-images-to-gallery"
        case addFolderToGallery = "add-folder-to-gallery"
        case addToBoard = "add-to-board"
    }

    override init() {
        super.init()
        let roots = Self.monitoredRoots()
        FIFinderSyncController.default().directoryURLs = Set(roots)
        os_log("init: monitoring %{public}d roots: %{public}@", log: log, type: .default, roots.count, roots.map { $0.path }.joined(separator: ", "))
    }

    override func menu(for menuKind: FIMenuKind) -> NSMenu? {
        os_log("menu(for:) called kind=%{public}d", log: log, type: .default, menuKind.rawValue)
        guard menuKind == .contextualMenuForItems || menuKind == .contextualMenuForContainer else {
            return nil
        }

        let selected = selectedURLs()
        os_log("menu: %{public}d selected items", log: log, type: .default, selected.count)
        guard !selected.isEmpty else {
            return nil
        }

        let menu = NSMenu(title: "Sortie")
        if selected.contains(where: { !$0.hasDirectoryPath }) {
            menu.addItem(
                menuItem("Add Images to Sortie Gallery", action: #selector(addImagesToGallery(_:)))
            )
        }
        if selected.contains(where: { $0.hasDirectoryPath }) {
            menu.addItem(
                menuItem("Add Folder to Sortie Gallery", action: #selector(addFolderToGallery(_:)))
            )
        }
        menu.addItem(menuItem("Add to Sortie Board", action: #selector(addToBoard(_:))))
        return menu
    }

    @objc private func addImagesToGallery(_ sender: Any?) {
        openSortie(action: .addImagesToGallery)
    }

    @objc private func addFolderToGallery(_ sender: Any?) {
        openSortie(action: .addFolderToGallery)
    }

    @objc private func addToBoard(_ sender: Any?) {
        openSortie(action: .addToBoard)
    }

    private func menuItem(_ title: String, action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    private func selectedURLs() -> [URL] {
        let controller = FIFinderSyncController.default()
        if let urls = controller.selectedItemURLs(), !urls.isEmpty {
            return urls
        }
        if let targeted = controller.targetedURL() {
            return [targeted]
        }
        return []
    }

    private func openSortie(action: Action) {
        guard var components = URLComponents(string: "sortie://external-import") else {
            os_log("openSortie: failed to build URLComponents", log: log, type: .error)
            return
        }

        let selectedPaths = selectedURLs().map { url in
            url.path
        }
        let paths = selectedPaths.map { path in
            URLQueryItem(name: "path", value: path)
        }
        components.queryItems = [URLQueryItem(name: "action", value: action.rawValue)] + paths

        guard let url = components.url else {
            os_log("openSortie: failed to materialize URL", log: log, type: .error)
            return
        }
        os_log("openSortie: opening %{public}@", log: log, type: .default, url.absoluteString)
        let success = NSWorkspace.shared.open(url)
        os_log("openSortie: NSWorkspace.open success=%{public}d", log: log, type: .default, success ? 1 : 0)
        if !success {
            os_log(
                "openSortie: failed url=%{public}@ paths=%{public}@",
                log: log,
                type: .error,
                url.absoluteString,
                selectedPaths.joined(separator: ", ")
            )
        }
    }

    private static func monitoredRoots() -> [URL] {
        var roots: [URL] = []
        if let pw = getpwuid(getuid()), let home = pw.pointee.pw_dir {
            roots.append(URL(fileURLWithPath: String(cString: home), isDirectory: true))
        }
        roots.append(URL(fileURLWithPath: "/Volumes", isDirectory: true))
        roots.append(URL(fileURLWithPath: "/Users/Shared", isDirectory: true))
        return roots
    }
}
