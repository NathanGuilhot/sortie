# Sortie ദ്ദി(˵ •̀ ᴗ - ˵ ) ✧

Sort and organise your pictures by themes and smart tags!

Sortie is a desktop application for macOS, Windows, and Linux that helps you organize your photo collection using AI-powered tagging, manual tagging, and smart search. It automatically generates embeddings for images, allows you to tag them, and provides a fast searchable gallery.

## ✨ Features

- **AI-Powered Tagging**: Automatically generate descriptive tags for your images using CLIP embeddings
- **Manual Tagging**: Add custom tags to organize your photos your way
- **Smart Search**: Search by tags, text descriptions, or visual similarity
- **Fast Gallery View**: Masonry grid layout with infinite scrolling and lazy loading
- **Batch Operations**: Tag multiple images at once, drag and drop organization
- **Local-First**: All data stays on your machine, no cloud required
- **Cross-Platform**: Works on macOS, Windows, and Linux

## 📦 Installation

### macOS
1. Download the latest `Sortie.dmg` from the [Releases page](https://github.com/yourusername/sortie/releases)
2. Open the DMG file and drag Sortie to your Applications folder
3. Launch Sortie from Applications (you may need to right-click and select "Open" the first time due to Gatekeeper)

### Windows
1. Download the latest `Sortie Setup.exe` from Releases
2. Run the installer and follow the prompts
3. Launch Sortie from the Start Menu

### Linux
1. Download the AppImage from Releases
2. Make it executable: `chmod +x Sortie-*.AppImage`
3. Run: `./Sortie-*.AppImage`

## 🚀 Usage

### First Launch
1. On first launch, you'll be prompted to select a folder containing your images
2. Sortie will scan the folder and begin generating embeddings for your images (this may take some time depending on the number of images)
3. Once complete, you'll see your images in the main gallery

### Tagging Images
- **Automatic Tags**: Sortie automatically suggests tags based on image content
- **Add Custom Tags**: Click on an image and use the tag input field to add your own tags
- **Batch Tagging**: Select multiple images (Shift+Click or Cmd/Ctrl+Click) and add tags to all selected images at once

### Searching
- Use the search bar at the top to find images by tags or text descriptions
- The search supports fuzzy matching and will show relevant images as you type

### Gallery Navigation
- Scroll through your images with infinite loading
- Click on any image to view it larger with its tags
- Drag and drop images between tags or collections

### Settings
- Access settings via the gear icon in the top-right
- Configure embedding model preferences, database location, and UI themes

## 🛠 Building from Source

### Prerequisites
- Node.js 18 or later
- Yarn package manager
- Python 3.8+ (for some native dependencies)

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/sortie.git
   cd sortie
   ```
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Build all packages:
   ```bash
   yarn build
   ```
4. Start development mode:
   ```bash
   yarn dev
   ```
5. Package for distribution:
   ```bash
   yarn dist                # All platforms
   yarn dist:mac           # macOS only
   yarn dist:win           # Windows only
   yarn dist:linux         # Linux only
   ```

### Project Structure
- `shared/` – Shared TypeScript types and utilities
- `pipeline/` – Image processing and embedding generation service
- `electron/` – Electron desktop application
- `resources/` – App icons and entitlements

## 🧪 Development

### Running Tests
```bash
# Run tests for all workspaces
yarn workspace shared test
yarn workspace pipeline test
yarn workspace electron test
```

### Code Style
- TypeScript with strict type checking
- ESLint and Prettier for code formatting
- Husky for pre-commit hooks

## 📄 License

MIT © 2024 Sortie Contributors

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🐛 Reporting Issues

If you encounter any bugs or have feature requests, please open an issue on GitHub.

---

Built with ❤️ using Electron, React, TypeScript, and CLIP embeddings.