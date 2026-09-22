// Initialize
document.addEventListener('DOMContentLoaded', function() {
  initDragAndDrop();
  initEventListeners();
  renderFormItems();
  initTabs(); // Initialize tabs
  initPropertiesPanelControls(); // Collapse + resize
});

// Initialize tabs
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.panel-tab');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Show corresponding panel
      tabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === tabName + 'Panel') {
          panel.classList.add('active');
        }
      });

      // If it's the component tree panel, update the tree structure
      if (tabName === 'tree') {
        renderComponentTree();
      }
    });
  });

  // Initialize border toggle button
  const toggleButton = document.getElementById('toggleBorders');
  toggleButton.addEventListener('click', function() {
    state.showBorders = !state.showBorders;
    const icon = this.querySelector('i');
    if (state.showBorders) {
      icon.className = 'fas fa-border-none';
      this.title = 'Hide Borders';
    } else {
      icon.className = 'fas fa-border-all';
      this.title = 'Show Borders';
    }
    renderFormItems();
  });
}

// Initialize drag and drop functionality
function initDragAndDrop() {
  const components = document.querySelectorAll('.component-item');
  const canvas = document.getElementById('formCanvas');
  let indicatorLine = null;
  let insertIndex = -1; // Track where to insert the component

  components.forEach(component => {
    component.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('componentType', this.dataset.type);
      this.classList.add('dragging');
    });

    component.addEventListener('dragend', function() {
      this.classList.remove('dragging');
      // Remove indicator line if exists
      if (indicatorLine) {
        indicatorLine.remove();
        indicatorLine = null;
      }
      insertIndex = -1;
    });
  });

  canvas.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('active');
    
    // Create or update indicator line
    if (!indicatorLine) {
      indicatorLine = document.createElement('div');
      indicatorLine.className = 'insert-indicator';
      canvas.appendChild(indicatorLine);
    }
    
    // Position the indicator line
    const formItems = document.getElementById('formItems');
    const items = Array.from(formItems.querySelectorAll('.form-item'));
    let closestItem = null;
    let closestDistance = Infinity;
    insertIndex = -1; // Reset insert index
    
    // Find the closest item to insert position
    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(e.clientY - (rect.top + rect.height / 2));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestItem = item;
        // Determine if inserting before or after
        if (e.clientY < rect.top + rect.height / 2) {
          insertIndex = index;
        } else {
          insertIndex = index + 1;
        }
      }
    });
    
    // Position the indicator line based on closest item
    if (closestItem) {
      const rect = closestItem.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      
      if (insertIndex <= items.indexOf(closestItem)) {
        indicatorLine.style.top = (rect.top - canvasRect.top - 1) + 'px';
      } else {
        indicatorLine.style.top = (rect.bottom - canvasRect.top - 1) + 'px';
      }
    } else if (items.length > 0) {
      // Position at the end if no close item but there are items
      const lastItem = items[items.length - 1];
      const rect = lastItem.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      indicatorLine.style.top = (rect.bottom - canvasRect.top - 1) + 'px';
      insertIndex = items.length;
    } else {
      // Position at the beginning if no items
      const canvasRect = canvas.getBoundingClientRect();
      indicatorLine.style.top = '20px';
      insertIndex = 0;
    }
  });

  canvas.addEventListener('dragleave', function(e) {
    // Check if we're really leaving the canvas or just moving between elements
    const rect = this.getBoundingClientRect();
    if (e.clientY <= rect.top || e.clientY >= rect.bottom || 
        e.clientX <= rect.left || e.clientX >= rect.right) {
      this.classList.remove('active');
      // Remove indicator line
      if (indicatorLine) {
        indicatorLine.remove();
        indicatorLine = null;
      }
      insertIndex = -1;
    }
  });

  canvas.addEventListener('drop', function(e) {
    if (e.target.closest('.container-drop-area')) {
      return;
    }

    e.preventDefault();
    this.classList.remove('active');

    // Remove indicator line
    if (indicatorLine) {
      indicatorLine.remove();
      indicatorLine = null;
    }

    const componentType = e.dataTransfer.getData('componentType');
    if (componentType) {
      addComponentAtPosition(componentType, insertIndex);
    }
    
    insertIndex = -1;
  });
  
  // Add support for dragging inside container components
  document.addEventListener('dragover', function(e) {
    if (e.target.classList.contains('container-drop-area')) {
      e.preventDefault();
      e.target.classList.add('active');
    }
  });

  document.addEventListener('dragleave', function(e) {
    if (e.target.classList.contains('container-drop-area')) {
      e.target.classList.remove('active');
    }
  });

  document.addEventListener('drop', function(e) {
    const dropArea = e.target.closest('.container-drop-area');
    if (dropArea) {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.remove('active');

      const componentType = e.dataTransfer.getData('componentType');
      const containerId = dropArea.dataset.containerId;
      const targetColumn = dropArea.dataset.column;
      
      if (componentType && containerId) {
        addComponentToContainer(
          containerId,
          componentType,
          targetColumn === undefined ? null : parseInt(targetColumn, 10)
        );
      }
    }
  });
  
  // Add support for dragging and sorting components within containers
  document.addEventListener('dragstart', function(e) {
    if (e.target.classList.contains('form-item') && (e.target.parentNode.classList.contains('card-preview') || e.target.closest('.card-preview'))) {
      e.dataTransfer.setData('text/plain', e.target.dataset.id);
    }
  });
  
  document.addEventListener('dragover', function(e) {
    if (e.target.classList.contains('card-preview') || e.target.closest('.card-preview')) {
      e.preventDefault();
    }
  });
  
  document.addEventListener('dragstart', function(e) {
    if (e.target.classList.contains('form-item') && e.target.parentNode.classList.contains('card-preview')) {
      e.dataTransfer.setData('text/plain', e.target.dataset.id);
    }
  });
  
  document.addEventListener('dragover', function(e) {
    if (e.target.classList.contains('card-preview')) {
      e.preventDefault();
    }
  });
}

