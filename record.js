const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const SCRATCH = '/private/tmp/claude-501/-Users-bramvzw-PhpstormProjects-sibi/03ea32c3-ab70-41ed-8902-e6b1c683efa5/scratchpad'
const APP = path.join(SCRATCH, 'repro13306')
const SERVED_BUNDLE = path.join(APP, 'public/js/filament/forms/components/file-upload.js')

const variant = process.argv[2] // 'before' | 'after'
if (!['before', 'after'].includes(variant)) {
    console.error('usage: node record.js before|after')
    process.exit(1)
}

const bundle = variant === 'before'
    ? path.join(SCRATCH, 'original-file-upload.js')
    : path.join(SCRATCH, 'fixed-file-upload.js')

fs.copyFileSync(bundle, SERVED_BUNDLE)
console.log(`bundel geplaatst: ${variant} (${fs.statSync(SERVED_BUNDLE).size} bytes)`)

const banner = (page, text, color) => page.evaluate(([text, color]) => {
    let el = document.getElementById('demo-banner')
    if (!el) {
        el = document.createElement('div')
        el.id = 'demo-banner'
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;font:600 15px ui-monospace,monospace;color:#fff;text-align:center;'
        document.body.appendChild(el)
    }
    el.style.background = color
    el.textContent = text
}, [text, color])

;(async () => {
    const browser = await chromium.launch()
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        recordVideo: { dir: path.join(SCRATCH, 'videos'), size: { width: 1280, height: 900 } },
    })
    const page = await context.newPage()

    // Login
    await page.goto('http://repro13306.test/admin/login')
    await page.fill('input[type="email"]', 'bram@example.com')
    await page.fill('input[type="password"]', 'password')
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 15000 })

    await page.goto('http://repro13306.test/admin/documents')
    await page.click('a:has-text("Edit"), [role="row"] >> text=Edit')
    await page.waitForSelector('text=New attachment')

    const label = variant === 'before'
        ? 'BEFORE — unpatched file-upload.js from filament/forms (packagist)'
        : 'AFTER — patched file-upload.js (activeUploads counter)'
    await banner(page, label, variant === 'before' ? '#b91c1c' : '#15803d')
    await page.waitForTimeout(1500)

    await page.click('button:has-text("New attachment")')
    await page.waitForSelector('[role="dialog"] input[type="file"]', { state: 'attached' })
    await page.waitForTimeout(800)

    await banner(page, 'Uploading 2 files in parallel: big-file.pdf (slow, ~12s) + small-file.pdf (fast, ~3s)', '#1d4ed8')
    await page.setInputFiles('[role="dialog"] input[type="file"]', [
        path.join(SCRATCH, 'testfiles/big-file.pdf'),
        path.join(SCRATCH, 'testfiles/small-file.pdf'),
    ])

    // Wacht op het race-venster: small COMPLETE (5), big nog PROCESSING (3)
    await page.waitForFunction(() => {
        const comp = (() => {
            for (const el of document.querySelectorAll('[role="dialog"] [x-data]')) {
                for (const data of (el._x_dataStack ?? [])) {
                    if ('shouldUpdateState' in data && data.pond) return data
                }
            }
        })()
        if (!comp) return false
        const files = comp.pond.getFiles()
        const smallDone = files.some(f => f.filename === 'small-file.pdf' && f.status === 5)
        const bigBusy = files.some(f => f.filename === 'big-file.pdf' && f.status === 3)
        return smallDone && bigBusy
    }, { timeout: 20000 })

    await banner(page, 'small-file.pdf is done — big-file.pdf is STILL UPLOADING', '#b45309')
    await page.waitForTimeout(2000)

    await banner(page, 'User removes the completed small-file.pdf with its ✕ button, while big-file.pdf is still uploading', '#6d28d9')
    await page.waitForTimeout(1500)

    await page.click('.filepond--item:has-text("small-file.pdf") .filepond--action-revert-item-processing')

    await page.waitForTimeout(6000)

    const outcome = await page.evaluate(() => {
        const comp = (() => {
            for (const el of document.querySelectorAll('[role="dialog"] [x-data]')) {
                for (const data of (el._x_dataStack ?? [])) {
                    if ('shouldUpdateState' in data && data.pond) return data
                }
            }
        })()
        return comp.pond.getFiles().map(f => f.filename + ':' + f.status).join(', ') || 'EMPTY'
    })
    console.log('pond na re-render-tik:', outcome)

    const bigSurvived = outcome.includes('big-file.pdf')
    await banner(
        page,
        bigSurvived
            ? 'RESULT: only small-file.pdf was removed — big-file.pdf keeps uploading, no file loss'
            : 'RESULT: big-file.pdf was WIPED mid-upload along with the removed file — the file is lost',
        bigSurvived ? '#15803d' : '#b91c1c',
    )

    // Laat bij de fix de upload ook echt afronden in beeld
    await page.waitForTimeout(bigSurvived ? 10000 : 5000)

    const video = page.video()
    await context.close()
    const videoPath = await video.path()
    const target = path.join(SCRATCH, 'videos', variant + '.webm')
    fs.renameSync(videoPath, target)
    console.log('video: ' + target + ' | big-file overleefde: ' + bigSurvived)
    await browser.close()
})()
