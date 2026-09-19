// Builds an element whose text is set with textContent, never innerHTML:
// preset names, descriptions and tags are user-written.
export function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