// Add component at specific position
function addComponentAtPosition(type, position) {
  const id = 'comp_' + state.nextId++;
  const config = JSON.parse(JSON.stringify(componentConfigs[type]));

  const component = {
    id,
    type,
    config: {
      ...config,
      name: config.name + '_' + id
    },
    children: isContainerComponent(type) ? [] : undefined
  };

  // If position is -1 or greater than array length, add to end
  if (position === -1 || position >= state.components.length) {
    component.position = state.components.length;
    state.components.push(component);
  } else {
    // Insert at specific position
    component.position = position;
    state.components.splice(position, 0, component);
    
    // Update positions of subsequent components
    for (let i = position + 1; i < state.components.length; i++) {
      state.components[i].position = i;
    }
  }

  selectComponent(component);
  renderFormItems();
  renderComponentTree(); // Update component tree
  updateSchema();
}

// Add panel to Collapse component
function addCollapsePanel(componentId, index) {
  const component = findComponentById(componentId);
  if (component && component.type === 'Collapse') {
    const newPanel = {
      key: 'panel' + (component.config.panels.length + 1),
      title: 'New Panel ' + (component.config.panels.length + 1),
      content: 'Content of New Panel ' + (component.config.panels.length + 1)
    };

    if (index === -1) {
      // Add to the end
      component.config.panels.push(newPanel);
    } else {
      // Add after the specified index
      component.config.panels.splice(index + 1, 0, newPanel);
    }

    renderFormItems();
    renderComponentTree();
    updateSchema();
  }
}

// Remove panel from Collapse component
function removeCollapsePanel(componentId, index) {
  const component = findComponentById(componentId);
  if (component && component.type === 'Collapse' && component.config.panels.length > 1) {
    component.config.panels.splice(index, 1);
    renderFormItems();
    renderComponentTree();
    updateSchema();
  }
}

// Add component (keeping for backward compatibility)
function addComponent(type) {
  addComponentAtPosition(type, -1); // -1 means add to end
}

