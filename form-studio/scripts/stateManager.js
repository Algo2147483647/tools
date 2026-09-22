// Global state management
const state = {
  formSchema: {
    form: {
      labelCol: 4,
      wrapperCol: 18
    },
    schema: {
      type: "object",
      properties: {}
    }
  },
  selectedItem: null,
  components: [],
  nextId: 1,
  showBorders: false  // Control whether to show borders
};

const sharedComponentConfig = {
  description: "",
  hidden: false,
  disabled: false,
  readOnly: false,
  visibilityMatch: "all",
  visibilityRules: [],
  visibilityMode: "always",
  visibilityField: "",
  visibilityValue: ""
};

// Component configuration mapping
const componentConfigs = {
  Input: {
    name: "input",
    title: "Input",
    defaultValue: "",
    placeholder: "Please enter",
    required: false,
    type: "string"
  },
  Textarea: {
    name: "textarea",
    title: "Textarea",
    defaultValue: "",
    placeholder: "Please enter",
    required: false,
    type: "string"
  },
  InputNumber: {
    name: "number",
    title: "Number Input",
    defaultValue: 0,
    type: "number"
  },
  Select: {
    name: "select",
    title: "Selector",
    defaultValue: "",
    options: ["Option 1", "Option 2", "Option 3"],
    type: "string"
  },
  Cascader: {
    name: "cascader",
    title: "Cascader",
    defaultValue: [],
    options: [
      { 
        value: 'zhejiang',
        label: 'Zhejiang',
        children: [
          {
            value: 'hangzhou',
            label: 'Hangzhou'
          }
        ]
      }
    ],
    type: "array"
  },
  DatePicker: {
    name: "date",
    title: "Date Picker",
    type: "string"
  },
  TimePicker: {
    name: "time",
    title: "Time Picker",
    type: "string"
  },
  Card: {
    name: "card",
    title: "",
    type: "void",
    properties: {}
  },
  Divider: {
    name: "divider",
    title: "",
    type: "void",
    content: "", // Default no text
  },
  Grid: {
    name: "grid",
    title: "",
    type: "void",
    columns: 3, // Default 3 columns
  },
  Collapse: {
    name: "collapse",
    title: "Collapse Panel",
    type: "void",
    direction: "vertical", // 默认方向为垂直
    panels: [
      {
        key: "panel1",
        title: "Panel 1",
        content: "Content of Panel 1"
      }
    ]
  },
  Switch: {
    name: "switch",
    title: "Switch",
    defaultValue: false,
    type: "boolean"
  },
  Slider: {
    name: "slider",
    title: "Slider",
    defaultValue: 0,
    min: 0,
    max: 100,
    type: "number"
  },
  Radio: {
    name: "radio",
    title: "Radio",
    defaultValue: "",
    options: ["Option 1", "Option 2"],
    type: "string"
  },
  Checkbox: {
    name: "checkbox",
    title: "Checkbox",
    defaultValue: [],
    options: ["Option 1", "Option 2", "Option 3"],
    type: "array"
  },
  ColorPicker: {
    name: "color",
    title: "Color Picker",
    defaultValue: "#1890ff",
    type: "string"
  }
};

function supportsChoiceOptions(type) {
  return type === 'Select' || type === 'Radio' || type === 'Checkbox';
}

function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    const label = option.label !== undefined && option.label !== null
      ? String(option.label)
      : String(option.value !== undefined ? option.value : `Option ${index + 1}`);
    const value = option.value !== undefined && option.value !== null
      ? String(option.value)
      : label;

    return {
      label,
      value
    };
  }

  const fallback = option === undefined || option === null || option === ''
    ? `Option ${index + 1}`
    : String(option);

  return {
    label: fallback,
    value: fallback
  };
}

function normalizeChoiceOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option, index) => normalizeChoiceOption(option, index))
    .filter(option => option.label || option.value);
}

function normalizeVisibilityRule(rule = {}) {
  return {
    field: rule.field !== undefined && rule.field !== null ? String(rule.field) : '',
    operator: rule.operator === 'notEquals' ? 'notEquals' : 'equals',
    value: rule.value !== undefined && rule.value !== null ? String(rule.value) : ''
  };
}

function normalizeVisibilityRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules
    .map(rule => normalizeVisibilityRule(rule))
    .filter(rule => rule.field);
}

Object.keys(componentConfigs).forEach(type => {
  componentConfigs[type] = {
    ...sharedComponentConfig,
    ...componentConfigs[type]
  };

  if (supportsChoiceOptions(type)) {
    componentConfigs[type].options = normalizeChoiceOptions(componentConfigs[type].options);
  }
  componentConfigs[type].visibilityRules = normalizeVisibilityRules(componentConfigs[type].visibilityRules);
});

