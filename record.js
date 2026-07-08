const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

// Usage: node record.js before|after
//   APP_URL         (default http://filament-13306-repro.test)
//   BUNDLE_BEFORE   optional path to a pristine file-upload.js build to place before recording
//   BUNDLE_AFTER    optional path to a patched file-upload.js build to place before recording
// The script throttles the upload connection via CDP, uploads two files, waits for the small one
// to finish, clicks its ✕ ("tap to undo") button with a real trusted click, and records everything.

const variant = process.argv[2]
if (!['before', 'after'].includes(variant)) {
    console.error('usage: node record.js before|after')
    process.exit(1)
}

const appUrl = process.env.APP_URL ?? 'http://filament-13306-repro.test'
const servedBundle = path.join(__dirname, 'public/js/filament/forms/components/file-upload.js')
const bundleOverride = variant === 'before' ? process.env.BUNDLE_BEFORE : process.env.BUNDLE_AFTER

if (bundleOverride) {
    fs.copyFileSync(bundleOverride, servedBundle)
    console.log(`bundle placed: ${bundleOverride}`)
}

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
        recordVideo: { dir: path.join(__dirname, 'videos'), size: { width: 1280, height: 900 } },
    })
    const page = await context.newPage()

    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 20,
        downloadThroughput: 5_000_000,
        uploadThroughput: 100_000,
    })

    await page.goto(appUrl + '/admin/login')
    await page.fill('input[type="email"]', 'demo@example.com')
    await page.fill('input[type="password"]', 'password')
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 20000 })

    await page.goto(appUrl + '/admin/documents')
    await page.click('a:has-text("Edit"), [role="row"] >> text=Edit')
    await page.waitForSelector('text=New attachment')

    const label = variant === 'before'
        ? 'BEFORE — unpatched file-upload.js'
        : 'AFTER — patched file-upload.js (activeUploads counter)'
    await banner(page, label, variant === 'before' ? '#b91c1c' : '#15803d')
    await page.waitForTimeout(1500)

    await page.click('button:has-text("New attachment")')
    await page.waitForSelector('[role="dialog"] input[type="file"]', { state: 'attached' })
    await page.waitForTimeout(800)

    await banner(page, 'Uploading 2 files in parallel on a throttled connection (100 KB/s up): big-file.pdf (1.5MB) + small-file.pdf (300KB)', '#1d4ed8')
    await page.setInputFiles('[role="dialog"] input[type="file"]', [
        path.join(__dirname, 'testfiles/big-file.pdf'),
        path.join(__dirname, 'testfiles/small-file.pdf'),
    ])

    await page.waitForSelector('.filepond--item:has-text("small-file.pdf") .filepond--action-revert-item-processing', { timeout: 30000 })
    await banner(page, 'small-file.pdf is done — big-file.pdf is STILL UPLOADING', '#b45309')
    await page.waitForTimeout(2000)

    await banner(page, 'User removes the completed small-file.pdf with its ✕ button, while big-file.pdf is still uploading', '#6d28d9')
    await page.waitForTimeout(1500)
    await page.click('.filepond--item:has-text("small-file.pdf") .filepond--action-revert-item-processing')

    await page.waitForTimeout(8000)

    const outcome = await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"] .filepond--item')]
            .map((item) => item.querySelector('.filepond--file-info-main')?.textContent?.trim())
            .join(', '))
    const bigSurvived = outcome.includes('big-file.pdf')
    await banner(
        page,
        bigSurvived
            ? 'RESULT: only small-file.pdf was removed — big-file.pdf keeps uploading, no file loss'
            : 'RESULT: big-file.pdf was WIPED mid-upload along with the removed file — the file is lost',
        bigSurvived ? '#15803d' : '#b91c1c',
    )
    await page.waitForTimeout(bigSurvived ? 12000 : 5000)

    const video = page.video()
    await context.close()
    const videoPath = await video.path()
    const target = path.join(__dirname, 'videos', variant + '.webm')
    fs.renameSync(videoPath, target)
    console.log('video: ' + target + ' | big-file survived: ' + bigSurvived)
    await browser.close()
})()
