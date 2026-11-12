// Shared JSDoc types. Import with: /** @typedef {import('../core/types.js').ModalButton} ModalButton */

/**
 * A button in a modal dialog. Buttons without `f` just close the dialog.
 * @typedef {object} ModalButton
 * @property {string} t Label.
 * @property {() => void} [f] Action run after the dialog closes.
 * @property {boolean} [dis] Shown but disabled.
 * @property {'danger' | 'close' | 'key' | string} [k] `danger` puts it behind the hold-to-confirm hatch.
 */

/**
 * One line in the log or combat panel.
 * @typedef {object} LogLine
 * @property {number} n Turn it was written.
 * @property {string} m Message text.
 * @property {'' | 'good' | 'info' | 'warn' | 'bad' | string} c Style class; `warn` and `bad` interrupt multi-turn actions.
 */

export {};
