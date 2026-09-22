const INSPECTOR_TABS = [
  { id: 'content', label: 'Content' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'style', label: 'Style' },
  { id: 'advanced', label: 'Advanced' }
];

const inspectorState = {
  activeTab: 'content',
  fieldMap: {},
  notice: null,
  lastComponentId: null
};

function section(title, description, fields) {
  return {
    title,
    description,
    fields: fields.filter(Boolean)
  };
}

function configField(key, label, editor, options = {}) {
  return {
    key,
    label,
    editor,
    getValue(component) {
      return component.config[key];
    },
    setValue(component, value) {
      component.config[key] = value;
    },
    ...options
  };
}

function readonlyField(key, label, getValue, options = {}) {
  return {
    key,
    label,
    editor: 'readonly',
    getValue,
    ...options
  };
}

function jsonConfigField(key, label, options = {}) {
  return configField(key, label, 'json', {
    rows: options.rows || 8,
    parse(rawValue) {
      return parseJSONValue(rawValue, options.arrayOnly ? 'array' : 'any', label);
    },
    format(value) {
      return JSON.stringify(value ?? (options.arrayOnly ? [] : {}), null, 2);
    },
    ...options
  });
}

function listConfigField(key, label, options = {}) {
  return configField(key, label, 'list', {
    rows: options.rows || 5,
    parse(rawValue) {
      return rawValue
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean);
    },
    format(value) {
      return Array.isArray(value) ? value.join('\n') : '';
    },
    ...options
  });
}

function optionsConfigField(key, label, options = {}) {
  return configField(key, label, 'optionsTable', {
    getValue(component) {
      return normalizeChoiceOptions(component.config[key] || []);
    },
    setValue(component, value) {
      component.config[key] = normalizeChoiceOptions(value);
    },
    ...options
  });
}

function collapsePanelsField(key, label, options = {}) {
  return configField(key, label, 'collapsePanels', {
    getValue(component) {
      return Array.isArray(component.config[key]) ? component.config[key] : [];
    },
    setValue(component, value) {
      component.config[key] = value;
    },
    ...options
  });
}

function columnPresetField(key, label, options = {}) {
  return configField(key, label, 'columnPreset', {
    min: 1,
    max: 12,
    presets: [1, 2, 3, 4, 6],
    ...options
  });
}

function visibilityRulesField(options = {}) {
  return {
    key: 'visibilityRules',
    label: 'Rules',
    editor: 'visibilityRules',
    getValue(component) {
      return normalizeVisibilityRules(component.config.visibilityRules || []);
    },
    setValue(component, value) {
      component.config.visibilityRules = normalizeVisibilityRules(value);
      component.config.visibilityMode = component.config.visibilityRules.length > 0 ? 'conditional' : 'always';
      component.config.visibilityField = component.config.visibilityRules[0]?.field || '';
      component.config.visibilityValue = component.config.visibilityRules[0]?.value || '';
    },
    ...options
  };
}

function childrenManagerField(options = {}) {
  return {
    key: 'childrenManager',
    label: 'Children',
    editor: 'childrenManager',
    getValue(component) {
      return Array.isArray(component.children) ? component.children : [];
    },
    ...options
  };
}

function syncLegacyVisibilityConfig(component) {
  const rules = normalizeVisibilityRules(component.config.visibilityRules || []);
  component.config.visibilityRules = rules;
  component.config.visibilityMatch = component.config.visibilityMatch === 'any' ? 'any' : 'all';
  component.config.visibilityMode = rules.length > 0 ? 'conditional' : 'always';
  component.config.visibilityField = rules[0]?.field || '';
  component.config.visibilityValue = rules[0]?.value || '';
}

function cloneVisibilityRules(rules) {
  return normalizeVisibilityRules(rules || []).map(rule => ({ ...rule }));
}

function cloneCollapsePanels(panels) {
  return Array.isArray(panels) ? panels.map(panel => ({ ...panel })) : [];
}

function moveListItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items)) {
    return [];
  }

  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return items.slice();
  }

  const nextItems = items.slice();
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function buildSharedInspectorTabs(component) {
  const tabs = {
    content: [
      section('Basics', 'Core identity fields for this component.', [
        readonlyField('componentType', 'Component Type', comp => comp.type, {
          description: 'The current renderer mapped to this schema node.'
        }),
        configField('name', 'Field Name', 'text', {
          description: 'Stable field key used for submission payloads.'
        }),
        configField('title', 'Display Title', 'text', {
          description: 'Primary label shown in the canvas and preview.'
        }),
        configField('description', 'Helper Text', 'textarea', {
          rows: 3,
          description: 'Optional supporting copy shown below the control in preview.'
        })
      ])
    ],
    behavior: [
      section('Availability', 'Control visibility and interaction state.', [
        configField('hidden', 'Always Hidden', 'toggle', {
          description: 'Hide this field in preview regardless of other rules.'
        }),
        configField('disabled', 'Disabled', 'toggle', {
          description: 'Keep the field visible but block editing.'
        }),
        configField('readOnly', 'Read Only', 'toggle', {
          description: 'Show the value while preventing changes on text-like controls.'
        })
      ]),
      section('Visibility Rules', 'Compose one or more field-based conditions for showing this component.', [
        configField('visibilityMatch', 'Match Mode', 'select', {
          options: [
            { label: 'All rules must match', value: 'all' },
            { label: 'Any rule may match', value: 'any' }
          ],
          description: 'Choose whether every rule must pass or only one.'
        }),
        visibilityRulesField({
          description: 'Each rule compares another field value using a simple operator.'
        })
      ])
    ],
    style: [],
    advanced: [
      section('Schema Meta', 'Low-level values useful when debugging schema output.', [
        readonlyField('componentId', 'Component ID', comp => comp.id),
        readonlyField('schemaType', 'Schema Type', comp => comp.config.type || 'void')
      ]),
      section('Raw Config', 'Edit the full config object for this component as JSON.', [
        {
          key: 'rawConfig',
          label: 'Config JSON',
          editor: 'json',
          rows: 10,
          description: 'Useful for advanced tweaks before they get a dedicated UI control.',
          getValue(comp) {
            return JSON.stringify(comp.config, null, 2);
          },
          setValue(comp, value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              throw new Error('Config JSON must be a plain object.');
            }
            comp.config = {
              ...componentConfigs[comp.type],
              ...comp.config,
              ...value
            };
            if (supportsChoiceOptions(comp.type)) {
              comp.config.options = normalizeChoiceOptions(comp.config.options);
            }
            syncLegacyVisibilityConfig(comp);
          },
          parse(rawValue) {
            return parseJSONValue(rawValue, 'object', 'Config JSON');
          }
        }
      ])
    ]
  };

  if (supportsRequired(component.type)) {
    tabs.behavior.push(
      section('Validation', 'Control whether users must complete this field.', [
        configField('required', 'Required', 'toggle', {
          description: 'Adds required validation to the exported schema.'
        })
      ])
    );
  }

  if (supportsTitleToggle(component.type)) {
    tabs.style.push(
      section('Container Chrome', 'Adjust how the container label is presented.', [
        configField('showTitle', 'Show Title', 'toggle', {
          description: 'Show the container title treatment in the canvas.'
        })
      ])
    );
  }

  return tabs;
}

