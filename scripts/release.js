#!/usr/bin/env node
/**
 * Master Script: Release & Automatic Synchronization
 * ===================================================
 * Memastikan SELURUH langkah update, sinkronisasi versi,
 * Service Worker, Capacitor, kompilasi APK Android,
 * dan pengujian otomatis dijalankan 100% tanpa ada yang terlewat.
 *
 * Penggunaan:
 *   npm run release               (Sinkronisasi versi saat ini + build APK + uji)
 *   npm run release -- patch      (Naikkan patch 1.0.17 -> 1.0.18 + build APK + uji)
 *   npm run release -- 1.0.18     (Set versi spesifik 1.0.18 + build APK + uji)
 *   npm run release -- --no-apk   (Sinkronisasi versi + tes tanpa build ulang APK)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function logStep(step, msg) {
  console.log(`\n\x1b[36m[LANGKAH ${step}]\x1b[0m \x1b[1m${msg}\x1b[0m`);
}

function logSuccess(msg) {
  console.log(`  \x1b[32m✔ ${msg}\x1b[0m`);
}

function logError(msg) {
  console.error(`  \x1b[31m✖ ${msg}\x1b[0m`);
}

function runCmd(cmd, cwd = ROOT_DIR) {
  console.log(`  \x1b[90m$ ${cmd}\x1b[0m`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function getSemver(current, bumpType) {
  const parts = current.split('.').map(Number);
  if (bumpType === 'major') return `${parts[0] + 1}.0.0`;
  if (bumpType === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  if (bumpType === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  return bumpType; // specific version string
}

function main() {
  const args = process.argv.slice(2);
  const skipApk = args.includes('--no-apk') || args.includes('--skip-apk');
  const versionArg = args.find(a => !a.startsWith('--'));

  console.log('\x1b[35m=====================================================');
  console.log('🚀 POS KASIR TOKO — AUTOMATED RELEASE & SYNC SYSTEM');
  console.log('=====================================================\x1b[0m');

  // 1. Tentukan Versi Target
  logStep(1, 'Membaca dan Menentukan Versi Target');
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  let targetVersion = pkg.version;

  if (versionArg) {
    if (['major', 'minor', 'patch'].includes(versionArg)) {
      targetVersion = getSemver(pkg.version, versionArg);
    } else if (/^\d+\.\d+\.\d+$/.test(versionArg)) {
      targetVersion = versionArg;
    } else {
      logError(`Format versi tidak valid: ${versionArg}. Gunakan semver (misal: 1.0.18) atau 'patch'/'minor'/'major'.`);
      process.exit(1);
    }
  }

  console.log(`  Versi Sekarang: \x1b[33mv${pkg.version}\x1b[0m`);
  console.log(`  Versi Target  : \x1b[32mv${targetVersion}\x1b[0m`);

  // 2. Sinkronkan Versi ke Semua File Proyek
  logStep(2, 'Sinkronisasi Versi Konsisten ke Seluruh File');

  // 2.1 package.json
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  logSuccess(`package.json -> ${targetVersion}`);

  // 2.2 frontend/js/config.js
  const configJsPath = path.join(ROOT_DIR, 'frontend', 'js', 'config.js');
  let configJs = fs.readFileSync(configJsPath, 'utf8');
  configJs = configJs.replace(/VERSION:\s*['"][^'"]+['"]/, `VERSION: '${targetVersion}'`);
  fs.writeFileSync(configJsPath, configJs);
  logSuccess(`frontend/js/config.js -> VERSION: '${targetVersion}'`);

  // 2.3 frontend/index.html (Splash screen footer)
  const indexHtmlPath = path.join(ROOT_DIR, 'frontend', 'index.html');
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  indexHtml = indexHtml.replace(/<span>v\d+\.\d+\.\d+\s*•\s*Terenkripsi/g, `<span>v${targetVersion} • Terenkripsi`);
  fs.writeFileSync(indexHtmlPath, indexHtml);
  logSuccess(`frontend/index.html -> v${targetVersion}`);

  // 2.4 frontend/sw.js (Service Worker Cache Bumper)
  const swJsPath = path.join(ROOT_DIR, 'frontend', 'sw.js');
  let swJs = fs.readFileSync(swJsPath, 'utf8');
  swJs = swJs.replace(/const CACHE_NAME\s*=\s*['"]pos-kasir-static-v[^'"]+['"]/, `const CACHE_NAME = 'pos-kasir-static-v${targetVersion}'`);
  fs.writeFileSync(swJsPath, swJs);
  logSuccess(`frontend/sw.js -> CACHE_NAME: 'pos-kasir-static-v${targetVersion}'`);

  // 2.5 frontend/js/app.js (Fallback banner versi)
  const appJsPath = path.join(ROOT_DIR, 'frontend', 'js', 'app.js');
  let appJs = fs.readFileSync(appJsPath, 'utf8');
  appJs = appJs.replace(/Versi\s+v\$\{CONFIG\.VERSION\s*\|\|\s*['"][^'"]+['"]\}/g, `Versi v\${CONFIG.VERSION || '${targetVersion}'}`);
  appJs = appJs.replace(/paling baru \(v\$\{CONFIG\.VERSION\s*\|\|\s*['"][^'"]+['"]\}\)/g, `paling baru (v\${CONFIG.VERSION || '${targetVersion}'})`);
  fs.writeFileSync(appJsPath, appJs);
  logSuccess(`frontend/js/app.js -> fallback: 'v${targetVersion}'`);

  // 2.6 android/app/build.gradle
  const gradlePath = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${targetVersion}"`);
    
    // Auto increment versionCode jika versi dinaikkan
    if (targetVersion !== pkg.version || versionArg) {
      const matchVc = gradle.match(/versionCode\s+(\d+)/);
      if (matchVc) {
        const nextVc = parseInt(matchVc[1], 10) + 1;
        gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextVc}`);
        logSuccess(`android/app/build.gradle -> versionCode: ${nextVc}, versionName: "${targetVersion}"`);
      }
    } else {
      logSuccess(`android/app/build.gradle -> versionName: "${targetVersion}"`);
    }
    fs.writeFileSync(gradlePath, gradle);
  }

  // 3. Menjalankan Seluruh Uji Otomatis
  logStep(3, 'Menjalankan Seluruh Pengujian Otomatis (Syntax, Import, Audit)');
  runCmd('node tests/check_syntax.js');
  runCmd('node tests/check_imports.js');
  runCmd('node tests/check_globals.js');
  runCmd('node tests/test_debug_final.js');
  logSuccess('Semua 13 suite uji audit lulus 100%');

  // 4. Sinkronisasi Web Assets ke Android (Capacitor)
  logStep(4, 'Sinkronisasi Web Assets ke Capacitor Android');
  runCmd('npx cap sync android');
  logSuccess('Web assets tersinkronisasi ke android/app/src/main/assets/public');

  // 5. Kompilasi APK Android Native (Gradle)
  if (skipApk) {
    logStep(5, 'Kompilasi APK Dilewati (--no-apk aktif)');
  } else {
    logStep(5, 'Kompilasi APK Android Native (Gradle assembleDebug)');
    const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
    const androidDir = path.join(ROOT_DIR, 'android');
    runCmd(`${gradlewCmd} assembleDebug`, androidDir);

    const builtApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    const targetApk = path.join(ROOT_DIR, 'frontend', 'download', 'poskasirtoko.apk');

    if (fs.existsSync(builtApk)) {
      fs.copyFileSync(builtApk, targetApk);
      const stat = fs.statSync(targetApk);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
      logSuccess(`APK Berhasil disalin ke frontend/download/poskasirtoko.apk (${sizeMb} MB)`);

      // Re-sync agar APK terbaru juga ada di dalam build assets android
      runCmd('npx cap sync android');
      logSuccess('Aset APK tersinkronisasi ulang ke platform Android');
    } else {
      logError(`APK hasil build tidak ditemukan di: ${builtApk}`);
      process.exit(1);
    }
  }

  console.log('\n\x1b[32m=====================================================');
  console.log(`🎉 RELEASE SELESAI DENGAN SUKSES! (v${targetVersion})`);
  console.log('=====================================================\x1b[0m');
  console.log('\x1b[36mPerintah selanjutnya untuk menyimpan ke GitHub:\x1b[0m');
  console.log(`  git add -A ; git commit -m "chore(release): v${targetVersion} pembaruan sistem dan APK" ; git push origin main\n`);
}

main();
