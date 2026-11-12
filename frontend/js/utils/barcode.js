/**
 * barcode.js — Deteksi Barcode Fisik, Kamera Barcode Scanner, & Beep Audio
 * Mendukung 2 mode pemindaian:
 * 1. Hardware Scanner (USB / Bluetooth Wireless) via deteksi ketukan cepat
 * 2. Kamera Scanner (BarcodeDetector API native / fallback)
 * + Audio synthesized beep feedback via Web Audio API
 */

import { showToast, showModal, ICONS } from './ui.js';

let audioCtx = null;

/**
 * Mainkan bunyi beep ala kasir POS (Web Audio API sintetis)
 */
export function bunyikanBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, audioCtx.currentTime); // Frekuensi 1.4 kHz (khas scanner)

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (err) {
    // Audio tidak diizinkan atau belum ada interaksi pengguna
  }
}

/**
 * Listener Hardware Barcode Scanner (USB / Bluetooth)
 * Mengidentifikasi input keyboard beruntun sangat cepat (< 50ms) yang diakhiri Enter.
 * @param {Function} onScanCallback Callback ketika barcode valid terdeteksi (kode) => void
 * @returns {Function} Fungsi cleanup untuk melepas listener
 */
export function pasangScannerFisik(onScanCallback) {
  let buffer = '';
  let lastTime = 0;
  const AMBANG_MS = 60; // Ambang jeda antar karakter barcode scanner fisik

  const handler = (e) => {
    // Abaikan jika fokus di textarea atau input non-search
    const target = e.target;
    const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

    const currentTime = Date.now();
    const diff = currentTime - lastTime;
    lastTime = currentTime;

    if (e.key === 'Enter') {
      if (buffer.length >= 3 && diff <= AMBANG_MS * 2) {
        e.preventDefault();
        const code = buffer.trim();
        buffer = '';
        bunyikanBeep();
        if (typeof onScanCallback === 'function') {
          onScanCallback(code);
        }
      } else {
        buffer = '';
      }
      return;
    }

    // Tangkap hanya karakter cetak
    if (e.key && e.key.length === 1) {
      if (diff > AMBANG_MS && buffer.length > 0) {
        // Jeda terlalu lama -> kemungkinan ketikan manual manusia, reset buffer
        buffer = '';
      }
      buffer += e.key;
    }
  };

  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}

/**
 * Modal Scanner Kamera Barcode
 * Menggunakan BarcodeDetector API jika tersedia di browser.
 * @param {Function} onScanCallback
 */
