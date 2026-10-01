/**
 * @local/dsh-codex-skin — Host half.
 *
 * The appearance layer is browser-only, so this half deliberately does nothing. It exists
 * because a Loader row resolves the package root as its Host module: the row must import
 * something, and an empty `apply` is the documented shape for a client-only bundle.
 */

/** Cordis plugin name. */
export const name = 'codex-skin';

/** No Host services are required: the skin touches only the browser document. */
export const inject = [];

export function apply() {}
