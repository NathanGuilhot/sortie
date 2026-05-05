import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const electronRoot = path.resolve(__dirname, '..')

const brandDir = path.join(electronRoot, 'resources/brand')
const colorSvgPath = path.join(brandDir, 'logo.svg')

const iconsDir = path.join(electronRoot, 'resources/icons')
const iconsetDir = path.join(iconsDir, 'icon.iconset')
const rendererPublicDir = path.join(electronRoot, 'src/renderer/public')

const MASTER_SIZE = 1024
const CORNER_RADIUS = 180
const ICON_BODY_SIZE = 824
const ICON_BODY_OFFSET = Math.round((MASTER_SIZE - ICON_BODY_SIZE) / 2)
const ICON_BODY_RADIUS = Math.round((CORNER_RADIUS * ICON_BODY_SIZE) / MASTER_SIZE)

const iconsetSizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
]

const icoSizes = [16, 24, 32, 48, 64, 128, 256]

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function pngBuffer(image) {
  return image.png().withMetadata({ density: 72 }).toBuffer()
}

async function renderMaster(svgBuffer) {
  const tile = `<svg width="${MASTER_SIZE}" height="${MASTER_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="${ICON_BODY_OFFSET}"
      y="${ICON_BODY_OFFSET}"
      width="${ICON_BODY_SIZE}"
      height="${ICON_BODY_SIZE}"
      rx="${ICON_BODY_RADIUS}"
      ry="${ICON_BODY_RADIUS}"
      fill="#FFFFFF"
    />
  </svg>`

  const logo = await sharp(svgBuffer)
    .resize(ICON_BODY_SIZE, ICON_BODY_SIZE, { fit: 'contain' })
    .png()
    .withMetadata({ density: 72 })
    .toBuffer()

  return pngBuffer(sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: Buffer.from(tile), top: 0, left: 0 },
      { input: logo, top: ICON_BODY_OFFSET, left: ICON_BODY_OFFSET },
    ]))
}

async function applyRoundedCorners(source, size) {
  const scale = size / MASTER_SIZE
  const radius = Math.max(2, Math.round(CORNER_RADIUS * scale))
  const mask = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
  </svg>`
  return pngBuffer(sharp(source)
    .composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
  )
}

async function resizeMaster(master, size) {
  return pngBuffer(sharp(master).resize(size, size))
}

async function writeIcns() {
  const icnsPath = path.join(iconsDir, 'icon.icns')
  const { execFileSync } = await import('child_process')

  try {
    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], { stdio: 'inherit' })
    return
  } catch (err) {
    console.warn('  iconutil failed, trying app-builder:', err.message)
  }

  const appBuilderName = process.arch === 'arm64' ? 'app-builder_arm64' : 'app-builder_amd64'
  const appBuilderPath = path.join(electronRoot, '..', 'node_modules/app-builder-bin/mac', appBuilderName)
  const outDir = path.join(iconsDir, '.icns-build')

  fs.rmSync(outDir, { recursive: true, force: true })
  ensureDir(outDir)

  try {
    execFileSync(
      appBuilderPath,
      [
        'icon',
        '--format',
        'icns',
        '--root',
        path.join(electronRoot, 'resources'),
        '--input',
        'icons/icon.iconset/icon_512x512@2x.png',
        '--out',
        outDir,
      ],
      { stdio: 'inherit' },
    )
    fs.copyFileSync(path.join(outDir, 'icon.icns'), icnsPath)
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}

async function generate() {
  if (!fs.existsSync(colorSvgPath)) {
    console.error(`Missing source SVG: ${colorSvgPath}`)
    process.exit(1)
  }

  ensureDir(iconsDir)
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  ensureDir(iconsetDir)
  ensureDir(rendererPublicDir)

  const colorSvg = fs.readFileSync(colorSvgPath)

  console.log('Rendering master 1024x1024 from logo.svg...')
  const master = await renderMaster(colorSvg)

  console.log('Writing macOS iconset PNGs...')
  for (const { name, size } of iconsetSizes) {
    const resized = await resizeMaster(master, size)
    fs.writeFileSync(path.join(iconsetDir, name), resized)
    console.log(`  ${name}`)
  }

  console.log('Writing icon.png (512x512)...')
  const icon512 = await resizeMaster(master, 512)
  fs.writeFileSync(path.join(iconsDir, 'icon.png'), icon512)

  console.log('Writing icon.ico (multi-size)...')
  const icoBuffers = await Promise.all(
    icoSizes.map((size) => resizeMaster(master, size)),
  )
  const icoBuffer = await pngToIco(icoBuffers)
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer)

  if (process.platform === 'darwin') {
    console.log('Writing icon.icns via iconutil...')
    await writeIcns()
  } else {
    console.log('Skipping icon.icns (not darwin)')
  }

  console.log('Writing renderer favicons...')
  fs.copyFileSync(colorSvgPath, path.join(rendererPublicDir, 'favicon.svg'))
  const favicon32 = await applyRoundedCorners(await resizeMaster(master, 32), 32)
  const favicon16 = await applyRoundedCorners(await resizeMaster(master, 16), 16)
  const faviconIco = await pngToIco([favicon16, favicon32])
  fs.writeFileSync(path.join(rendererPublicDir, 'favicon.ico'), faviconIco)

  console.log('\nDone.')
  console.log(`  ${path.relative(electronRoot, iconsDir)}/`)
  console.log(`  ${path.relative(electronRoot, rendererPublicDir)}/`)
}

generate().catch((err) => {
  console.error(err)
  process.exit(1)
})
