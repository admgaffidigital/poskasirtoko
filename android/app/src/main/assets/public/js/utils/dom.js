/**
 * dom.js — Helper manipulasi DOM, pembuat elemen, dan rendering state
 */

import { ICONS } from './ui.js';
import { escapeHtml } from './format.js';

export { escapeHtml };
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
export function renderSkeleton(countOrType = 3, countFallback = 3) {
  const count = typeof countOrType === 'number' ? countOrType : (Number(countFallback) || 3);
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
 * Render Empty State (Mendukung pemanggilan objek { title, text, icon, actionButton } maupun parameter posisional)
 * @param {Object|string} [titleOrOpts]
 * @param {string} [textParam]
 * @param {string} [iconParam]
 * @param {string} [actionButtonParam]
 * @returns {string}
 */
export function renderEmpty(titleOrOpts = {}, textParam = '', iconParam = '', actionButtonParam = '') {
  let title = 'Belum Ada Data';
  let text = 'Data belum tersedia atau tidak ditemukan.';
  let icon = ICONS.box;
  let actionButton = '';

  if (typeof titleOrOpts === 'string') {
    title = titleOrOpts;
    if (textParam) text = textParam;
    if (iconParam) icon = iconParam;
    if (actionButtonParam) actionButton = actionButtonParam;
  } else if (titleOrOpts && typeof titleOrOpts === 'object') {
    if (titleOrOpts.title) title = titleOrOpts.title;
    if (titleOrOpts.text) text = titleOrOpts.text;
    if (titleOrOpts.icon) icon = titleOrOpts.icon;
    if (titleOrOpts.actionButton) actionButton = titleOrOpts.actionButton;
  }

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