const inspectorRegistry = {
  Input(component) {
    return {
      content: [
        section('Input Copy', 'Field-level copy shown inside the control.', [
          configField('placeholder', 'Placeholder', 'text', {
            description: 'Inline guidance shown before the user types.'
          })
        ])
      ],
      behavior: [
        section('Value', 'Default state used when the preview opens.', [
          configField('defaultValue', 'Default Value', 'text')
        ])
      ]
    };
  },
  Textarea(component) {
    return {
      content: [
        section('Input Copy', 'Field-level copy shown inside the control.', [
          configField('placeholder', 'Placeholder', 'text', {
            description: 'Inline guidance shown before the user types.'
          })
        ])
      ],
      behavior: [
        section('Value', 'Default state used when the preview opens.', [
          configField('defaultValue', 'Default Value', 'textarea', {
            rows: 4
          })
        ])
      ]
    };
  },
  InputNumber(component) {
    return {
      behavior: [
        section('Number State', 'Basic numeric defaults for the field preview.', [
          configField('defaultValue', 'Default Value', 'number'),
          configField('min', 'Minimum', 'number', {
            description: 'Stored for future numeric rule support.'
          }),
          configField('max', 'Maximum', 'number', {
            description: 'Stored for future numeric rule support.'
          })
        ])
      ]
    };
  },
  Select(component) {
    return {
      content: [
        section('Choice Source', 'Manage dropdown choices as label and value pairs.', [
          optionsConfigField('options', 'Options', {
            description: 'Each row controls the visible label and submitted value.'
          })
        ])
      ],
      behavior: [
        section('Selection State', 'Choose which option is initially selected.', [
          configField('defaultValue', 'Default Value', 'text')
        ])
      ]
    };
  },
  Radio(component) {
    return {
      content: [
        section('Choice Source', 'Manage radio choices as label and value pairs.', [
          optionsConfigField('options', 'Options', {
            description: 'Each row controls the visible label and submitted value.'
          })
        ])
      ],
      behavior: [
        section('Selection State', 'Choose which option is initially selected.', [
          configField('defaultValue', 'Default Value', 'text')
        ])
      ]
    };
  },
  Checkbox(component) {
    return {
      content: [
        section('Choice Source', 'Manage checkbox choices as label and value pairs.', [
          optionsConfigField('options', 'Options', {
            description: 'Each row controls the visible label and submitted value.'
          })
        ])
      ],
      behavior: [
        section('Selection State', 'Default selections used in preview.', [
          listConfigField('defaultValue', 'Default Values', {
            description: 'One selected value per line.'
          })
        ])
      ]
    };
  },
  Cascader(component) {
    return {
      content: [
        section('Nested Options', 'Edit the cascader tree in raw JSON.', [
          jsonConfigField('options', 'Options JSON', {
            arrayOnly: true,
            rows: 10,
            description: 'Provide an array of label/value nodes with optional children.'
          })
        ])
      ],
      behavior: [
        section('Selection State', 'Store a default path for the preview.', [
          jsonConfigField('defaultValue', 'Default Path JSON', {
            arrayOnly: true,
            rows: 4,
            description: 'Usually an array representing the selected path.'
          })
        ])
      ]
    };
  },
  DatePicker(component) {
    return {
      behavior: [
        section('Date State', 'Initial date shown in preview.', [
          configField('defaultValue', 'Default Value', 'text', {
            description: 'Use a browser-friendly date string such as 2026-03-15.'
          })
        ])
      ]
    };
  },
  TimePicker(component) {
    return {
      behavior: [
        section('Time State', 'Initial time shown in preview.', [
          configField('defaultValue', 'Default Value', 'text', {
            description: 'Use a browser-friendly time string such as 09:30.'
          })
        ])
      ]
    };
  },
  Switch(component) {
    return {
      behavior: [
        section('Toggle State', 'Define whether the switch starts enabled.', [
          configField('defaultValue', 'Default Value', 'toggle')
        ])
      ]
    };
  },
  Slider(component) {
    return {
      behavior: [
        section('Range', 'Core range settings for the slider control.', [
          configField('min', 'Minimum', 'number'),
          configField('max', 'Maximum', 'number'),
          configField('defaultValue', 'Default Value', 'number')
        ])
      ]
    };
  },
  ColorPicker(component) {
    return {
      content: [
        section('Color Value', 'Set the starting color token.', [
          configField('defaultValue', 'Default Color', 'color')
        ])
      ]
    };
  },
  Card(component) {
    return {
      content: [
        section('Children', 'Review and reorder the fields nested inside this card.', [
          childrenManagerField({
            description: 'Select, move, or remove nested components without leaving the inspector.'
          })
        ])
      ]
    };
  },
  Divider(component) {
    return {
      content: [
        section('Divider Copy', 'Text rendered on the divider line.', [
          configField('content', 'Divider Text', 'text')
        ])
      ]
    };
  },
  Grid(component) {
    return {
      content: [
        section('Children', 'Manage the order and column placement of nested grid items.', [
          childrenManagerField({
            description: 'Move items between columns or reorder them within the grid.'
          })
        ])
      ],
      style: [
        section('Layout', 'Structural controls for the grid container.', [
          columnPresetField('columns', 'Columns', {
            description: 'The number of visible columns in the grid.',
            min: 1,
            max: 12,
            setValue(comp, value) {
              const nextColumns = Math.max(1, Number(value) || 1);
              comp.config.columns = nextColumns;
              if (Array.isArray(comp.children)) {
                comp.children.forEach(child => {
                  const currentColumn = Number.isInteger(child.position) ? child.position : 0;
                  child.position = Math.max(0, Math.min(nextColumns - 1, currentColumn));
                });
              }
            }
          })
        ])
      ]
    };
  },
  Collapse(component) {
    return {
      content: [
        section('Panels', 'Manage panel titles and content with structured rows.', [
          collapsePanelsField('panels', 'Panels', {
            description: 'Add, edit, and remove collapsible sections without raw JSON.'
          })
        ])
      ],
      style: [
        section('Presentation', 'Switch how panels are presented in the canvas.', [
          configField('direction', 'Direction', 'select', {
            options: [
              { label: 'Vertical', value: 'vertical' },
              { label: 'Horizontal Tabs', value: 'horizontal' }
            ]
          })
        ])
      ]
    };
  }
};

function supportsRequired(type) {
  return !['Card', 'Grid', 'Divider', 'Collapse'].includes(type);
}

function supportsTitleToggle(type) {
  return ['Card', 'Grid', 'Divider'].includes(type);
}

function mergeInspectorTabs(sharedTabs, specificTabs) {
  const merged = {};

  INSPECTOR_TABS.forEach(tab => {
    merged[tab.id] = [
      ...(sharedTabs[tab.id] || []),
      ...(specificTabs[tab.id] || [])
    ].filter(sectionConfig => sectionConfig.fields.length > 0);
  });

  return merged;
}

function buildInspectorTabs(component) {
  const sharedTabs = buildSharedInspectorTabs(component);
  const specificTabs = inspectorRegistry[component.type]
    ? inspectorRegistry[component.type](component)
    : {};

  return mergeInspectorTabs(sharedTabs, specificTabs);
}

