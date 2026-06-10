/**
 * @dune/plugin-inline-edit/ui/editable — Inline editing component kit.
 *
 * Preact island components that make page content editable when an admin
 * session is active.  All components render their children verbatim in
 * production (no extra DOM, zero JS overhead for anonymous visitors).
 *
 * Lived in `@dune/core/ui/editable` through v0.16; moved here in core v0.17
 * along with the rest of the inline editing implementation.
 *
 * **Components:**
 * - {@link EditableText} — inline contenteditable for string frontmatter fields
 * - {@link EditableMarkdown} — TipTap WYSIWYG for the page Markdown body (Y.js backed)
 * - {@link EditableImage} — media picker for image frontmatter fields
 * - {@link EditableDate} — date picker for date fields
 * - {@link EditableField} — generic field editor with registry lookup
 * - {@link AdminBar} — persistent admin toolbar injected at the page top
 *
 * **Field editor registry:**
 * ```ts
 * import { registerFieldEditor } from "@dune/plugin-inline-edit/ui/editable";
 * registerFieldEditor("color", ColorPickerIsland);
 * registerFieldEditor("star_rating", StarRatingIsland);
 * ```
 *
 * @module
 * @since 1.0.0
 */

export { default as EditableText } from "./EditableText.tsx";
export type { EditableTextProps } from "./EditableText.tsx";

export { default as EditableMarkdown } from "./EditableMarkdown.tsx";
export type { EditableMarkdownProps } from "./EditableMarkdown.tsx";

export { default as EditableImage } from "./EditableImage.tsx";
export type { EditableImageProps } from "./EditableImage.tsx";

export { default as EditableDate } from "./EditableDate.tsx";
export type { EditableDateProps } from "./EditableDate.tsx";

export { default as EditableField } from "./EditableField.tsx";
export type { EditableFieldProps } from "./EditableField.tsx";

export { default as AdminBar } from "./AdminBar.tsx";
export type { AdminBarProps } from "./AdminBar.tsx";

export {
  getFieldEditor,
  listRegisteredFieldTypes,
  registerFieldEditor,
} from "./registry.ts";
export type { FieldEditorComponent, FieldEditorProps } from "./registry.ts";

export { getEditSourcePath, getEditWsUrl, isEditMode } from "./context.ts";
