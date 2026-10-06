// A text box for templates where the fields to fill in show as little boxes instead of {braces}. The text can be
// typed as usual; a field is added by dragging it in from a palette (or clicking it there), moved by dragging it
// inside the text, and removed with the delete keys. Its value is plain text with each field written as {name}.
import { h } from './ui.js';

const DRAG_TYPE = 'application/x-d100-token';
const ZERO_WIDTH = '​'; // keeps a place for the caret after a box that ends the text; never part of the value
let dragged = null; // the box being moved inside an editor, so the drop can take it out of where it was

/** The box shown for a field. `label` is what the user reads; `name` is what goes between braces. */
const tokenBox = (name, label) => h('span', { class: 'token', contenteditable: 'false', draggable: 'true', dataset: { token: name }, title: `{${name}}` }, label);

// Where in the page a point is, as a collapsed range (the two ways browsers offer it).
function rangeAt(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const at = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y);
  if (!at) return null;
  const range = document.createRange();
  range.setStart(at.offsetNode, at.offset); range.collapse(true);
  return range;
}

/**
 * @param {{ value: string, labels: Record<string, string>, multiline?: boolean, onChange?: () => void, label?: string }} options
 * @returns {{ el: HTMLElement, getValue(): string, setValue(text: string): void, insert(name: string): void }}
 */
export function tokenEditor({ value = '', labels, multiline = true, onChange = () => {}, label }) {
  const el = h('div', { class: 'input tokenedit' + (multiline ? ' tokenedit--multi' : ''), role: 'textbox', 'aria-multiline': String(multiline), 'aria-label': label, tabindex: '0', spellcheck: 'true' });
  el.contentEditable = 'plaintext-only';
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; // browsers without it
  let caret = null; // last place the caret was in this editor, for inserting from the palette

  const setValue = text => {
    el.replaceChildren(...text.split(/(\{\w+\})/).filter(Boolean).map(part => {
      const name = /^\{(\w+)\}$/.test(part) ? part.slice(1, -1) : null;
      return name && labels[name] ? tokenBox(name, labels[name]) : document.createTextNode(part);
    }));
  };
  const read = node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.dataset && node.dataset.token ? `{${node.dataset.token}}` : node.nodeName === 'BR' ? '\n'
    : (node.nodeName === 'DIV' || node.nodeName === 'P' ? '\n' : '') + [...node.childNodes].map(read).join('');
  const getValue = () => { const text = [...el.childNodes].map(read).join('').replaceAll(ZERO_WIDTH, ''); return multiline ? text : text.replace(/\n/g, ' '); };

  const inside = range => range && el.contains(range.startContainer);
  const remember = () => { const s = getSelection(); if (s.rangeCount && inside(s.getRangeAt(0))) caret = s.getRangeAt(0).cloneRange(); };
  // Puts a field's box at a range and leaves the caret right after it.
  const place = (name, range) => {
    if (!labels[name]) return;
    // A point inside another box means "next to it", never inside.
    const host = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement, over = host && host.closest('.token');
    if (over && el.contains(over)) { range = document.createRange(); range.setStartAfter(over); range.collapse(true); }
    const box = tokenBox(name, labels[name]);
    range.deleteContents(); range.insertNode(box);
    if (!box.nextSibling) box.after(document.createTextNode(ZERO_WIDTH));
    const after = document.createRange();
    after.setStartAfter(box); after.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(after);
    caret = after.cloneRange();
    onChange();
  };
  const insert = name => { el.focus(); const range = inside(caret) ? caret : (() => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return r; })(); place(name, range); };

  el.addEventListener('input', () => { remember(); onChange(); });
  ['keyup', 'mouseup', 'focus'].forEach(type => el.addEventListener(type, remember));
  el.addEventListener('keydown', e => { if (!multiline && e.key === 'Enter') e.preventDefault(); });
  if (el.contentEditable !== 'plaintext-only') el.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  // Dragging: a box from the palette comes with its name; one from the text is moved.
  el.addEventListener('dragstart', e => { const box = e.target.closest && e.target.closest('.token'); if (!box) return; dragged = box; e.dataTransfer.setData(DRAG_TYPE, box.dataset.token); e.dataTransfer.setData('text/plain', `{${box.dataset.token}}`); e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragend', () => { dragged = null; });
  el.addEventListener('dragover', e => {
    if (![...e.dataTransfer.types].includes(DRAG_TYPE)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = dragged ? 'move' : 'copy';
    const range = rangeAt(e.clientX, e.clientY); // show the caret where it would land
    if (inside(range)) { getSelection().removeAllRanges(); getSelection().addRange(range); }
  });
  el.addEventListener('drop', e => {
    const name = e.dataTransfer.getData(DRAG_TYPE);
    if (!name) return;
    e.preventDefault();
    let range = rangeAt(e.clientX, e.clientY);
    if (!inside(range)) { range = document.createRange(); range.selectNodeContents(el); range.collapse(false); }
    if (dragged && dragged.isConnected) { if (dragged.contains(range.startContainer)) return; dragged.remove(); }
    dragged = null;
    el.focus(); place(name, range);
  });

  setValue(value);
  return { el, getValue, setValue, insert };
}

/** A field of the palette: it can be dragged into an editor, or clicked (`onPick`) to insert it at the caret. */
export function paletteToken(name, label, hint, onPick) {
  return h('button', { class: 'token token--palette', type: 'button', draggable: 'true', title: `${hint}. Arrástralo al mensaje o haz clic para insertarlo`, onclick: () => onPick(name),
    ondragstart: e => { dragged = null; e.dataTransfer.setData(DRAG_TYPE, name); e.dataTransfer.setData('text/plain', `{${name}}`); e.dataTransfer.effectAllowed = 'copy'; } }, label);
}
