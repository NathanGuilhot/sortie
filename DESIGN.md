# Sortie - Picture Tagger & Embedding Electron App

## Overview

Sortie is a local desktop application for organizing and searching personal photo collections using AI embeddings and semantic tagging. It provides insanely fast natural language search over images by converting both images and text queries into vector embeddings (using CLIP), storing them in SQLite with vector extensions, and performing similarity searches. Features include smart tag suggestions, Pinterest-style masonry layout, automatic folder discovery, metadata editing, and a dismissible suggestion system.

## Architecture

The application follows a monorepo structure with three workspaces:

1. **pipeline** – Node.js scripts for image processing, embedding generation, and database management
2. **shared** – Shared TypeScript types and utilities
3. **electron** – Electron main process and React/Vite renderer with masonry GUI

### Data Flow

```
[User Adds Folders] → [Watch Service Detects Images] → [Pipeline: Extract Metadata & Generate CLIP Embeddings] → [Store in SQLite with Vectors]
      ↓
[User Searches via Text] → [Embed Query via CLIP] → [Vector Similarity Search] → [Return Ranked Images]
      ↓
[User Tags Images] → [Store Tags & Suggest via AI] → [Update Database]
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Electron Main                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ SQLite       │  │ Watch Service│  │ IPC Bridge           │  │
│  │ (sqlite-vec) │  │ (chokidar)   │  │ (expose APIs)        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                         (IPC via electron contextBridge)
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer (React + Vite)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Masonry Grid │  │ Search Bar   │  │ Tag Manager          │  │
│  │ (react-grid) │  │ (fuzzy+vec)  │  │ (suggest/dismiss)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Metadata     │  │ Folder       │  │ Settings             │  │
│  │ Editor       │  │ Scanner UI   │  │ (ignore lists)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Choices

### Core Stack
- **Electron**: Cross-platform desktop app framework
- **TypeScript**: Type safety across all workspaces
- **React**: UI library for renderer
- **Vite**: Build tool and dev server for renderer
- **SQLite**: Local database with extensions
- **sqlite-vec**: Vector similarity extension (like bibleembedded)
- **better-sqlite3**: High-performance SQLite3 driver for Node.js

### Embedding Model
- **CLIP (OpenAI)**: Multimodal model for image and text embeddings
- **Implementation**: Use `@xenova/transformers` for local inference (CLIP-ViT-B-32) or ONNX runtime for speed
- **Alternative**: Use OpenAI API (optional) for users with API keys; default local

### Image Processing
- **sharp**: High-performance image manipulation (thumbnail generation, EXIF extraction)
- **exifr**: EXIF metadata parsing
- **chokidar**: File system watching for automatic discovery

### UI Components
- **react-photo-gallery**: Masonry grid with dynamic heights
- **react-tag-input**: Tag input with autocomplete
- **tailwindcss**: Utility-first CSS for rapid UI development
- **framer-motion**: Smooth animations

### Search & Tagging
- **sqlite-vec** for vector similarity search (cosine distance)
- **fuse.js** for fuzzy tag search
- **AI-based tag suggestions** using CLIP zero-shot classification on common tags

### Development Tools
- **Electron Forge**: Packaging and distribution
- **tsx**: TypeScript execution for pipeline scripts
- **eslint** & **prettier**: Code quality

## Database Schema

### Tables

#### images
```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY,
  file_path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  captured_at DATETIME,              -- EXIF DateTimeOriginal
  latitude REAL,                     -- GPS latitude
  longitude REAL,                    -- GPS longitude
  city TEXT,
  country TEXT,
  description TEXT,
  favorite BOOLEAN DEFAULT 0,
  hidden BOOLEAN DEFAULT 0
);
```

#### tags
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT,                     -- 'user', 'ai', 'location', 'camera'
  color TEXT DEFAULT '#6B7280',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### image_tags (many-to-many)
```sql
CREATE TABLE image_tags (
  image_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  source TEXT DEFAULT 'user',        -- 'user', 'ai', 'auto'
  confidence REAL,                   -- for AI suggestions (0.0-1.0)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id, tag_id),
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### embeddings (vector table using sqlite-vec)
```sql
CREATE VIRTUAL TABLE vec_images USING vec0(
  embedding float[512]               -- CLIP embedding dimension (512 for CLIP-ViT-B-32)
);
```

#### folders
```sql
CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  watched BOOLEAN DEFAULT 1,
  ignored BOOLEAN DEFAULT 0,
  last_scanned DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### dismissed_suggestions
```sql
CREATE TABLE dismissed_suggestions (
  image_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id, tag_id),
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### metadata_changes
```sql
CREATE TABLE metadata_changes (
  id INTEGER PRIMARY KEY,
  image_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);
```