// Add child component to container
function addComponentToContainer(containerId, type, targetColumn = null) {
  const container = findComponentById(containerId);
  if (!container) return;

  const id = 'comp_' + state.nextId++;
  const config = JSON.parse(JSON.stringify(componentConfigs[type]));

  const childComponent = {
    id,
    type,
    config: {
      ...config,
      name: config.name + '_' + id
    },
    children: (type === 'Card' || type === 'Grid' || type === 'Collapse') ? [] : undefined, // 容器组件支持子组件
    position: container.children.length
  };

  if (container.type === 'Grid') {
    const columns = container.config.columns || 3;

    if (Number.isInteger(targetColumn) && targetColumn >= 0 && targetColumn < columns) {
      childComponent.position = targetColumn;
    } else {
      let minCount = Infinity;
      let fallbackColumn = 0;

      for (let i = 0; i < columns; i++) {
        const count = container.children.filter(child => child.position === i).length;
        if (count < minCount) {
          minCount = count;
          fallbackColumn = i;
        }
      }

      childComponent.position = fallbackColumn;
    }
  }

  container.children.push(childComponent);
  selectComponent(childComponent);
  renderFormItems();
  renderComponentTree(); // Update component tree
  updateSchema();
}

// Render form items
function renderFormItems() {
  const container = document.getElementById('formItems');
  const emptyCanvas = document.getElementById('emptyCanvas');

  if (state.components.length === 0) {
    emptyCanvas.style.display = 'flex';
    container.innerHTML = '';
    return;
  }

  emptyCanvas.style.display = 'none';
  container.innerHTML = state.components.map(comp => `
              <div class="form-item ${state.selectedItem?.id === comp.id ? 'selected' : ''} ${state.showBorders ? 'with-borders' : ''}"
                   data-id="${comp.id}"
                   draggable="true">
                  <span class="form-item-label">${escapeHTML(comp.config.title)}</span>
                  <div class="form-item-content">
                      ${renderComponentPreview(comp, false)}
                  </div>
                  <div class="form-item-actions">
                      <i class="fas fa-edit form-item-action" onclick="event.stopPropagation(); editComponent('${comp.id}')"></i>
                      <i class="fas fa-trash form-item-action" onclick="event.stopPropagation(); deleteComponent('${comp.id}')"></i>
                      <i class="fas fa-arrows-alt form-item-action"
                         onmousedown="startDrag(event, '${comp.id}')"></i>
                  </div>
              </div>
          `).join('');

  // Add click selection event
  container.querySelectorAll('.form-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (!e.target.closest('.form-item-action')) {
        const id = this.dataset.id;
        const component = findComponentById(id);
        selectComponent(component);
      }
    });
  });
  
  // Add click event listeners for components within containers
  container.querySelectorAll('.card-preview > .form-item, .grid-column > .form-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (!e.target.closest('.form-item-action')) {
        e.stopPropagation();
        const id = this.dataset.id;
        const component = findComponentById(id);
        selectComponent(component);
      }
    });
  });
  
  // Add click event listeners for collapse panels
  container.querySelectorAll('.collapse-header, .collapse-tab-header').forEach(header => {
    header.addEventListener('click', function(e) {
      // Check if the click was on an action button
      if (e.target.classList.contains('add-panel') || e.target.classList.contains('remove-panel')) {
        return;
      }
      
      e.stopPropagation();
      
      // Handle tab mode differently
      if (this.classList.contains('collapse-tab-header')) {
        // For tab mode, switch active tab
        const tabIndex = this.dataset.index;
        const tabContainer = this.closest('.collapse-preview');
        
        // Update active tab header
        const tabHeaders = tabContainer.querySelectorAll('.collapse-tab-header');
        tabHeaders.forEach(header => header.classList.remove('active'));
        this.classList.add('active');
        
        // Update active tab content
        const tabContents = tabContainer.querySelectorAll('.collapse-tab-content');
        tabContents.forEach(content => content.style.display = 'none');
        const activeContent = tabContainer.querySelector(`.collapse-tab-content[data-index="${tabIndex}"]`);
        if (activeContent) {
          activeContent.style.display = 'block';
        }
      } else {
        // For accordion mode, toggle panel
        const panel = this.parentElement;
        const arrow = this.querySelector('.collapse-arrow');
        const content = panel.querySelector('.collapse-content');
        
        panel.classList.toggle('active');
        if (arrow) {
          arrow.classList.toggle('rotated');
        }
        
        if (panel.classList.contains('active')) {
          content.style.maxHeight = content.scrollHeight + 'px';
        } else {
          content.style.maxHeight = null;
        }
      }
    });
  });
}

