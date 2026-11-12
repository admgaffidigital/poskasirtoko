/**
 * dom.js — Helper manipulasi DOM, pembuat elemen, dan rendering state
 */

import { ICONS } from './ui.js';
import { escapeHtml } from './format.js';

export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

/**
 * Event listener delegation helper
 */
export function on(event, selector, handler, parent = document) {
  parent.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) {
      handler(e, target);
    }
  });
}

/**
 * Render Skeleton Loading
 * @param {number} [count=3]
 * @returns {string}
 */
export function renderSkeleton(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="card card-body stack-sm" style="margin-bottom: var(--sp-3)">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text" style="width: 75%"></div>
        <div class="skeleton skeleton-text" style="width: 50%"></div>
      </div>
    `;
  }
  return html;
}

/**
 * Render Empty State
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.text
 * @param {string} [options.icon]
 * @param {string} [options.actionButton]
 * @returns {string}
 */
export function renderEmpty({
  title = 'Belum Ada Data',
  text = 'Data belum tersedia atau tidak ditemukan.',
  icon = ICONS.box,
  actionButton = ''
}) {
  return `
    <div class="empty">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-text">${escapeHtml(text)}</div>
      ${actionButton ? `<div style="margin-top: var(--sp-2)">${actionButton}</div>` : ''}
    </div>
  `;
}

/**
 * Render Error State
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.retryAction]
 * @returns {string}
 */
export function renderError({
  title = 'Gagal Memuat Data',
  message = 'Terjadi kendala saat menghubungkan ke server.',
  retryAction = ''
}) {
  return `
    <div class="empty is-error">
      <div class="empty-icon">${ICONS.alertTriangle}</div>
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-text">${escapeHtml(message)}</div>
      ${retryAction ? `<div style="margin-top: var(--sp-2)">${retryAction}</div>` : ''}
    </div>
  `;
}