function parseJSONValue(rawValue, mode, label) {
  let parsedValue;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch (error) {
    throw new Error(label + ' must be valid JSON.');
  }

  if (mode === 'array' && !Array.isArray(parsedValue)) {
    throw new Error(label + ' must be a JSON array.');
  }

  if (mode === 'object' && (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue))) {
    throw new Error(label + ' must be a JSON object.');
  }

  return parsedValue;
}

function getFieldRuntimeId(component, fieldKey) {
  return component.id + '__' + fieldKey;
}

function getFieldValue(component, field) {
  const rawValue = field.getValue(component);
  if (field.format) {
    return field.format(rawValue, component);
  }
  return rawValue;
}

function normalizeFieldValue(field, rawValue) {
  if (field.parse) {
    return field.parse(rawValue);
  }

  switch (field.editor) {
    case 'number':
    case 'columnPreset':
      if (rawValue === '') {
        return 0;
      }
      return Number(rawValue);
    case 'toggle':
      return !!rawValue;
    default:
      return rawValue;
  }
}

function applyInspectorValue(fieldId, nextValue) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  try {
    field.setValue(state.selectedItem, nextValue);
    inspectorState.notice = null;
    syncInspectorUI();
  } catch (error) {
    inspectorState.notice = {
      tone: 'error',
      message: error.message
    };
    renderProperties();
  }
}