## File Structure (Monorepo)

```
sortie/
├── package.json                     # Root workspace config
├── tsconfig.base.json              # Shared TypeScript config
├── .env.example
├── .gitignore
├── README.md
├── DESIGN.md
├── shared/                         # Shared types & utilities
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts                # Database types, Image, Tag, etc.
│       ├── constants.ts            # App constants
│       └── utils.ts                # Shared utilities
├── pipeline/                       # Embedding generation & processing
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── lib/
│       │   ├── db.ts              # Database connection & schema
│       │   ├── clip.ts            # CLIP embedding model wrapper
│       │   └── exif.ts            # EXIF extraction
│       ├── scripts/
│       │   ├── scan-folders.ts    # Discover new images
│       │   ├── generate-embeddings.ts # CLIP embedding generation
│       │   ├── suggest-tags.ts    # AI tag suggestions
│       │   └── update-metadata.ts # Refresh metadata
│       └── index.ts               # Main pipeline entry point
└── electron/                       # Electron app
    ├── package.json
    ├── tsconfig.json
    ├── electron.vite.config.ts    # Vite config for Electron
    ├── src/
    │   ├── main/                  # Main process
    │   │   ├── index.ts           # Entry point
    │   │   ├── ipc.ts             # IPC handlers
    │   │   ├── database.ts        # Database service
    │   │   └── watcher.ts         # File watcher service
    │   └── renderer/              # React renderer
    │       ├── main.tsx           # React entry point
    │       ├── App.tsx            # Root component
    │       ├── components/        # Reusable components
    │       │   ├── MasonryGrid.tsx
    │       │   ├── SearchBar.tsx
    │       │   ├── TagInput.tsx
    │       │   ├── MetadataEditor.tsx
    │       │   └── FolderScanner.tsx
    │       ├── hooks/             # Custom hooks
    │       │   ├── useImages.ts
    │       │   ├── useSearch.ts
    │       │   └── useTags.ts
    │       ├── stores/            # Zustand stores
    │       │   ├── imageStore.ts
    │       │   ├── tagStore.ts
    │       │   └── uiStore.ts
    │       └── styles/
    │           └── index.css      # Tailwind imports
    └── resources/                 # App icons, etc.
```

## Implementation Steps

### Phase 1: Foundation
1. **Set up monorepo** with workspaces (shared, pipeline, electron)
2. **Configure TypeScript** and shared dependencies
3. **Initialize SQLite schema** with vector extension (sqlite-vec)
4. **Implement basic database layer** in pipeline/lib/db.ts

### Phase 2: Embedding Pipeline
1. **Integrate CLIP model** using `@xenova/transformers` for local inference
2. **Create image processing pipeline**:
   - Extract EXIF metadata (date, GPS, camera info)
   - Generate thumbnail (cached)
   - Compute CLIP embedding (512-dim)
   - Store in SQLite with vec_images table
3. **Build folder scanner** (chokidar) to watch directories
4. **Implement batch embedding** with progress tracking

### Phase 3: Electron Main Process
1. **Set up Electron with Vite** using electron-vite or similar
2. **Create IPC bridges** for:
   - Database queries (images, tags, search)
   - File system operations (add folders, scan)
   - Embedding generation
3. **Implement watcher service** that triggers pipeline on new images
4. **Add system tray** and native menus

### Phase 4: Renderer UI
1. **Build masonry grid** with virtualized scrolling for performance
2. **Implement search bar** with:
   - Natural language semantic search (vector similarity)
   - Tag-based filtering
   - Date/location filters
3. **Create tag management UI**:
   - Add/remove tags from images
   - AI tag suggestions with dismiss option
   - Tag cloud navigation
4. **Develop metadata editor** side panel for date/location editing
5. **Build folder scanner UI** with ignore list management

### Phase 5: Advanced Features
1. **Smart tag suggestions**:
   - Use CLIP zero-shot classification on common tags (e.g., "beach", "mountain", "food")
   - Store confidence scores; allow user to dismiss per image or globally
2. **Automatic organization**:
   - Cluster similar images (UMAP + HDBSCAN)
   - Timeline view
   - Map view (if GPS data available)
3. **Performance optimizations**:
   - Embedding cache
   - Lazy loading of thumbnails
   - Indexed vector search

