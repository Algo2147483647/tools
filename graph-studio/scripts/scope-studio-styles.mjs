// Both editors share one React application. Scope their existing design systems
// by the active workspace so lazy-loaded styles cannot change the other canvas.
export default function scopeStudioStyles() {
  return {
    postcssPlugin: 'graph-studio-workspace-styles',
    Once(root) {
      root.walkRules(rule => {
        const file = (rule.source?.input.file || '').replaceAll('\\', '/');
        const mode = file.includes('/src/serviceArchitecture/') ? 'services'
          : file.includes('/src/styles/') ? 'graphs' : null;
        if (!mode) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
          if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
        }
        const scope = `html[data-studio-mode="${mode}"]`;
        rule.selectors = rule.selectors.map(selector =>
          /^(?:html|:root)(?=[\s.:[#>+~]|$)/.test(selector)
            ? selector.replace(/^(?:html|:root)/, scope)
            : `${scope} ${selector}`,
        );
      });
    },
  };
}