function renderOptionsTable(fieldId, value) {
  const options = normalizeChoiceOptions(value || []);

  return `
    <div class="inspector-collection">
      <div class="inspector-collection-head">
        <span>Label</span>
        <span>Value</span>
        <span>Actions</span>
      </div>
      ${options.map((option, index) => `
        <div class="inspector-collection-row">
          <input class="ant-input" value="${escapeAttribute(option.label)}" onchange="updateOptionsEditorField('${fieldId}', ${index}, 'label', this.value)">
          <input class="ant-input" value="${escapeAttribute(option.value)}" onchange="updateOptionsEditorField('${fieldId}', ${index}, 'value', this.value)">
          <div class="inspector-action-group">
            <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveOptionsEditorRow('${fieldId}', ${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move up">
              <i class="fas fa-arrow-up"></i>
            </button>
            <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveOptionsEditorRow('${fieldId}', ${index}, 1)" ${index === options.length - 1 ? 'disabled' : ''} title="Move down">
              <i class="fas fa-arrow-down"></i>
            </button>
            <button type="button" class="inspector-collection-action" onclick="removeOptionsEditorRow('${fieldId}', ${index})" title="Remove option">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('')}
      <button type="button" class="inspector-add-button" onclick="addOptionsEditorRow('${fieldId}')">
        <i class="fas fa-plus"></i>
        Add Option
      </button>
    </div>`;
}

function renderCollapsePanelsEditor(fieldId, value) {
  const panels = Array.isArray(value) ? value : [];

  return `
    <div class="inspector-panel-editor">
      ${panels.map((panel, index) => `
        <div class="inspector-panel-card">
          <div class="inspector-panel-card-header">
            <strong>Panel ${index + 1}</strong>
            <div class="inspector-action-group">
              <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveCollapseEditorPanel('${fieldId}', ${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move up">
                <i class="fas fa-arrow-up"></i>
              </button>
              <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveCollapseEditorPanel('${fieldId}', ${index}, 1)" ${index === panels.length - 1 ? 'disabled' : ''} title="Move down">
                <i class="fas fa-arrow-down"></i>
              </button>
              <button type="button" class="inspector-collection-action" onclick="removeCollapseEditorPanel('${fieldId}', ${index})" title="Remove panel">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <input class="ant-input" value="${escapeAttribute(panel.key || `panel${index + 1}`)}" onchange="updateCollapsePanelField('${fieldId}', ${index}, 'key', this.value)" placeholder="Panel key">
          <input class="ant-input" value="${escapeAttribute(panel.title || '')}" onchange="updateCollapsePanelField('${fieldId}', ${index}, 'title', this.value)" placeholder="Panel title">
          <textarea class="ant-input" rows="4" onchange="updateCollapsePanelField('${fieldId}', ${index}, 'content', this.value)" placeholder="Panel content">${escapeHTML(panel.content || '')}</textarea>
        </div>
      `).join('')}
      <button type="button" class="inspector-add-button" onclick="addCollapseEditorPanel('${fieldId}')">
        <i class="fas fa-plus"></i>
        Add Panel
      </button>
    </div>`;
}

function renderVisibilityRulesEditor(fieldId, value, component, field) {
  const rules = cloneVisibilityRules(value || []);
  const matchMode = component.config.visibilityMatch === 'any' ? 'any' : 'all';

  return `
    <div class="inspector-rules-editor">
      <div class="inspector-rule-summary">
        <span class="inspector-rule-summary-title">${rules.length === 0 ? 'No conditional rules yet' : `${rules.length} rule${rules.length > 1 ? 's' : ''} configured`}</span>
        <span class="inspector-rule-summary-copy">${matchMode === 'any' ? 'The component appears when any rule matches.' : 'The component appears only when every rule matches.'}</span>
      </div>
      ${rules.map((rule, index) => `
        <div class="inspector-rule-card">
          <div class="inspector-rule-card-header">
            <strong>Rule ${index + 1}</strong>
            <div class="inspector-action-group">
              <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveVisibilityRule('${fieldId}', ${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move up">
                <i class="fas fa-arrow-up"></i>
              </button>
              <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveVisibilityRule('${fieldId}', ${index}, 1)" ${index === rules.length - 1 ? 'disabled' : ''} title="Move down">
                <i class="fas fa-arrow-down"></i>
              </button>
              <button type="button" class="inspector-collection-action" onclick="removeVisibilityRule('${fieldId}', ${index})" title="Remove rule">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="inspector-rule-grid">
            <input class="ant-input" value="${escapeAttribute(rule.field || '')}" onchange="updateVisibilityRuleField('${fieldId}', ${index}, 'field', this.value)" placeholder="Field name">
            <select class="ant-input" onchange="updateVisibilityRuleField('${fieldId}', ${index}, 'operator', this.value)">
              <option value="equals" ${rule.operator === 'equals' ? 'selected' : ''}>equals</option>
              <option value="notEquals" ${rule.operator === 'notEquals' ? 'selected' : ''}>does not equal</option>
            </select>
            <input class="ant-input" value="${escapeAttribute(rule.value || '')}" onchange="updateVisibilityRuleField('${fieldId}', ${index}, 'value', this.value)" placeholder="Expected value">
          </div>
        </div>
      `).join('')}
      <button type="button" class="inspector-add-button" onclick="addVisibilityRule('${fieldId}')">
        <i class="fas fa-plus"></i>
        Add Rule
      </button>
    </div>`;
}

function renderChildrenManagerEditor(component) {
  const children = Array.isArray(component.children) ? component.children : [];
  const columns = Math.max(1, component.config.columns || 1);

  return `
    <div class="inspector-children-editor">
      ${children.length > 0 ? children.map((child, index) => `
        <div class="inspector-child-card">
          <div class="inspector-child-copy">
            <strong>${escapeHTML(child.config.title || child.type)}</strong>
            <p>${escapeHTML(child.config.name || child.id)}</p>
            <div class="inspector-child-meta">
              <span class="inspector-child-badge">${escapeHTML(child.type)}</span>
              ${component.type === 'Grid'
                ? `<span class="inspector-child-badge">Col ${Math.min(columns, (Number(child.position) || 0) + 1)}</span>`
                : `<span class="inspector-child-badge">Item ${index + 1}</span>`}
            </div>
          </div>
          <div class="inspector-child-actions">
            ${component.type === 'Grid'
              ? `
                <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="shiftInspectorChildColumn('${component.id}', '${child.id}', -1)" ${(Number(child.position) || 0) <= 0 ? 'disabled' : ''} title="Move to previous column">
                  <i class="fas fa-arrow-left"></i>
                </button>
                <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="shiftInspectorChildColumn('${component.id}', '${child.id}', 1)" ${(Number(child.position) || 0) >= columns - 1 ? 'disabled' : ''} title="Move to next column">
                  <i class="fas fa-arrow-right"></i>
                </button>
              `
              : ''}
            <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveInspectorChild('${component.id}', '${child.id}', -1)" ${index === 0 ? 'disabled' : ''} title="Move up">
              <i class="fas fa-arrow-up"></i>
            </button>
            <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="moveInspectorChild('${component.id}', '${child.id}', 1)" ${index === children.length - 1 ? 'disabled' : ''} title="Move down">
              <i class="fas fa-arrow-down"></i>
            </button>
            <button type="button" class="inspector-collection-action inspector-collection-action-neutral" onclick="selectInspectorChild('${child.id}')" title="Select child">
              <i class="fas fa-crosshairs"></i>
            </button>
            <button type="button" class="inspector-collection-action" onclick="deleteInspectorChild('${component.id}', '${child.id}')" title="Remove child">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('') : `
        <div class="inspector-empty-tab inspector-empty-inline">
          <p class="inspector-empty-title">No nested components yet</p>
          <p class="inspector-empty-copy">Drag fields into this container to manage them here.</p>
        </div>
      `}
    </div>`;
}

function renderColumnPresetEditor(fieldId, field, value) {
  const currentValue = Number(value || 1);

  return `
    <div class="inspector-column-editor">
      <div class="inspector-chip-row">
        ${(field.presets || []).map(preset => `
          <button
            type="button"
            class="inspector-chip ${preset === currentValue ? 'active' : ''}"
            onclick="applyColumnPreset('${fieldId}', ${preset})"
          >
            ${preset} Col${preset > 1 ? 's' : ''}
          </button>
        `).join('')}
      </div>
      <input
        type="number"
        class="ant-input"
        value="${escapeAttribute(currentValue)}"
        min="${field.min !== undefined ? field.min : 1}"
        max="${field.max !== undefined ? field.max : 12}"
        onchange="updateInspectorField('${fieldId}', this.value)"
      >
    </div>`;
}

function renderProperties() {
  const container = document.getElementById('propertiesContent');

  if (!state.selectedItem) {
    container.innerHTML = `
      <div class="empty-properties inspector-empty">
        <div>
          <p class="inspector-empty-title">Select a component to configure</p>
          <p class="inspector-empty-copy">The inspector will show grouped controls for content, behavior, style, and advanced schema editing.</p>
        </div>
      </div>`;
    return;
  }

  const component = state.selectedItem;
  const componentTabs = buildInspectorTabs(component);

  if (inspectorState.lastComponentId !== component.id) {
    inspectorState.lastComponentId = component.id;
    inspectorState.notice = null;
    if (!componentTabs[inspectorState.activeTab] || componentTabs[inspectorState.activeTab].length === 0) {
      inspectorState.activeTab = 'content';
    }
  }

  inspectorState.fieldMap = {};

  const activeTabSections = componentTabs[inspectorState.activeTab] || [];
  const componentLabel = component.config.title || component.type;
  const icon = getComponentIcon(component.type);

  container.innerHTML = `
    <div class="inspector-shell">
      <div class="inspector-summary">
        <div class="inspector-summary-icon">
          <i class="fas fa-${icon}"></i>
        </div>
        <div class="inspector-summary-copy">
          <span class="inspector-summary-type">${escapeHTML(component.type)}</span>
          <h3>${escapeHTML(componentLabel)}</h3>
          <p>${escapeHTML(component.config.name)}</p>
        </div>
      </div>

      <div class="inspector-tabs">
        ${INSPECTOR_TABS.map(tab => `
          <button
            type="button"
            class="inspector-tab ${inspectorState.activeTab === tab.id ? 'active' : ''}"
            onclick="switchInspectorTab('${tab.id}')"
          >
            ${tab.label}
          </button>
        `).join('')}
      </div>

      ${renderInspectorNotice()}

      <div class="inspector-sections">
        ${activeTabSections.length > 0
          ? activeTabSections.map(sectionConfig => renderInspectorSection(component, sectionConfig)).join('')
          : `
            <div class="inspector-empty-tab">
              <p class="inspector-empty-title">No controls in this tab yet</p>
              <p class="inspector-empty-copy">This layout is ready for more component-specific configuration as we expand the registry.</p>
            </div>
          `}
      </div>
    </div>`;
}

function renderInspectorNotice() {
  if (!inspectorState.notice) {
    return '';
  }

  return `
    <div class="inspector-notice ${inspectorState.notice.tone || 'error'}">
      ${escapeHTML(inspectorState.notice.message)}
    </div>`;
}

function renderInspectorSection(component, sectionConfig) {
  const visibleFields = sectionConfig.fields.filter(field => !field.showWhen || field.showWhen(component));

  return `
    <section class="inspector-section">
      <div class="inspector-section-header">
        <h4>${escapeHTML(sectionConfig.title)}</h4>
        <p>${escapeHTML(sectionConfig.description)}</p>
      </div>
      <div class="inspector-section-body">
        ${visibleFields.map(field => renderInspectorField(component, field)).join('')}
      </div>
    </section>`;
}

function renderInspectorField(component, field) {
  const fieldId = getFieldRuntimeId(component, field.key);
  inspectorState.fieldMap[fieldId] = field;

  const isVertical = ['textarea', 'json', 'list', 'optionsTable', 'collapsePanels', 'columnPreset', 'visibilityRules', 'childrenManager'].includes(field.editor);
  const fieldValue = getFieldValue(component, field);
  const description = field.description
    ? `<p class="inspector-field-help">${escapeHTML(field.description)}</p>`
    : '';

  return `
    <div class="property-field ${isVertical ? 'vertical' : ''}">
      <div class="field-stack">
        <label class="property-label">${escapeHTML(field.label)}</label>
        ${description}
      </div>
      <div class="field-control">
        ${renderInspectorControl(fieldId, field, fieldValue)}
      </div>
    </div>`;
}

function renderInspectorControl(fieldId, field, value) {
  switch (field.editor) {
    case 'readonly':
      return `<div class="inspector-readonly">${escapeHTML(value ?? '')}</div>`;
    case 'text':
      return `<input class="ant-input" value="${escapeAttribute(value ?? '')}" onchange="updateInspectorField('${fieldId}', this.value)">`;
    case 'textarea':
      return `<textarea class="ant-input" rows="${field.rows || 4}" onchange="updateInspectorField('${fieldId}', this.value)">${escapeHTML(value ?? '')}</textarea>`;
    case 'number':
      return `<input type="number" class="ant-input" value="${escapeAttribute(value ?? 0)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} onchange="updateInspectorField('${fieldId}', this.value)">`;
    case 'toggle':
      return `
        <label class="inspector-toggle">
          <input type="checkbox" ${value ? 'checked' : ''} onchange="toggleInspectorField('${fieldId}', this.checked)">
          <span>${value ? 'Enabled' : 'Disabled'}</span>
        </label>`;
    case 'select':
      return `
        <select class="ant-input" onchange="updateInspectorField('${fieldId}', this.value)">
          ${(field.options || []).map(option => `
            <option value="${escapeAttribute(option.value)}" ${option.value === value ? 'selected' : ''}>
              ${escapeHTML(option.label)}
            </option>
          `).join('')}
        </select>`;
    case 'list':
      return `<textarea class="ant-input" rows="${field.rows || 5}" onchange="updateInspectorField('${fieldId}', this.value)">${escapeHTML(value ?? '')}</textarea>`;
    case 'json':
      return `<textarea class="ant-input" rows="${field.rows || 8}" onchange="updateInspectorField('${fieldId}', this.value)">${escapeHTML(value ?? '')}</textarea>`;
    case 'optionsTable':
      return renderOptionsTable(fieldId, value);
    case 'collapsePanels':
      return renderCollapsePanelsEditor(fieldId, value);
    case 'columnPreset':
      return renderColumnPresetEditor(fieldId, field, value);
    case 'visibilityRules':
      return renderVisibilityRulesEditor(fieldId, value, state.selectedItem, field);
    case 'childrenManager':
      return renderChildrenManagerEditor(state.selectedItem);
    case 'color':
      return `
        <div class="inspector-color-field">
          <input type="color" class="ant-input inspector-color-input" value="${escapeAttribute(value || '#1890ff')}" onchange="updateInspectorField('${fieldId}', this.value)">
          <input class="ant-input" value="${escapeAttribute(value || '#1890ff')}" onchange="updateInspectorField('${fieldId}', this.value)">
        </div>`;
    default:
      return `<input class="ant-input" value="${escapeAttribute(value ?? '')}" onchange="updateInspectorField('${fieldId}', this.value)">`;
  }
}

function switchInspectorTab(tabId) {
  inspectorState.activeTab = tabId;
  renderProperties();
}

function syncInspectorUI() {
  renderFormItems();
  renderProperties();
  renderComponentTree();
  updateSchema();
}

function updateInspectorField(fieldId, rawValue) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  try {
    const nextValue = normalizeFieldValue(field, rawValue);
    applyInspectorValue(fieldId, nextValue);
  } catch (error) {
    inspectorState.notice = {
      tone: 'error',
      message: error.message
    };
    renderProperties();
  }
}

function toggleInspectorField(fieldId, checked) {
  updateInspectorField(fieldId, checked);
}

function updateOptionsEditorField(fieldId, index, key, rawValue) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const options = normalizeChoiceOptions(field.getValue(state.selectedItem) || []);
  if (!options[index]) {
    return;
  }

  options[index] = {
    ...options[index],
    [key]: rawValue
  };

  if (!options[index].value) {
    options[index].value = options[index].label;
  }

  applyInspectorValue(fieldId, options);
}

function addOptionsEditorRow(fieldId) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const options = normalizeChoiceOptions(field.getValue(state.selectedItem) || []);
  options.push({
    label: `Option ${options.length + 1}`,
    value: `option_${options.length + 1}`
  });
  applyInspectorValue(fieldId, options);
}