### Phase 6: Polish & Distribution
1. **Add keyboard shortcuts** and accessibility
2. **Implement settings page** for model preferences (local vs API)
3. **Create installer** with Electron Forge
4. **Documentation** and user guide

## GUI Design Details

### Masonry Grid
- Pinterest-style layout with variable height items
- Lazy loading as user scrolls
- Hover effects: show tags, quick actions (favorite, tag, edit)
- Selection mode (Shift+Click, Ctrl+Click) for batch operations
- Thumbnail quality: generate 300px width thumbnails for grid, full resolution on click

### Search & Filter Sidebar
- Natural language search box: "photos of mountains at sunset"
- Tag filters: clickable tag cloud with counts
- Date range picker
- Location filter (country, city)
- Favorite filter toggle

### Tag Input Component
- React-tag-input with autocomplete from existing tags
- AI suggestions displayed as ghost tags with confidence score; click to add, X to dismiss
- Color-coded tags by category (user=blue, AI=green, location=orange)

### Metadata Editor Panel
- Slide-out panel when image is clicked
- Display EXIF: camera, aperture, ISO, focal length
- Editable fields: date/time, location (reverse geocoding), description
- Map integration (Leaflet) for location picking

### Folder Scanner UI
- List of watched folders with toggle watch/ignore
- Add folder button with native directory picker
- Ignore patterns (e.g., "*.tmp", "thumbs.db")
- Scan progress indicator

## Embedding Pipeline

### CLIP Model Choice
- **CLIP-ViT-B-32** (512-dim embeddings) – good balance of accuracy and speed
- Use `@xenova/transformers` with ONNX backend for faster inference
- Cache model files locally (~500MB)

### Embedding Generation Process
1. Load image, resize to 224x224 (CLIP input size)
2. Normalize pixel values
3. Run through CLIP vision encoder
4. Extract pooled output as 512-dim vector
5. Normalize to unit vector for cosine similarity

### Batch Processing
- Process images in batches (e.g., 16) for GPU efficiency
- Use worker threads to keep UI responsive
- Resume interrupted embedding jobs

## Search and Tagging Logic

### Natural Language Search
1. Convert text query to embedding using CLIP text encoder
2. Query `vec_images` table with `vec_distance_cosine` function:
   ```sql
   SELECT rowid, vec_distance_cosine(embedding, ?) as distance
   FROM vec_images
   ORDER BY distance
   LIMIT 100;
   ```
3. Join with images table to return full image data

### Tag-Based Search
- Boolean AND/OR logic for multiple tags
- Combine with vector search for hybrid results

### Smart Tag Suggestions
1. Predefined tag vocabulary (e.g., 1000 common concepts)
2. For each new image, run zero-shot classification using CLIP
3. Top-K tags with confidence > threshold are suggested
4. User can:
   - Accept suggestion (adds tag)
   - Dismiss suggestion for this image (stores in dismissed_suggestions)
   - Dismiss suggestion globally (adds tag to global ignore list)

### Automatic Tagging from Metadata
- Extract location from GPS → add country/city tags
- Extract date → add season, year tags
- Extract camera model → add camera brand tags

## Performance Considerations

### Database Indexes
```sql
CREATE INDEX idx_images_captured_at ON images(captured_at);
CREATE INDEX idx_images_location ON images(latitude, longitude);
CREATE INDEX idx_image_tags_image ON image_tags(image_id);
CREATE INDEX idx_image_tags_tag ON image_tags(tag_id);
```

### Vector Search Optimization
- sqlite-vec uses IVF indexes for approximate nearest neighbor search
- Configure appropriate index parameters for ~1M vectors

### Thumbnail Cache
- Store thumbnails in `~/.sortie/cache/` with LRU eviction
- Generate multiple sizes (grid, preview, fullscreen)

### Memory Management
- Electron renderer: virtualize grid to keep DOM nodes limited
- Pipeline: stream processing of large image sets

## Deployment

### Development
```bash
npm install
npm run dev:electron   # Starts electron with hot reload
npm run pipeline       # Runs embedding pipeline
```

### Building
```bash
npm run build
npm run package        # Creates platform-specific installers
```

### Distribution
- GitHub Releases with auto-updater
- Homebrew Cask for macOS
- Windows Store (optional)

## Conclusion

Sortie combines modern AI embeddings with a polished desktop experience for organizing personal photo collections. By leveraging local CLIP models and SQLite vector extensions, it provides fast semantic search without cloud dependency. The extensible architecture allows for future enhancements like face recognition, style clustering, and integration with cloud photo services.

---
*Design inspired by bibleembedded project's use of sqlite-vec and embedding pipeline.*