export function bukaKameraScanner(onScanCallback) {
  let mediaStream = null;
  let scanInterval = null;
  let isScanning = true;

  const modal = showModal({
    title: 'Pindai Barcode Produk',
    size: 'sm',
    body: `
      <div class="scanner-camera-container" style="display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);">
        <div style="position: relative; width: 100%; max-width: 320px; aspect-ratio: 4/3; background: #000; border-radius: var(--radius-md); overflow: hidden;">
          <video id="scanner-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
          
          <!-- Laser Target Overlay -->
          <div style="position: absolute; inset: 0; pointer-events: none; border: 2px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;">
            <div style="width: 75%; height: 50%; border: 2px dashed var(--primary); border-radius: var(--radius-sm); position: relative; box-shadow: 0 0 12px rgba(230,81,0,0.4);">
              <div style="position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: #ff1744; box-shadow: 0 0 8px #ff1744; animation: scanLine 2s infinite ease-in-out;"></div>
            </div>
          </div>
        </div>

        <div class="text-xs text-muted text-center">
          Arahkan barcode atau kode QR ke dalam kotak pemindai di atas.
        </div>

        <div class="row" style="width: 100%; gap: var(--sp-2);">
          <input type="text" id="input-manual-barcode" class="input" placeholder="Atau ketik Barcode / SKU..." style="flex: 1;" />
          <button type="button" class="btn btn-secondary btn-sm" id="btn-manual-barcode">Pilih</button>
        </div>
      </div>
      <style>
        @keyframes scanLine {
          0% { top: 15%; opacity: 0.3; }
          50% { top: 85%; opacity: 1; }
          100% { top: 15%; opacity: 0.3; }
        }
      </style>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-scanner">Tutup</button>
      </div>
    `
  });

  const videoEl = modal.el.querySelector('#scanner-video');
  const inputManual = modal.el.querySelector('#input-manual-barcode');
  const btnManual = modal.el.querySelector('#btn-manual-barcode');
  const btnTutup = modal.el.querySelector('#btn-tutup-scanner');

  const hentikanKamera = () => {
    isScanning = false;
    if (scanInterval) clearInterval(scanInterval);
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
  };

  btnTutup?.addEventListener('click', () => {
    hentikanKamera();
    modal.close();
  });

  const prosesBarcode = (code) => {
    if (!code || !isScanning) return;
    hentikanKamera();
    bunyikanBeep();
    showToast(`Barcode terdeteksi: ${code}`, 'success', 2000);
    modal.close();
    if (typeof onScanCallback === 'function') {
      onScanCallback(code);
    }
  };

  btnManual?.addEventListener('click', () => {
    const val = inputManual.value.trim();
    if (val) prosesBarcode(val);
  });

  inputManual?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = inputManual.value.trim();
      if (val) prosesBarcode(val);
    }
  });

  // Jalankan Camera Stream
  navigator.mediaDevices?.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  }).then((stream) => {
    mediaStream = stream;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.play();
    }

    // Cek ketersediaan BarcodeDetector API asli di browser
    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
      });

      scanInterval = setInterval(async () => {
        if (!isScanning || !videoEl || videoEl.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoEl);
          if (barcodes && barcodes.length > 0) {
            prosesBarcode(barcodes[0].rawValue);
          }
        } catch (err) {
          // Deteksi frame gagal sementara
        }
      }, 250);
    } else {
      console.warn('BarcodeDetector API native tidak tersedia, gunakan input manual barcode.');
    }
  }).catch((err) => {
    console.warn('Gagal membuka kamera scanner:', err);
    showToast('Kamera tidak dapat diakses. Silakan masukkan barcode secara manual.', 'warning', 4000);
    if (inputManual) inputManual.focus();
  });
}

/**
 * Generator Barcode SVG (Code 39 Standar)
 * Menghasilkan markup SVG barcode tajam beresolusi tinggi tanpa dependensi eksternal.
 * @param {string} text Teks/SKU/Barcode yang akan di-render
 * @param {Object} [options]
 * @param {number} [options.height=45] Tinggi garis barcode (px)
 * @param {boolean} [options.showText=true] Tampilkan teks di bawah barcode
 * @returns {string} Markup SVG string
 */
export function generateBarcodeSvg(text, options = {}) {
  const height = options.height || 42;
  const showText = options.showText !== false;
  const raw = String(text || '000000').toUpperCase().replace(/[^0-9A-Z\-.\s$/+%]/g, '-');
  const str = `*${raw}*`;

  const CODE39 = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
  };

  let x = 6;
  const rects = [];
  const narrowW = 1.6;
  const wideW = 3.8;
  const interGap = 1.6;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const pattern = CODE39[ch] || CODE39['-'];
    for (let p = 0; p < 9; p++) {
      const isBar = (p % 2 === 0);
      const isWide = pattern[p] === '1';
      const w = isWide ? wideW : narrowW;
      if (isBar) {
        rects.push(`<rect x="${x.toFixed(1)}" y="4" width="${w.toFixed(1)}" height="${height}" fill="currentColor" />`);
      }
      x += w;
    }
    x += interGap; // Celah antar karakter
  }

  x += 6;
  const totalH = showText ? height + 18 : height + 8;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(x)} ${totalH}" style="max-width: 100%; height: auto; display: block; margin: 0 auto; color: #000000;">
      ${rects.join('')}
      ${showText ? `<text x="${(x / 2).toFixed(1)}" y="${height + 15}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="currentColor">${raw}</text>` : ''}
    </svg>
  `;
}