function moveOptionsEditorRow(fieldId, index, direction) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const options = normalizeChoiceOptions(field.getValue(state.selectedItem) || []);
  applyInspectorValue(fieldId, moveListItem(options, index, index + direction));
}

function removeOptionsEditorRow(fieldId, index) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const options = normalizeChoiceOptions(field.getValue(state.selectedItem) || []);
  options.splice(index, 1);
  applyInspectorValue(fieldId, options);
}

function updateCollapsePanelField(fieldId, index, key, rawValue) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const panels = Array.isArray(field.getValue(state.selectedItem))
    ? field.getValue(state.selectedItem).map(panel => ({ ...panel }))
    : [];

  if (!panels[index]) {
    return;
  }

  panels[index][key] = rawValue;
  applyInspectorValue(fieldId, panels);
}

function addCollapseEditorPanel(fieldId) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const panels = Array.isArray(field.getValue(state.selectedItem))
    ? field.getValue(state.selectedItem).map(panel => ({ ...panel }))
    : [];
  const nextIndex = panels.length + 1;

  panels.push({
    key: `panel${nextIndex}`,
    title: `Panel ${nextIndex}`,
    content: ''
  });
  applyInspectorValue(fieldId, panels);
}

function moveCollapseEditorPanel(fieldId, index, direction) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  applyInspectorValue(fieldId, moveListItem(cloneCollapsePanels(field.getValue(state.selectedItem)), index, index + direction));
}

