// Keep `files` top-level only: a platform-level `files` list replaces this one
// for app files, which is how build/ (Xcode DerivedData) and src/ ended up in
// app.asar before.
const appFiles = [
  'dist/**/*',
  'package.json',
  '!src/**/*',
  '!resources/**/*',
  '!scripts/**/*',
  '!test.js',
  '!test2.js',
  '!tsconfig.json',
  '!tailwind.config.cjs',
  '!postcss.config.cjs',
  '!electron.vite.config.ts',
  '!electron-builder.cjs',
  '!dist/.tsbuildinfo',
  '!build/**', // Finder Sync build, including Xcode DerivedData
  '!out/**',
  '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme,HISTORY.md,HISTORY,history.md}',
  '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples,docs,doc,website,site,demo,demos,benchmark,benchmarks}',
  '!**/node_modules/**/*.d.ts',
  '!**/node_modules/**/*.map',
  '!**/node_modules/**/*.ts',
  '!**/node_modules/**/.bin',
  '!**/node_modules/**/.github',
  '!**/node_modules/**/.vscode',
  '!**/node_modules/**/*.{md,markdown}',
  '!**/*.{o,hprof,orig,pyc,pyo,rbc,swp,csproj,gyp,gypi}',
  '!**/._*',
  '!**/@xenova/transformers/dist/*.wasm',
  '!**/@xenova/transformers/dist/transformers.js',
  '!**/@xenova/transformers/dist/*.map',
  '!**/sharp/vendor/**',
  '!**/sharp/src/**',
  '!**/sharp/install/**',
  '!**/sharp/docs/**',
  '!node_modules/@xenova/transformers/node_modules/**',
  '!**/node_modules/onnxruntime-web/dist/*.wasm',
  '!**/node_modules/onnxruntime-web/dist/*.map',
  '!**/node_modules/core-js/**',
  '!**/node_modules/@babel/**',
  // transformers imports onnxruntime-web statically; Node only loads ort-web.node.js.
  '!**/node_modules/onnxruntime-web/dist/{ort.js,ort-web.js,*.min.js,*.es5.*,*.es6.*}',
  // Only build/Release/better_sqlite3.node is loaded at runtime.
  '!**/node_modules/better-sqlite3/{deps,src}/**',
  '!**/node_modules/better-sqlite3/build/Release/{obj,obj.target}/**',
  '!**/node_modules/better-sqlite3/build/Release/{sqlite3.a,test_extension.node}',
  // Duplicates resources/models/ocr, which the app passes to the OCR engine.
  '!**/node_modules/@gutenye/ocr-models/assets/**',
];

// onnxruntime-node ships prebuilt binaries for every OS and arch under
// bin/napi-v*/<os>/<arch>. Drop them all, then re-include the target's.
// electron-builder only honours re-includes in the top-level list, where
// ${os} expands per target to mac | win | linux. The brace group maps that to
// onnxruntime's folder names:
//   d[${os}]rwin -> d[mac]rwin matches "darwin" on mac only
//   ${os}*       -> win* / linux* match "win32" / "linux"
// scripts/check-bundle-size.mjs fails the build if this keeps zero or
// several targets.
const onnxRuntimeFiles = [
  '!**/node_modules/onnxruntime-node/bin/**',
  '**/node_modules/onnxruntime-node/bin/*/{d[${os}]rwin,${os}*}/${arch}/**',
];

module.exports = {
  appId: 'com.sortie.app',
  productName: 'Sortie',
  electronVersion: '32.2.7',
  directories: {
    output: 'out',
    buildResources: 'resources',
  },
  compression: 'maximum',
  // mac keeps <lang>.lproj, win/linux keep locales/<lang>.pak (Chromium names it en-US).
  electronLanguages: ['en', 'en-US'],
  afterPack: 'scripts/after-pack.cjs',
  afterSign: 'scripts/after-sign.cjs',
  files: [...appFiles, ...onnxRuntimeFiles],
  protocols: [
    {
      name: 'Sortie External Import',
      schemes: ['sortie'],
    },
  ],
  asarUnpack: [
    '**/*.node',
    '**/*.dylib',
    '**/*.so',
    '**/*.so.*',
    '**/*.dll',
    'node_modules/better-sqlite3/build/Release/**',
    'node_modules/onnxruntime-node/bin/**',
    '**/node_modules/exiftool-vendored.pl/**',
    '**/node_modules/exiftool-vendored.exe/**',
  ],
  extraResources: [
    {
      from: 'resources/icons/icon.png',
      to: 'icons/icon.png',
    },
    {
      from: 'resources/models/ocr',
      to: 'models/ocr',
    },
  ],
  mac: {
    category: 'public.app-category.photography',
    icon: 'resources/icons/icon.icns',
    target: ['dmg'],
    hardenedRuntime: true,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    gatekeeperAssess: false,
    artifactName: 'Sortie-${version}-${arch}.${ext}',
  },
  win: {
    target: ['nsis'],
    icon: 'resources/icons/icon.ico',
    artifactName: 'Sortie-Setup-${version}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Sortie',
    include: 'resources/installer.nsh',
  },
  linux: {
    maintainer: 'Nathan Guilhot <nathan.guilhot@gmx.fr>',
    synopsis: 'Local-first photo tagger with CLIP embeddings',
    category: 'Graphics',
    icon: 'resources/icons/icon.png',
    target: ['AppImage', 'deb'],
  },
  publish: [
    {
      provider: 'github',
      owner: 'NathanGuilhot',
      repo: 'sortie',
      releaseType: 'draft',
    },
  ],
  extends: null,
};
