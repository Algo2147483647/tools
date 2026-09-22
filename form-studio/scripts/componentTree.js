// Render component tree
function renderComponentTree() {
  const treeContainer = document.getElementById('componentTree');
  
  if (state.components.length === 0) {
    treeContainer.innerHTML = '<li class="tree-empty">No components</li>';
    return;
  }

  treeContainer.innerHTML = state.components.map(component => renderTreeNode(component, 0)).join('');
  
  // Add node click events
  treeContainer.querySelectorAll('.tree-node').forEach(node => {
    node.addEventListener('click', function(e) {
      e.stopPropagation();
      const id = this.dataset.id;
      const component = findComponentById(id);
      if (component) {
        selectComponent(component);
        // No longer switch to the component library panel, keep current panel state
        // Just need to ensure the component tree panel is active
      }
    });
  });
}

// Render tree node
function renderTreeNode(component, level) {
  const isSelected = state.selectedItem?.id === component.id;
  const icon = getComponentIcon(component.type);
  const hasChildren = component.children && component.children.length > 0;
  
  let html = `
    <li>
      <div class="tree-node ${isSelected ? 'selected' : ''}" data-id="${component.id}">
        ${hasChildren ? '<i class="tree-expand-icon fas fa-caret-right"></i>' : '<i class="tree-expand-icon-placeholder"></i>'}
        <i class="node-icon fas fa-${icon}"></i>
        <span class="node-label">${escapeHTML(component.config.title || component.type)}</span>
        <span class="node-type">${escapeHTML(component.type)}</span>
      </div>
  `;
  
  // Render child nodes
  if (hasChildren) {
    html += `<ul>`;
    component.children.forEach(child => {
      html += renderTreeNode(child, level + 1);
    });
    html += `</ul>`;
  }
  
  html += `</li>`;
  return html;
}