function removeCollapseEditorPanel(fieldId, index) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const panels = Array.isArray(field.getValue(state.selectedItem))
    ? field.getValue(state.selectedItem).map(panel => ({ ...panel }))
    : [];

  if (panels.length <= 1) {
    inspectorState.notice = {
      tone: 'error',
      message: 'Collapse must keep at least one panel.'
    };
    renderProperties();
    return;
  }

  panels.splice(index, 1);
  applyInspectorValue(fieldId, panels);
}

function addVisibilityRule(fieldId) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const rules = cloneVisibilityRules(field.getValue(state.selectedItem));
  rules.push({
    field: '',
    operator: 'equals',
    value: ''
  });
  applyInspectorValue(fieldId, rules);
}

function updateVisibilityRuleField(fieldId, index, key, rawValue) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const rules = cloneVisibilityRules(field.getValue(state.selectedItem));
  if (!rules[index]) {
    return;
  }

  rules[index] = {
    ...rules[index],
    [key]: rawValue
  };
  applyInspectorValue(fieldId, rules);
}

function moveVisibilityRule(fieldId, index, direction) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  applyInspectorValue(fieldId, moveListItem(cloneVisibilityRules(field.getValue(state.selectedItem)), index, index + direction));
}

function removeVisibilityRule(fieldId, index) {
  const field = inspectorState.fieldMap[fieldId];
  if (!field || !state.selectedItem) {
    return;
  }

  const rules = cloneVisibilityRules(field.getValue(state.selectedItem));
  rules.splice(index, 1);
  applyInspectorValue(fieldId, rules);
}

