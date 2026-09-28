# Data Format Guide

DAG Studio accepts JSON graph data, preserves custom fields, and can interpret a small set of graph-aware fields through per-document field mapping. This guide describes the recommended shape and the current load, mapping, and save behavior.

## Recommended Top-Level Shape

The recommended and simplest format is an object keyed by node key:

```json
{
  "Graph": {
    "define": "A graph is a set of vertices and edges.",
    "children": {
      "Tree": "subtype_of",
      "DAG": "subtype_of"
    }
  },
  "Tree": {
    "define": "A tree is a connected acyclic graph.",
    "parents": {
      "Graph": "subtype_of"
    },
    "children": {
      "Binary_Tree": "subtype_of"
    }
  },
  "Binary_Tree": {
    "define": "A tree where each node has at most two children.",
    "parents": {
      "Tree": "subtype_of"
    }
  }
}
```

If you are creating data from scratch, prefer this keyed-object form.

## Graph-Aware Fields

Each node is just a JSON object. DAG Studio treats only a small set of fields as graph-aware:

- `children`: downstream node references
- `parents`: upstream node references
- `define`: main description shown in the node card and node viewer
- `title`: optional display text for the node title
- `type`: optional category used for node color grouping

All other fields are preserved as-is and remain visible in `View Node`.

If you are creating data from scratch, these default field names are still the recommended schema.

Example:

```json
{
  "Linear_Space": {
    "title": "Linear Space",
    "define": "A vector space over a field.",
    "parents": {},
    "children": {
      "Affine_Space": "defined_on"
    },
    "aliases": ["vector space"],
    "tags": ["algebra", "geometry"],
    "metadata": {
      "difficulty": "medium",
      "domain": "mathematics"
    }
  }
}
```

## Relationship Forms

Both `children` and `parents` support two shapes.

### Array Form

Use this when you only care about structure:

```json
{
  "A": {
    "children": ["B", "C"]
  },
  "B": {
    "parents": ["A"]
  },
  "C": {
    "parents": ["A"]
  }
}
```

### Object Form

Use this when you also want edge labels:

```json
{
  "A": {
    "children": {
      "B": "subtype_of",
      "C": "depends_on"
    }
  },
  "B": {
    "parents": {
      "A": "subtype_of"
    }
  },
  "C": {
    "parents": {
      "A": "depends_on"
    }
  }
}
```

Object form is usually the better choice because edge labels can be shown in the graph.

## Supported Top-Level Inputs

The keyed-object format is recommended, but two additional input shapes are accepted.

### Array of Nodes

```json
[
  {
    "key": "A",
    "define": "Node A",
    "children": ["B"]
  },
  {
    "key": "B",
    "define": "Node B"
  }
]
```

### Wrapper Object with `nodes`

```json
{
  "nodes": [
    {
      "key": "A",
      "children": ["B"]
    },
    {
      "key": "B"
    }
  ]
}
```

## Field Mapping

DAG Studio can interpret alternate field names for the graph-aware roles above.

For example, this document can be read without renaming its JSON keys:

```json
{
  "A": {
    "label": "Alpha",
    "description": "Root node",
    "next": {
      "B": "related_to"
    },
    "kind": "service"
  },
  "B": {
    "prev": {
      "A": "related_to"
    }
  }
}
```

In that case, DAG Studio may infer a mapping like:

- `title -> label`
- `define -> description`
- `children -> next`
- `parents -> prev`
- `type -> kind`

Important behavior notes:

- mapping is interpreted per opened document, not as one global schema for every file
- changing mapping changes how the current document is interpreted in the UI
- saving does not rename your JSON fields to system names
- node viewer labels prefer the real JSON field name and only append the semantic role when helpful, such as `description (define)`

## Load and Save Behavior

Loading performs only light structural normalization:

- top-level keyed objects, arrays of nodes, and `{ "nodes": [...] }` wrappers are accepted
- array entries use their `key` field as the node key
- keyed-object entries are copied as node records and receive an internal `key` value matching the outer key
- custom fields are preserved

Saving preserves the document's active field names:

- if the document uses `children`, it saves `children`
- if the document uses `next`, it saves `next`
- if a node never had a relation field, saving does not add an empty one just because the mapping defines that role

## Relationship Interpretation

The app interprets graph relationships from whichever fields are mapped to `children` and `parents`.

Behavior notes:

- `children` and `parents` both accept array form and object form
- root detection uses both explicit parent links and incoming edges inferred from child links
- a file that only defines `children` can still render correctly
- UI edits keep parent and child links synchronized once you mutate the graph in `Edit` mode

For clarity and portability, explicitly storing both directions is still recommended, but it is no longer required just to get correct rendering.

## Rendering Notes

- node title is chosen from `title` or the node key
- node subtitle is derived from `define`
- edge labels come from relation values in the fields mapped to `children` or `parents`
- card backgrounds stay neutral for readability, even when `type` color grouping is active

## Node Color Grouping

If a node includes a `type` field, DAG Studio groups nodes by unique `type` value and assigns each category its own accent color.

- nodes with the same `type` share the same accent
- accents affect borders, pins, and active states
- if no nodes define `type`, default styling is used

Example:

```json
{
  "Model_Registry": {
    "type": "data",
    "children": {
      "Online_Inference": "deploys_to"
    }
  },
  "Online_Inference": {
    "type": "service"
  }
}
```

## Minimal Example

```json
{
  "A": {
    "define": "Root node",
    "children": {
      "B": "related_to",
      "C": "related_to"
    }
  },
  "B": {
    "define": "Child node B"
  },
  "C": {
    "define": "Child node C"
  }
}
```

## Recommendations for Data Authors

- use stable, unique keys
- prefer the keyed-object top-level format
- prefer object-form child relations if edge labels matter
- use a single consistent schema within one document
- if you use custom field names, keep the mapping stable across the dataset
- use the mapped `define` role for the main readable description
- keep additional metadata in custom fields instead of overloading relation fields