function isContainerComponent(type) {
  return type === 'Card' || type === 'Grid' || type === 'Collapse';
}

function toSafeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function escapeHTML(value) {
  return toSafeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

// Find component by ID (including nested components)
function findComponentById(id) {
  // Find at root level
  for (const component of state.components) {
    if (component.id === id) {
      return component;
    }
    
    // Find in container component's children
    if (component.children) {
      const found = findComponentInContainer(component.children, id);
      if (found) {
        return found;
      }
    }
  }
  
  return null;
}

// Recursively find component in container
function findComponentInContainer(children, id) {
  for (const child of children) {
    if (child.id === id) {
      return child;
    }
    
    if (child.children) {
      const found = findComponentInContainer(child.children, id);
      if (found) {
        return found;
      }
    }
  }
  
  return null;
}

// Update JSON Schema
function updateSchema() {
  const properties = {};

  state.components.forEach((comp, index) => {
    const fieldId = comp.config.name.replace(/[^a-zA-Z0-9]/g, '') + '_' + comp.id;

    properties[fieldId] = {
      name: comp.config.name,
      type: comp.config.type,
      title: comp.config.title,
      "x-index": index,
      "x-component": comp.type,
      "x-decorator": "FormItem",
      "x-component-props": {},
      "x-validator": []
    };

    if (Number.isInteger(comp.position)) {
      properties[fieldId]["x-position"] = comp.position;
    }

    // Add specific properties
    if (comp.config.placeholder) {
      properties[fieldId]["x-component-props"].placeholder = comp.config.placeholder;
    }

    if (comp.config.description) {
      properties[fieldId].description = comp.config.description;
    }

    if (comp.config.defaultValue !== undefined && comp.type !== 'Card' && comp.type !== 'Grid' && comp.type !== 'Divider' && comp.type !== 'Collapse') {
      properties[fieldId].default = comp.config.defaultValue;
    }

    if (comp.config.disabled) {
      properties[fieldId]["x-component-props"].disabled = true;
    }

    if (comp.config.readOnly) {
      properties[fieldId]["x-component-props"].readOnly = true;
    }

    if (comp.config.hidden) {
      properties[fieldId]["x-hidden"] = true;
    }

    const visibilityRules = normalizeVisibilityRules(comp.config.visibilityRules);
    if (visibilityRules.length > 0) {
      properties[fieldId]["x-visibility"] = {
        mode: 'conditional',
        match: comp.config.visibilityMatch === 'any' ? 'any' : 'all',
        rules: visibilityRules
      };
    } else if (comp.config.visibilityMode === 'conditional' && comp.config.visibilityField) {
      properties[fieldId]["x-visibility"] = {
        mode: 'conditional',
        match: 'all',
        rules: [
          normalizeVisibilityRule({
            field: comp.config.visibilityField,
            operator: 'equals',
            value: comp.config.visibilityValue
          })
        ]
      };
    }

    if (comp.config.options && comp.config.options.length > 0) {
      properties[fieldId]["x-component-props"].options = normalizeChoiceOptions(comp.config.options);
    }
    
    if (comp.type === 'Cascader') {
      properties[fieldId]["x-component-props"].options = comp.config.options;
    }

    if (comp.type === 'Divider') {
      properties[fieldId]["x-component-props"].content = comp.config.content;
    }
    
    if (comp.type === 'Card') {
      properties[fieldId]["x-component-props"].title = comp.config.showTitle ? comp.config.title : undefined;
      // Handle child components recursively
      if (comp.children && comp.children.length > 0) {
        properties[fieldId].properties = {};
        comp.children.forEach((child, childIndex) => {
          Object.assign(properties[fieldId].properties, generateComponentSchema(child, childIndex));
        });
      }
    }
    
    if (comp.type === 'Grid') {
      properties[fieldId]["x-component-props"].columns = comp.config.columns;
      properties[fieldId]["x-component-props"].title = comp.config.showTitle ? comp.config.title : undefined;
      // Handle child components recursively
      if (comp.children && comp.children.length > 0) {
        properties[fieldId].properties = {};
        comp.children.forEach((child, childIndex) => {
          Object.assign(properties[fieldId].properties, generateComponentSchema(child, childIndex));
        });
      }
    }

    if (comp.type === 'Collapse') {
      properties[fieldId]["x-component-props"].panels = comp.config.panels;
      properties[fieldId]["x-component-props"].direction = comp.config.direction;
    }

    if (comp.config.required) {
      properties[fieldId].required = true;
      properties[fieldId]["x-validator"].push({
        ruleKey: "required"
      });
    }
  });

  state.formSchema.schema.properties = properties;
}

// Generate component schema recursively (including nested components)
function generateComponentSchema(component, index) {
  const fieldId = component.config.name.replace(/[^a-zA-Z0-9]/g, '') + '_' + component.id;
  
  const schema = {
    [fieldId]: {
      name: component.config.name,
      type: component.config.type,
      title: component.config.title,
      "x-index": index,
      "x-component": component.type,
      "x-decorator": "FormItem",
      "x-component-props": {},
      "x-validator": []
    }
  };

  if (Number.isInteger(component.position)) {
    schema[fieldId]["x-position"] = component.position;
  }
  
  // Add specific properties
  if (component.config.placeholder) {
    schema[fieldId]["x-component-props"].placeholder = component.config.placeholder;
  }

  if (component.config.description) {
    schema[fieldId].description = component.config.description;
  }

  if (component.config.defaultValue !== undefined && component.type !== 'Card' && component.type !== 'Grid' && component.type !== 'Divider' && component.type !== 'Collapse') {
    schema[fieldId].default = component.config.defaultValue;
  }

  if (component.config.disabled) {
    schema[fieldId]["x-component-props"].disabled = true;
  }

  if (component.config.readOnly) {
    schema[fieldId]["x-component-props"].readOnly = true;
  }

  if (component.config.hidden) {
    schema[fieldId]["x-hidden"] = true;
  }

  const visibilityRules = normalizeVisibilityRules(component.config.visibilityRules);
  if (visibilityRules.length > 0) {
    schema[fieldId]["x-visibility"] = {
      mode: 'conditional',
      match: component.config.visibilityMatch === 'any' ? 'any' : 'all',
      rules: visibilityRules
    };
  } else if (component.config.visibilityMode === 'conditional' && component.config.visibilityField) {
    schema[fieldId]["x-visibility"] = {
      mode: 'conditional',
      match: 'all',
      rules: [
        normalizeVisibilityRule({
          field: component.config.visibilityField,
          operator: 'equals',
          value: component.config.visibilityValue
        })
      ]
    };
  }
  
  if (component.config.options && component.config.options.length > 0) {
    schema[fieldId]["x-component-props"].options = normalizeChoiceOptions(component.config.options);
  }
  
  if (component.type === 'Cascader') {
    schema[fieldId]["x-component-props"].options = component.config.options;
  }
  
  if (component.type === 'Divider') {
    schema[fieldId]["x-component-props"].content = component.config.content;
  }
  
  if (component.type === 'Card') {
    schema[fieldId]["x-component-props"].title = component.config.showTitle ? component.config.title : undefined;
    // Handle child components recursively
    if (component.children && component.children.length > 0) {
      schema[fieldId].properties = {};
      component.children.forEach((child, childIndex) => {
        Object.assign(schema[fieldId].properties, generateComponentSchema(child, childIndex));
      });
    }
  }
  
  if (component.type === 'Grid') {
    schema[fieldId]["x-component-props"].columns = component.config.columns;
    schema[fieldId]["x-component-props"].title = component.config.showTitle ? component.config.title : undefined;
    // Handle child components recursively
    if (component.children && component.children.length > 0) {
      schema[fieldId].properties = {};
      component.children.forEach((child, childIndex) => {
        Object.assign(schema[fieldId].properties, generateComponentSchema(child, childIndex));
      });
    }
  }
  
  if (component.type === 'Collapse') {
    schema[fieldId]["x-component-props"].panels = component.config.panels;
    schema[fieldId]["x-component-props"].direction = component.config.direction;
  }
  
  if (component.config.required) {
    schema[fieldId].required = true;
    schema[fieldId]["x-validator"].push({
      ruleKey: "required"
    });
  }
  
  return schema;
}

// Select component
function selectComponent(component) {
  state.selectedItem = component;
  renderFormItems();
  renderProperties();
  renderComponentTree(); // Update component tree selection status
}

// Expose to global scope
window.state = state;
window.componentConfigs = componentConfigs;
window.isContainerComponent = isContainerComponent;
window.supportsChoiceOptions = supportsChoiceOptions;
window.normalizeChoiceOption = normalizeChoiceOption;
window.normalizeChoiceOptions = normalizeChoiceOptions;
window.normalizeVisibilityRule = normalizeVisibilityRule;
window.normalizeVisibilityRules = normalizeVisibilityRules;
window.escapeHTML = escapeHTML;
window.escapeAttribute = escapeAttribute;
window.findComponentById = findComponentById;
window.updateSchema = updateSchema;
window.selectComponent = selectComponent;