// Get component icon
function getComponentIcon(type) {
  const icons = {
    Input: 'font',
    Textarea: 'align-left',
    InputNumber: 'sort-numeric-up',
    Select: 'list',
    DatePicker: 'calendar-alt',
    TimePicker: 'clock',
    Card: 'square',
    Divider: 'minus',
    Switch: 'toggle-on',
    Slider: 'sliders-h',
    Radio: 'dot-circle',
    Checkbox: 'check-square',
    Cascader: 'sitemap',
    Grid: 'th',
    Collapse: 'layer-group',
    ColorPicker: 'palette'
  };
  return icons[type] || 'cube';
}

// Delete component
function deleteComponent(id) {
  const index = state.components.findIndex(c => c.id === id);
  if (index > -1) {
    state.components.splice(index, 1);
    if (state.selectedItem?.id === id) {
      state.selectedItem = null;
    }
    renderFormItems();
    renderProperties();
    renderComponentTree(); // Update component tree
    updateSchema();
  }
}

// Delete child component from container
function deleteChildComponent(containerId, childId) {
  const container = findComponentById(containerId);
  if (container && container.children) {
    const index = container.children.findIndex(c => c.id === childId);
    if (index > -1) {
      container.children.splice(index, 1);
      
      // Update selection state
      if (state.selectedItem?.id === childId) {
        state.selectedItem = null;
        renderProperties();
      }
      
      renderFormItems();
      renderComponentTree();
      updateSchema();
    }
  }
}

// Edit component
function editComponent(id) {
  const component = findComponentById(id);
  selectComponent(component);
}

// Drag to reorder
function startDrag(e, id) {
  // Simple drag and reorder implementation
  e.stopPropagation();
  const component = state.components.find(c => c.id === id);
  if (!component) return;

  const dragStart = e.clientY;
  const originalIndex = component.position;

  document.onmousemove = function(moveEvent) {
    const delta = moveEvent.clientY - dragStart;
    const newIndex = Math.max(0, Math.min(state.components.length - 1,
            originalIndex + Math.round(delta / 50)));

    if (newIndex !== component.position) {
      const otherComp = state.components.find(c => c.position === newIndex);
      if (otherComp) {
        otherComp.position = component.position;
      }
      component.position = newIndex;

      state.components.sort((a, b) => a.position - b.position);
      renderFormItems();
      renderComponentTree(); // Update component tree
      updateSchema();
    }
  };

  document.onmouseup = function() {
    document.onmousemove = null;
    document.onmouseup = null;
  };
}

// Initialize properties panel collapse and resize controls
function initPropertiesPanelControls() {
  const panel = document.getElementById('propertiesPanel');
  const content = document.getElementById('propertiesContent');
  const collapseBtn = document.getElementById('collapsePropsBtn');
  const resizer = document.getElementById('propsResizer');

  if (!panel || !resizer || !collapseBtn) return;

  // Restore saved width/collapsed state
  const savedWidth = parseInt(localStorage.getItem('propsWidth'), 10);
  const savedCollapsed = localStorage.getItem('propsCollapsed') === '1';
  if (!isNaN(savedWidth)) {
    panel.style.width = Math.min(600, Math.max(200, savedWidth)) + 'px';
  }
  if (savedCollapsed) {
    panel.classList.add('collapsed');
    collapseBtn.querySelector('i').className = 'fas fa-angle-double-left';
    resizer.style.display = 'none';
  }

  // Collapse / expand
  collapseBtn.addEventListener('click', function() {
    const icon = this.querySelector('i');
    if (panel.classList.contains('collapsed')) {
      panel.classList.remove('collapsed');
      icon.className = 'fas fa-angle-double-right';
      resizer.style.display = '';
      localStorage.setItem('propsCollapsed', '0');
    } else {
      panel.classList.add('collapsed');
      icon.className = 'fas fa-angle-double-left';
      resizer.style.display = 'none';
      localStorage.setItem('propsCollapsed', '1');
    }
  });

  // Drag to resize
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', function(e) {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const dx = startX - e.clientX; // moving mouse left increases width
    let newWidth = startWidth + dx;
    // clamp
    newWidth = Math.max(200, Math.min(600, newWidth));
    panel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (dragging) {
      dragging = false;
      document.body.style.userSelect = '';
      // persist width
      const width = parseInt(panel.getBoundingClientRect().width, 10);
      localStorage.setItem('propsWidth', width);
    }
  });
}