function applyColumnPreset(fieldId, columns) {
  applyInspectorValue(fieldId, columns);
}

function selectInspectorChild(childId) {
  const child = findComponentById(childId);
  if (child) {
    selectComponent(child);
  }
}

function moveInspectorChild(containerId, childId, direction) {
  const container = findComponentById(containerId);
  if (!container || !Array.isArray(container.children)) {
    return;
  }

  const index = container.children.findIndex(child => child.id === childId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= container.children.length) {
    return;
  }

  container.children = moveListItem(container.children, index, nextIndex);
  syncInspectorUI();
}

function shiftInspectorChildColumn(containerId, childId, delta) {
  const container = findComponentById(containerId);
  if (!container || container.type !== 'Grid' || !Array.isArray(container.children)) {
    return;
  }

  const child = container.children.find(item => item.id === childId);
  if (!child) {
    return;
  }

  const maxColumn = Math.max(0, (container.config.columns || 1) - 1);
  const currentColumn = Number.isInteger(child.position) ? child.position : 0;
  child.position = Math.max(0, Math.min(maxColumn, currentColumn + delta));
  syncInspectorUI();
}

function deleteInspectorChild(containerId, childId) {
  deleteChildComponent(containerId, childId);
  const container = findComponentById(containerId);
  if (container) {
    selectComponent(container);
  }
}

// Backward-compatible wrappers
function updateProperty(key, value) {
  if (!state.selectedItem) {
    return;
  }
  state.selectedItem.config[key] = value;
  inspectorState.notice = null;
  syncInspectorUI();
}

function updateCascaderOptions(value, id) {
  const component = findComponentById(id);
  if (!component) {
    return;
  }

  try {
    component.config.options = parseJSONValue(value, 'array', 'Cascader Options');
    inspectorState.notice = null;
    syncInspectorUI();
  } catch (error) {
    inspectorState.notice = {
      tone: 'error',
      message: error.message
    };
    renderProperties();
  }
}

function updateCollapsePanels(value, id) {
  const component = findComponentById(id);
  if (!component) {
    return;
  }

  try {
    component.config.panels = parseJSONValue(value, 'array', 'Collapse Panels');
    inspectorState.notice = null;
    syncInspectorUI();
  } catch (error) {
    inspectorState.notice = {
      tone: 'error',
      message: error.message
    };
    renderProperties();
  }
}

window.switchInspectorTab = switchInspectorTab;
window.updateInspectorField = updateInspectorField;
window.toggleInspectorField = toggleInspectorField;
window.updateOptionsEditorField = updateOptionsEditorField;
window.addOptionsEditorRow = addOptionsEditorRow;
window.moveOptionsEditorRow = moveOptionsEditorRow;
window.removeOptionsEditorRow = removeOptionsEditorRow;
window.updateCollapsePanelField = updateCollapsePanelField;
window.addCollapseEditorPanel = addCollapseEditorPanel;
window.moveCollapseEditorPanel = moveCollapseEditorPanel;
window.removeCollapseEditorPanel = removeCollapseEditorPanel;
window.addVisibilityRule = addVisibilityRule;
window.updateVisibilityRuleField = updateVisibilityRuleField;
window.moveVisibilityRule = moveVisibilityRule;
window.removeVisibilityRule = removeVisibilityRule;
window.selectInspectorChild = selectInspectorChild;
window.moveInspectorChild = moveInspectorChild;
window.shiftInspectorChildColumn = shiftInspectorChildColumn;
window.deleteInspectorChild = deleteInspectorChild;
window.applyColumnPreset = applyColumnPreset;
